import { db, events } from "@/db";
import { and, eq, inArray, isNull } from "drizzle-orm";
import { newId } from "./ids";
import { getSettings } from "./settings";
import { todayAms } from "./dates";
import { isCoworkingDay } from "./coworking";
import {
  parseIcs,
  locationVerdict,
  officeNeedles,
  guessType,
  amsDateFmt,
  amsTimeFmt,
} from "./luma-feed";
import { absorbExistingBookings } from "./coworking-guests";

// Sync events from the public Luma calendar ICS feed. Luma stays the events
// platform (promotion, RSVPs); the app only mirrors title/date/time so
// attendance can be counted against them for M&E. No API key needed.
//
// The feed is the *national* calendar, so most of what's on it happens
// somewhere else entirely — Utrecht, Rotterdam, Tilburg, a university café, a
// meetup.com page. Only the events at our address are mirrored here: the rest
// aren't in the room, can't be checked into, mustn't pad the event figure EAN
// reports, and — where the title says "co-working" — would otherwise shut the
// office and turn people's desks out for a day happening in another city.

export type LumaSyncResult = {
  ok: boolean;
  created: number;
  updated: number;
  /** Feed entries at a real address that isn't ours, by location. */
  skipped: { location: string; count: number }[];
  /** New entries whose location settles nothing, waiting on an admin. */
  queued: number;
  /** Events we already hold that the feed now places at another address. */
  movedAway: { id: string; title: string; date: string; location: string }[];
  total: number;
  error?: string;
};

const EMPTY: Omit<LumaSyncResult, "ok" | "error"> = {
  created: 0,
  updated: 0,
  skipped: [],
  queued: 0,
  movedAway: [],
  total: 0,
};

export async function syncLuma(): Promise<LumaSyncResult> {
  const cfg = await getSettings();
  if (!cfg.luma_ics_url) {
    return { ok: false, ...EMPTY, error: "No Luma feed URL configured in settings." };
  }
  let ics: string;
  try {
    const res = await fetch(cfg.luma_ics_url, {
      headers: { "user-agent": "ean-office-app" },
      signal: AbortSignal.timeout(15000),
    });
    if (!res.ok) throw new Error(`Luma feed returned ${res.status}`);
    ics = await res.text();
  } catch (err) {
    return {
      ok: false, ...EMPTY,
      error: err instanceof Error ? err.message : "Fetch failed",
    };
  }

  const parsed = parseIcs(ics);
  const needles = officeNeedles(cfg.luma_office_locations);
  let created = 0;
  let updated = 0;
  let queued = 0;
  const skipped = new Map<string, number>();
  const movedAway: LumaSyncResult["movedAway"] = [];
  for (const ev of parsed) {
    const verdict = locationVerdict(ev.location, needles);
    if (verdict === "elsewhere") {
      // Grouped by the location itself, because the fix for a venue that is
      // ours but written unfamiliarly is to add that string to the setting,
      // and you can only do that if you can see what the feed actually says.
      const where = ev.location ?? "no location given";
      skipped.set(where, (skipped.get(where) ?? 0) + 1);
      // It may still be one we took in before this check existed, or a venue
      // that has since moved out of the building. Say so rather than deleting
      // it here: a feed that briefly drops its locations would take real guest
      // lists and attendance with it, and an admin can remove the row in one
      // click once they've seen which event it is.
      const [held] = await db
        .select({ id: events.id, title: events.title, date: events.date })
        .from(events)
        .where(and(eq(events.externalId, ev.uid), eq(events.source, "luma")));
      if (held) movedAway.push({ ...held, location: where });
      continue;
    }
    const date = amsDateFmt.format(ev.start);
    const startsAt = ev.allDay ? null : amsTimeFmt.format(ev.start);
    const endsAt = ev.end && !ev.allDay ? amsTimeFmt.format(ev.end) : null;

    let [existing] = await db
      .select()
      .from(events)
      .where(eq(events.externalId, ev.uid));

    // A co-working day is usually proposed here first and promoted on Luma
    // after, so the feed arrives carrying an event we already have. Matching
    // only on externalId made a second row for the same day — two pages, two
    // guest lists, one room. Adopt the row we've got instead: it owns the
    // organiser, the guest list and the proposal, and Luma brings the page.
    if (!existing) {
      const type = guessType(ev.title);
      if (isCoworkingDay(type)) {
        [existing] = await db
          .select()
          .from(events)
          .where(
            and(
              eq(events.date, date),
              eq(events.type, type),
              isNull(events.externalId),
              // A day that was called off or turned down isn't the one the
              // feed is talking about.
              inArray(events.status, ["proposed", "confirmed"])
            )
          );
        if (existing) {
          await db
            .update(events)
            .set({ externalId: ev.uid })
            .where(eq(events.id, existing.id));
        }
      }
    }

    if (existing) {
      // Refresh what Luma owns; never touch what admins set here
      // (type, cause area, headcount, organiser).
      //
      // `status` is on that list, and deliberately so. When the feed can't say
      // where an event is, an admin answers for it — and that answer has to
      // outlive every later sync, because the Luma page it disagrees with is
      // often one nobody here can edit. Re-reading the feed must never undo
      // someone's "yes, that one was in our room".
      //
      // The feed only carries a page URL when the description happens to
      // contain one, so a missing one means "the feed didn't say", not "there
      // is no page". Keeping what we have matters: on a co-working day the URL
      // is what decides where sign-ups go, and dropping it would quietly move
      // them back here mid-promotion. Clearing it is done by hand.
      const url = ev.url ?? existing.url;
      if (
        existing.title !== ev.title ||
        existing.date !== date ||
        existing.startsAt !== startsAt ||
        existing.endsAt !== endsAt ||
        existing.url !== url ||
        existing.location !== ev.location
      ) {
        await db
          .update(events)
          .set({ title: ev.title, date, startsAt, endsAt, url, location: ev.location })
          .where(eq(events.id, existing.id));
        updated++;
      }
    } else {
      const type = guessType(ev.title);
      // An event the feed can't place goes in as a proposal rather than a
      // fact. `proposed` already means "no member sees it, no report counts
      // it, an admin decides" everywhere in the app, so this needs no new
      // filtering — and forgetting one such filter is exactly how events that
      // weren't in the room got counted as if they were.
      const status = verdict === "office" ? "confirmed" : "proposed";
      const [inserted] = await db
        .insert(events)
        .values({
          id: newId("ev"),
          title: ev.title,
          date,
          startsAt,
          endsAt,
          type,
          organiser: "ean",
          source: "luma",
          externalId: ev.uid,
          url: ev.url,
          location: ev.location,
          status,
        })
        .returning();
      if (status === "proposed") queued++;
      else created++;
      // A synced co-working day closes its day to booking the moment it
      // lands, so it owes the same courtesy as one an admin confirms: the
      // people already booked keep their desks and hear about it. A proposed
      // one closes nothing yet, so it displaces nobody until it's confirmed.
      if (status === "confirmed" && isCoworkingDay(type) && date >= todayAms()) {
        await absorbExistingBookings(inserted);
      }
    }
  }
  return {
    ok: true,
    created,
    updated,
    queued,
    movedAway,
    total: parsed.length,
    skipped: [...skipped]
      .map(([location, count]) => ({ location, count }))
      .sort((a, b) => b.count - a.count),
  };
}

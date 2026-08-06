import { db, events } from "@/db";
import { eq } from "drizzle-orm";
import { newId } from "./ids";
import { getSettings } from "./settings";
import { TZ, todayAms } from "./dates";
import { isCoworkingDay } from "./coworking";
import { absorbExistingBookings } from "./coworking-guests";

// Sync events from the public Luma calendar ICS feed. Luma stays the events
// platform (promotion, RSVPs); the app only mirrors title/date/time so
// attendance can be counted against them for M&E. No API key needed.

type IcsEvent = {
  uid: string;
  title: string;
  start: Date;
  end: Date | null;
  allDay: boolean;
  url: string | null;
};

function unescapeIcs(s: string): string {
  return s
    .replace(/\\n/g, " ")
    .replace(/\\,/g, ",")
    .replace(/\\;/g, ";")
    .replace(/\\\\/g, "\\")
    .trim();
}

function parseIcsDate(value: string): { date: Date; allDay: boolean } | null {
  // 20240622T090000Z (UTC), 20240622T090000 (floating), or 20240622 (all-day)
  let m = value.match(/^(\d{4})(\d{2})(\d{2})T(\d{2})(\d{2})(\d{2})(Z?)$/);
  if (m) {
    const [, y, mo, d, h, mi, s, z] = m;
    const iso = `${y}-${mo}-${d}T${h}:${mi}:${s}${z ? "Z" : "+02:00"}`;
    return { date: new Date(iso), allDay: false };
  }
  m = value.match(/^(\d{4})(\d{2})(\d{2})$/);
  if (m) {
    const [, y, mo, d] = m;
    return { date: new Date(`${y}-${mo}-${d}T12:00:00Z`), allDay: true };
  }
  return null;
}

export function parseIcs(ics: string): IcsEvent[] {
  // Unfold continuation lines, then walk VEVENT blocks.
  const unfolded = ics.replace(/\r?\n[ \t]/g, "");
  const blocks = unfolded.split("BEGIN:VEVENT").slice(1);
  const out: IcsEvent[] = [];
  for (const block of blocks) {
    const body = block.split("END:VEVENT")[0];
    const prop = (name: string): string | null => {
      const m = body.match(new RegExp(`^${name}(?:;[^:\\r\\n]*)?:(.*)$`, "m"));
      return m ? m[1].trim() : null;
    };
    const uid = prop("UID");
    const summary = prop("SUMMARY");
    const dtstart = prop("DTSTART");
    if (!uid || !summary || !dtstart) continue;
    const start = parseIcsDate(dtstart);
    if (!start) continue;
    const dtend = prop("DTEND");
    const end = dtend ? parseIcsDate(dtend) : null;
    const description = prop("DESCRIPTION") ?? "";
    const urlMatch = description.match(/https:\/\/(?:lu\.ma|luma\.com)\/[A-Za-z0-9-]+/);
    const url =
      urlMatch && !urlMatch[0].endsWith("/eanetherlands") ? urlMatch[0] : null;
    out.push({
      uid,
      title: unescapeIcs(summary),
      start: start.date,
      end: end?.date ?? null,
      allDay: start.allDay,
      url,
    });
  }
  return out;
}

const amsDateFmt = new Intl.DateTimeFormat("en-CA", {
  timeZone: TZ,
  year: "numeric",
  month: "2-digit",
  day: "2-digit",
});
const amsTimeFmt = new Intl.DateTimeFormat("en-GB", {
  timeZone: TZ,
  hour: "2-digit",
  minute: "2-digit",
  hour12: false,
});

/** Best-effort event type from the title; admins can correct it. */
export function guessType(title: string): typeof events.$inferInsert.type {
  const t = title.toLowerCase();
  if (/co-?working/.test(t)) return "themed_coworking";
  if (/(borrel|social|drinks|dinner|poker|party|picnic|bbq)/.test(t)) return "social";
  if (/reading group|book club/.test(t)) return "reading_group";
  if (/workshop|hackathon/.test(t)) return "workshop";
  if (/unconference/.test(t)) return "unconference";
  if (/(talk|lecture|presentation|q&a|panel)/.test(t)) return "talk";
  return "other";
}

export async function syncLuma(): Promise<{
  ok: boolean;
  created: number;
  updated: number;
  total: number;
  error?: string;
}> {
  const cfg = await getSettings();
  if (!cfg.luma_ics_url) {
    return { ok: false, created: 0, updated: 0, total: 0, error: "No Luma feed URL configured in settings." };
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
      ok: false, created: 0, updated: 0, total: 0,
      error: err instanceof Error ? err.message : "Fetch failed",
    };
  }

  const parsed = parseIcs(ics);
  let created = 0;
  let updated = 0;
  for (const ev of parsed) {
    const date = amsDateFmt.format(ev.start);
    const startsAt = ev.allDay ? null : amsTimeFmt.format(ev.start);
    const endsAt = ev.end && !ev.allDay ? amsTimeFmt.format(ev.end) : null;

    const [existing] = await db
      .select()
      .from(events)
      .where(eq(events.externalId, ev.uid));
    if (existing) {
      // Refresh what Luma owns; never touch what admins set here
      // (type, cause area, headcount, organiser).
      if (
        existing.title !== ev.title ||
        existing.date !== date ||
        existing.startsAt !== startsAt ||
        existing.endsAt !== endsAt ||
        existing.url !== ev.url
      ) {
        await db
          .update(events)
          .set({ title: ev.title, date, startsAt, endsAt, url: ev.url })
          .where(eq(events.id, existing.id));
        updated++;
      }
    } else {
      const type = guessType(ev.title);
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
        })
        .returning();
      created++;
      // A synced co-working day closes its day to booking the moment it
      // lands, so it owes the same courtesy as one an admin confirms: the
      // people already booked keep their desks and hear about it.
      if (isCoworkingDay(type) && date >= todayAms()) {
        await absorbExistingBookings(inserted);
      }
    }
  }
  return { ok: true, created, updated, total: parsed.length };
}

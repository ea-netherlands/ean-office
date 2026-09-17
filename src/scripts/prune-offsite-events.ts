/**
 * Undo what the Luma sync took in before it knew where its events happened.
 *
 * Two jobs, because the old sync made two kinds of mess:
 *   - events at a real address that isn't ours  -> deleted;
 *   - events the feed can't place at all        -> demoted to proposals, so
 *     they queue up under "Where were these?" instead of standing as fact.
 *
 * The second job matters on a database that synced before the fix. New
 * unplaceable events arrive as proposals on their own, but ones already in
 * the table are `confirmed`, and sync deliberately never rewrites a status —
 * an admin's answer has to outlive the feed. So nothing but this script will
 * move them.
 *
 * The feed is EAN's national calendar, and until the office check landed every
 * entry on it became an event "at the office" — Utrecht workshops, Rotterdam
 * socials, meetup.com drinks, a careers fair with nothing but a website for an
 * address. They padded What's on, they padded the event figure EAN reports,
 * and the ones whose titles said "co-working" closed the office for a day
 * happening in another city.
 *
 *   npx tsx src/scripts/prune-offsite-events.ts          # dry run, lists them
 *   npx tsx src/scripts/prune-offsite-events.ts --delete # actually removes
 *
 * Only ever touches rows the sync created (source = "luma") and only those the
 * feed still places away from the office. Anything a human has since put work
 * into is kept and reported instead of deleted: attendance records, a guest
 * list, an admin-set headcount or cause area, a cancellation note. Deleting
 * those would take real history with them, and a reporting period shouldn't
 * quietly change shape. Decide those by hand in /admin/events.
 */
import { db, events, eventAttendance, eventGuests, ensureMigrated } from "@/db";
import { eq, inArray } from "drizzle-orm";
import { parseIcs, locationVerdict, officeNeedles } from "@/lib/luma-feed";
import { getSettings } from "@/lib/settings";

async function main() {
  const doDelete = process.argv.includes("--delete");
  await ensureMigrated();
  const cfg = await getSettings();
  if (!cfg.luma_ics_url) throw new Error("No Luma feed URL configured.");

  const res = await fetch(cfg.luma_ics_url, {
    headers: { "user-agent": "ean-office-app" },
    signal: AbortSignal.timeout(30000),
  });
  if (!res.ok) throw new Error(`Luma feed returned ${res.status}`);
  const feed = parseIcs(await res.text());
  const needles = officeNeedles(cfg.luma_office_locations);
  if (needles.length === 0) {
    throw new Error("No office locations configured — every event would look off-site.");
  }

  // What the feed says about each entry we might hold.
  const byUid = new Map(feed.map((e) => [e.uid, e]));

  const synced = await db.select().from(events).where(eq(events.source, "luma"));
  const offsite = synced.filter((e) => {
    const fromFeed = e.externalId ? byUid.get(e.externalId) : undefined;
    // An entry the feed no longer carries is left alone: absence isn't
    // evidence of a venue, and a past event drops off the calendar in time.
    if (!fromFeed) return false;
    // Only events the feed places at a real address that isn't ours. One it
    // can't place at all is a question for an admin, not a row to delete —
    // those sit as proposals in /admin/events and are already invisible.
    return locationVerdict(fromFeed.location, needles) === "elsewhere";
  });

  if (offsite.length === 0) {
    console.log(
      "Nothing to prune: no synced event sits at an address that isn't ours."
    );
    return;
  }

  const ids = offsite.map((e) => e.id);
  const attendance = await db
    .select({ eventId: eventAttendance.eventId })
    .from(eventAttendance)
    .where(inArray(eventAttendance.eventId, ids));
  const guests = await db
    .select({ eventId: eventGuests.eventId })
    .from(eventGuests)
    .where(inArray(eventGuests.eventId, ids));
  const hasData = new Set([
    ...attendance.map((a) => a.eventId),
    ...guests.map((g) => g.eventId),
  ]);

  /** Signs a human has worked on this row, so it isn't ours to delete. */
  const touched = (e: (typeof offsite)[number]): string[] => {
    const why: string[] = [];
    if (hasData.has(e.id)) why.push("attendance or guest list");
    if (e.headcount !== null) why.push("headcount entered");
    if (e.causeArea) why.push("cause area set");
    if (e.status === "cancelled") why.push("cancelled by hand");
    if (e.displacedUserIds && e.displacedUserIds.length > 0)
      why.push("cleared the office for people");
    return why;
  };

  const removable = offsite.filter((e) => touched(e).length === 0);
  const keep = offsite.filter((e) => touched(e).length > 0);

  // Job two: rows standing as confirmed office events on a location that
  // never said where they were. Demoted, not deleted — the answer is a click
  // away in /admin/events and the event may well have been here.
  const unplaced = synced.filter((e) => {
    if (e.status !== "confirmed") return false;
    const fromFeed = e.externalId ? byUid.get(e.externalId) : undefined;
    if (!fromFeed) return false;
    if (locationVerdict(fromFeed.location, needles) !== "unknown") return false;
    // Same restraint as above: once someone has worked on a row, it stops
    // being ours to move.
    return touched(e).length === 0;
  });

  console.log(
    `${synced.length} synced events, ${offsite.length} of them off-site ` +
      `(${removable.length} untouched, ${keep.length} carrying data).\n`
  );

  console.log("-- untouched, safe to remove --");
  for (const e of removable) {
    const where = e.externalId ? byUid.get(e.externalId)!.location : "";
    console.log(`  ${e.date}  ${e.title}\n             ${where}`);
  }

  if (keep.length > 0) {
    console.log("\n-- kept: someone has worked on these, decide by hand --");
    for (const e of keep) {
      const where = e.externalId ? byUid.get(e.externalId)!.location : "";
      console.log(`  ${e.date}  ${e.title}  [${touched(e).join(", ")}]\n             ${where}`);
    }
  }

  if (unplaced.length > 0) {
    console.log(
      `\n-- ${unplaced.length} confirmed on a location that says nothing; ` +
        `to be queued for an admin --`
    );
    for (const e of unplaced.slice(0, 10)) {
      const where = byUid.get(e.externalId!)!.location ?? "no location given";
      console.log(`  ${e.date}  ${e.title.slice(0, 50)}\n             ${where}`);
    }
    if (unplaced.length > 10) console.log(`  …and ${unplaced.length - 10} more`);
  }

  if (!doDelete) {
    console.log(
      `\nDry run. Re-run with --delete to remove the ${removable.length} untouched ` +
        `off-site ones and queue the ${unplaced.length} unplaceable ones.`
    );
    return;
  }
  if (removable.length > 0) {
    await db.delete(events).where(inArray(events.id, removable.map((e) => e.id)));
  }
  if (unplaced.length > 0) {
    await db
      .update(events)
      .set({ status: "proposed" })
      .where(inArray(events.id, unplaced.map((e) => e.id)));
  }
  console.log(
    `\nDeleted ${removable.length}, queued ${unplaced.length}. ` +
      `Left ${keep.length} for a human.`
  );
}

main().then(
  () => process.exit(0),
  (err) => {
    console.error(err);
    process.exit(1);
  }
);

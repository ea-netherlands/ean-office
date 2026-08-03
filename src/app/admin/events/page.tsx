import { db, events, eventAttendance, users } from "@/db";
import { desc, inArray } from "drizzle-orm";
import { Page, H1, Sub } from "@/components/ui";
import { EventsClient, EventRow } from "./events-client";
import { todayAms, amsDate } from "@/lib/dates";

export const dynamic = "force-dynamic";

export default async function EventsPage() {
  const all = await db.select().from(events).orderBy(desc(events.date));
  const attendance =
    all.length > 0
      ? await db
          .select()
          .from(eventAttendance)
          .where(inArray(eventAttendance.eventId, all.map((e) => e.id)))
      : [];

  const proposerNames = new Map(
    (
      await db.select({ id: users.id, name: users.name, email: users.email }).from(users)
    ).map((u) => [u.id, { name: u.name, email: u.email }])
  );

  const rows: EventRow[] = all.map((e) => {
    const forEvent = attendance.filter((a) => a.eventId === e.id);
    return {
      id: e.id,
      title: e.title,
      date: e.date,
      startsAt: e.startsAt,
      endsAt: e.endsAt,
      type: e.type,
      causeArea: e.causeArea,
      organiser: e.organiser,
      expectedAttendance: e.expectedAttendance,
      headcount: e.headcount,
      source: e.source,
      url: e.url,
      status: e.status,
      proposalNote: e.proposalNote,
      proposedBy: e.createdBy ? proposerNames.get(e.createdBy)?.name ?? null : null,
      proposedByEmail: e.createdBy ? proposerNames.get(e.createdBy)?.email ?? null : null,
      questionAskedAt: e.questionAskedAt ? amsDate(e.questionAskedAt) : null,
      checkins: forEvent.filter((a) => a.source === "checkin").length,
      manual: forEvent.filter((a) => a.source === "manual").length,
      rsvps: forEvent.filter((a) => a.source === "rsvp").length,
      past: e.date < todayAms(),
    };
  });

  return (
    <Page wide>
      <H1>Events</H1>
      <Sub>
        A counter, not a platform — events sync from the Luma calendar daily
        (promotion and RSVPs stay on Luma). Check the guessed type, and type a
        headcount after each event. Attendance also comes from the check-in QR.
      </Sub>
      <EventsClient rows={rows} />
    </Page>
  );
}

import { db, events, eventAttendance } from "@/db";
import { desc, inArray } from "drizzle-orm";
import { Page, H1, Sub } from "@/components/ui";
import { EventsClient, EventRow } from "./events-client";
import { todayAms } from "@/lib/dates";

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
        A counter, not a platform — Luma and Slack stay in charge of promotion.
        Attendance comes from the check-in QR, or type a headcount afterwards.
      </Sub>
      <EventsClient rows={rows} />
    </Page>
  );
}

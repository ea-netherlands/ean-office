import { db, events, eventAttendance, eventGuests, users, bookings } from "@/db";
import { and, desc, eq, inArray } from "drizzle-orm";
import { Page, H1, Sub } from "@/components/ui";
import { EventsClient, EventRow } from "./events-client";
import { todayAms, amsDate } from "@/lib/dates";
import { isCoworkingDay } from "@/lib/coworking";

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

  // Confirming a co-working day closes its whole day to booking, so the queue
  // has to show what that would displace before anyone presses the button.
  const coworkingDates = [
    ...new Set(all.filter((e) => isCoworkingDay(e.type)).map((e) => e.date)),
  ];
  const bookedPerDate = new Map<string, Set<string>>();
  if (coworkingDates.length > 0) {
    const held = await db
      .select({ date: bookings.date, userId: bookings.userId })
      .from(bookings)
      .where(
        and(inArray(bookings.date, coworkingDates), eq(bookings.status, "booked"))
      );
    // People, not bookings — a half-day pair is one person with two rows.
    for (const b of held) {
      const set = bookedPerDate.get(b.date) ?? new Set<string>();
      set.add(b.userId);
      bookedPerDate.set(b.date, set);
    }
  }
  const guestCounts = new Map<string, { pending: number; approved: number }>();
  if (coworkingDates.length > 0) {
    const guests = await db
      .select({ eventId: eventGuests.eventId, status: eventGuests.status })
      .from(eventGuests);
    for (const g of guests) {
      const entry = guestCounts.get(g.eventId) ?? { pending: 0, approved: 0 };
      if (g.status === "pending") entry.pending++;
      if (g.status === "approved") entry.approved++;
      guestCounts.set(g.eventId, entry);
    }
  }

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
      cancelReason: e.cancelReason,
      cancelledByName: e.cancelledBy
        ? proposerNames.get(e.cancelledBy)?.name ?? null
        : null,
      checkins: forEvent.filter((a) => a.source === "checkin").length,
      manual: forEvent.filter((a) => a.source === "manual").length,
      rsvps: forEvent.filter((a) => a.source === "rsvp").length,
      past: e.date < todayAms(),
      bookedThatDay: isCoworkingDay(e.type)
        ? bookedPerDate.get(e.date)?.size ?? 0
        : 0,
      guestsPending: guestCounts.get(e.id)?.pending ?? 0,
      guestsApproved: guestCounts.get(e.id)?.approved ?? 0,
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

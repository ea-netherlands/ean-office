import { redirect, notFound } from "next/navigation";
import { db, events, eventGuests, users, bookings } from "@/db";
import { and, desc, eq, inArray } from "drizzle-orm";
import { getCurrentUser, isAdmin, appUrl } from "@/lib/auth";
import { Nav } from "@/components/nav";
import { Page, H1, Sub } from "@/components/ui";
import { formatDay, formatDayLong, todayAms } from "@/lib/dates";
import { describeSeat } from "@/lib/booking";
import { asSlot, SLOT_LABEL } from "@/lib/slots";
import { coworkingSpots } from "@/lib/coworking-guests";
import { isCoworkingDay } from "@/lib/coworking";
import { GuestsClient, GuestRow } from "./guests-client";

export const dynamic = "force-dynamic";

export default async function EventGuestsPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const user = await getCurrentUser();
  if (!user) redirect(`/login?next=/events/${id}/guests`);

  const [event] = await db.select().from(events).where(eq(events.id, id));
  if (!event) notFound();

  const canManage = isAdmin(user) || event.createdBy === user.id;
  if (!canManage) redirect("/");

  const rows = await db
    .select({ g: eventGuests, u: users })
    .from(eventGuests)
    .innerJoin(users, eq(users.id, eventGuests.userId))
    .where(eq(eventGuests.eventId, id))
    .orderBy(desc(eventGuests.createdAt));

  // Which of them actually hold a desk that day — an approval that couldn't
  // find a seat shouldn't look the same as one that did.
  const seats = new Map<string, string>();
  if (rows.length > 0) {
    const held = await db
      .select()
      .from(bookings)
      .where(
        and(
          eq(bookings.date, event.date),
          eq(bookings.status, "booked"),
          inArray(
            bookings.userId,
            rows.map((r) => r.u.id)
          )
        )
      );
    // Two people can hold the same desk across a half-day handover, so the
    // hours belong in the label or the list reads like a double-booking.
    for (const b of held) {
      const slot = asSlot(b.slot);
      seats.set(
        b.userId,
        slot === "day" ? describeSeat(b) : `${describeSeat(b)} (${SLOT_LABEL[slot]})`
      );
    }
  }

  const guests: GuestRow[] = rows.map((r) => ({
    id: r.g.id,
    name: r.u.name,
    email: r.u.email,
    status: r.g.status,
    accessibilityNotes: r.g.accessibilityNotes,
    createdAt: r.g.createdAt.toISOString(),
    seat: seats.get(r.u.id) ?? null,
    /** They'd booked the day before it became a co-working day. */
    wasAlreadyBooked: r.g.decidedBy === "already_booked",
  }));

  const spots = await coworkingSpots(event.date);

  return (
    <>
      <Nav user={user} />
      <Page>
        <H1>{event.title}</H1>
        <Sub>
          {formatDayLong(event.date)}
          {event.startsAt
            ? ` · ${event.startsAt}${event.endsAt ? `–${event.endsAt}` : ""}`
            : ""}{" "}
          · you decide who&apos;s in.
        </Sub>
        <GuestsClient
          guests={guests}
          spots={spots}
          shareUrl={`${appUrl()}/events/${event.id}/rsvp`}
          open={isCoworkingDay(event.type) && event.status === "confirmed" && event.date >= todayAms()}
          event={{
            id: event.id,
            title: event.title,
            dateLabel: formatDay(event.date),
            coworking: isCoworkingDay(event.type),
            cancellable: event.status === "confirmed" && event.date >= todayAms(),
            cancelledReason: event.status === "cancelled" ? event.cancelReason : null,
          }}
        />
      </Page>
    </>
  );
}

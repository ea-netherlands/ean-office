// Database side of co-working days: who has a spot, who keeps the one they
// already had, and how an approved guest actually gets a desk.

import { db, bookings, eventGuests, events, users } from "@/db";
import { and, eq, inArray } from "drizzle-orm";
import { newId } from "./ids";
import { getSettings, Settings } from "./settings";
import { coworkingSpotCount } from "./coworking";
import {
  bookDay,
  cancelBooking,
  cancelUrl,
  capacityForDay,
  describeSeat,
} from "./booking";
import { sendEmail, link } from "./email";
import { appUrl } from "./auth";
import { formatDayLong, todayAms } from "./dates";

export type Spots = { total: number; taken: number; left: number };

/**
 * How much of the room is spoken for on a co-working day. Counted at the
 * fuller of the two halves, not as a total of bookings: a morning and an
 * afternoon person share one seat, and what the organiser wants to know is
 * how many people are in the room at once.
 */
export async function coworkingSpots(
  date: string,
  known?: Settings
): Promise<Spots> {
  const cfg = known ?? (await getSettings());
  const total = coworkingSpotCount(cfg);
  const cap = await capacityForDay(date, cfg);
  const taken = Math.max(
    cap.am.desksBooked + cap.am.flexBooked,
    cap.pm.desksBooked + cap.pm.flexBooked
  );
  return { total, taken, left: Math.max(0, total - taken) };
}

/** Everyone already holding a desk on a day, with their booking. */
export async function bookedThatDay(date: string) {
  return db
    .select({ booking: bookings, user: users })
    .from(bookings)
    .innerJoin(users, eq(users.id, bookings.userId))
    .where(and(eq(bookings.date, date), eq(bookings.status, "booked")));
}

/**
 * Confirming a co-working day closes the day to general booking — but people
 * who booked before that happened keep their desks. They're added to the
 * guest list as approved (so the organiser can see who's already in the room)
 * and told what's happening, with the usual one-tap cancel if they'd rather
 * not be part of it.
 */
export async function absorbExistingBookings(event: {
  id: string;
  title: string;
  date: string;
  startsAt: string | null;
  endsAt: string | null;
  createdBy: string | null;
}): Promise<number> {
  const existing = await bookedThatDay(event.date);
  if (existing.length === 0) return 0;

  const alreadyGuests = new Set(
    (
      await db
        .select({ userId: eventGuests.userId })
        .from(eventGuests)
        .where(eq(eventGuests.eventId, event.id))
    ).map((g) => g.userId)
  );

  const when = event.startsAt
    ? `${event.startsAt}${event.endsAt ? `–${event.endsAt}` : ""}`
    : "during the day";

  let absorbed = 0;
  for (const { booking, user } of existing) {
    if (!alreadyGuests.has(user.id)) {
      await db.insert(eventGuests).values({
        id: newId("eg"),
        eventId: event.id,
        userId: user.id,
        status: "approved",
        guidelinesAcceptedAt: user.guidelinesAcceptedAt ?? new Date(),
        decidedBy: "already_booked",
        decidedAt: new Date(),
      });
      alreadyGuests.add(user.id);
      absorbed++;
    }
    if (user.id === event.createdBy) continue; // the organiser knows
    await sendEmail({
      to: user.email,
      subject: `${formatDayLong(event.date)}: ${event.title} at the office`,
      kind: "coworking_day_absorbed",
      html: `<p>Hi ${user.name},</p>
<p>You've got <strong>${describeSeat(booking)}</strong> booked for ${formatDayLong(event.date)}, and that day is now a co-working day at the office: <strong>${event.title}</strong>, ${when}.</p>
<p><strong>Your desk is still yours</strong> — nothing to do, just come as planned. The day is closed to new general bookings, so the room will be mostly people there for the co-working day.</p>
<p>Would rather pick another day? ${link(cancelUrl(booking), "Cancel in one tap")} and book a different one from ${link(`${appUrl()}/book`, "the calendar")}.</p>`,
    });
  }
  return absorbed;
}

/**
 * The other way to confirm a co-working day: take the space back. Everyone
 * booked that day (bar the organiser, who keeps their seat and runs it) has
 * their booking cancelled and gets an apology explaining why.
 *
 * Not reversible from the app — the bookings are properly cancelled, so the
 * admin UI asks before doing it. Waitlisted rows go too, and nothing is
 * promoted into the freed desks: the whole point is an empty day.
 */
export async function clearDayForCoworking(event: {
  id: string;
  title: string;
  date: string;
  startsAt: string | null;
  endsAt: string | null;
  createdBy: string | null;
}): Promise<{ cleared: number; names: string[] }> {
  const held = await db
    .select({ booking: bookings, user: users })
    .from(bookings)
    .innerJoin(users, eq(users.id, bookings.userId))
    .where(
      and(
        eq(bookings.date, event.date),
        inArray(bookings.status, ["booked", "waitlisted"])
      )
    );

  const when = event.startsAt
    ? `${event.startsAt}${event.endsAt ? `–${event.endsAt}` : ""}`
    : "all day";
  const askToJoin = `${appUrl()}/events/${event.id}/rsvp`;

  // One email per person, not per booking — someone can hold a morning and an
  // afternoon, and two apologies for one day reads as a system, not a person.
  const byUser = new Map<string, { name: string; email: string; count: number }>();
  let cleared = 0;
  for (const { booking, user } of held) {
    if (user.id === event.createdBy) continue; // the organiser is running it
    await cancelBooking(booking.id, { promote: false });
    cleared++;
    const entry = byUser.get(user.id) ?? {
      name: user.name,
      email: user.email,
      count: 0,
    };
    entry.count++;
    byUser.set(user.id, entry);
  }

  for (const person of byUser.values()) {
    await sendEmail({
      to: person.email,
      subject: `Sorry — your booking for ${formatDayLong(event.date)} has been cancelled`,
      kind: "coworking_day_displaced",
      html: `<p>Hi ${person.name},</p>
<p>We're sorry: we've decided to run <strong>${event.title}</strong> at the office on <strong>${formatDayLong(event.date)}</strong> (${when}). It takes the whole space, so the office isn't available for general desk booking that day and we've had to cancel your booking.</p>
<p>We know that's annoying when you'd already planned around it — apologies. Every other day is unaffected: ${link(`${appUrl()}/book`, "pick another one from the calendar")}.</p>
<p>If the day itself is up your street, you're very welcome to come to it — ${link(askToJoin, "ask the organiser for a spot")}.</p>`,
    });
  }

  // Remember exactly who was moved off, so that calling the day off later can
  // tell them the space is theirs again.
  if (byUser.size > 0) {
    await db
      .update(events)
      .set({ displacedUserIds: [...byUser.keys()] })
      .where(eq(events.id, event.id));
  }

  // Whoever's left holding a desk (the organiser) belongs on the guest list.
  await absorbExistingBookings(event);
  return { cleared, names: [...byUser.values()].map((p) => p.name) };
}

export type SeatResult =
  | { ok: true; seat: string; already: boolean }
  | { ok: false; error: string };

/**
 * Give an approved guest an actual desk. Without this an approved guest is
 * just a row: no desk number, no reminder, invisible on the day, and nothing
 * stopping an organiser from approving forty people for thirteen seats.
 */
export async function seatGuest(
  userId: string,
  date: string,
  cfg?: Settings
): Promise<SeatResult> {
  const mine = await db
    .select()
    .from(bookings)
    .where(
      and(
        eq(bookings.userId, userId),
        eq(bookings.date, date),
        inArray(bookings.status, ["booked"])
      )
    );
  if (mine.length > 0) {
    return { ok: true, seat: describeSeat(mine[0]), already: true };
  }
  if (date < todayAms()) return { ok: false, error: "That day has passed." };

  const res = await bookDay(userId, date, {
    source: "admin",
    sendConfirmation: false,
    cfg,
  });
  if (!res.ok) return { ok: false, error: res.error };
  if ("waitlisted" in res) {
    return { ok: false, error: "The office is full that day." };
  }
  return { ok: true, seat: describeSeat(res.booking), already: false };
}

/** The desk we gave a guest, if we're the ones who gave it to them. */
export async function guestSeatBooking(userId: string, date: string) {
  const [row] = await db
    .select()
    .from(bookings)
    .where(
      and(
        eq(bookings.userId, userId),
        eq(bookings.date, date),
        eq(bookings.status, "booked"),
        eq(bookings.source, "admin")
      )
    );
  return row ?? null;
}

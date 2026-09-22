/**
 * Taking your own name off a list.
 *
 * Signing up is one tap and undoing it used to be an email to the organiser,
 * which is the asymmetry that leaves a room set out for twelve and six people
 * in it. Every sign-up email now carries a one-tap way out, signed and
 * single-purpose like the booking cancel links — it never grants a session,
 * and it lands on a confirm page rather than acting on GET, so an email
 * scanner prefetching links can't drop someone from an event.
 *
 * On a co-working day this matters more than tidiness: an approved guest is
 * holding a desk, so leaving hands it back and the waitlist moves. Only the
 * desk *we* gave them (`source: "admin"`, see guestSeatBooking) — somebody who
 * booked that day before it became a co-working day keeps their own booking,
 * same rule the organiser's decline follows.
 */

import { db, eventGuests, events, users } from "@/db";
import { and, eq, inArray } from "drizzle-orm";
import { cancelBooking } from "./booking";
import { guestSeatBooking } from "./coworking-guests";
import { isCoworkingDay } from "./coworking";
import { formatDayLong, todayAms } from "./dates";
import { sendEmail, link } from "./email";
import { appUrl } from "./auth";
import { makeToken } from "./tokens";

/** Marks a row the person themselves stepped away from, as opposed to one an
 *  organiser removed. The two read very differently on a guest list. */
export const SELF_WITHDRAWN = "self_withdrawn";

/**
 * The no-login "can't make it" link for one sign-up. Valid until the end of
 * the day it's for — after that there's nothing to leave.
 */
export function leaveEventUrl(guestId: string, eventDate: string): string {
  const exp = new Date(`${eventDate}T23:59:59+02:00`);
  return `${appUrl()}/leave/${makeToken("unrsvp", guestId, exp)}`;
}

export type LeaveResult =
  | { ok: true; already?: boolean; seatReleased?: boolean; title: string }
  | { ok: false; error: string };

export async function leaveEvent(guestId: string): Promise<LeaveResult> {
  const [guest] = await db
    .select()
    .from(eventGuests)
    .where(eq(eventGuests.id, guestId));
  if (!guest) return { ok: false, error: "We couldn't find that sign-up." };

  const [event] = await db.select().from(events).where(eq(events.id, guest.eventId));
  if (!event) return { ok: false, error: "We couldn't find that event." };

  // Idempotent: a second tap on the same link says the same thing.
  if (guest.status === "declined") {
    return { ok: true, already: true, title: event.title };
  }

  const future = event.date >= todayAms();
  let seatReleased = false;
  if (isCoworkingDay(event.type) && guest.status === "approved" && future) {
    const ours = await guestSeatBooking(guest.userId, event.date);
    if (ours) {
      await cancelBooking(ours.id); // promotes the waitlist
      seatReleased = true;
    }
  }

  await db
    .update(eventGuests)
    .set({ status: "declined", decidedBy: SELF_WITHDRAWN, decidedAt: new Date() })
    .where(eq(eventGuests.id, guestId));

  // The organiser is the one who needs to know — they're the person buying
  // the snacks and setting out the chairs.
  if (future) {
    const [person] = await db.select().from(users).where(eq(users.id, guest.userId));
    const organiserIds = event.createdBy
      ? [event.createdBy]
      : (
          await db.select({ id: users.id }).from(users).where(eq(users.role, "admin"))
        ).map((a) => a.id);
    if (organiserIds.length > 0 && person && person.id !== event.createdBy) {
      const stillComing = (
        await db
          .select({ id: eventGuests.id })
          .from(eventGuests)
          .where(
            and(
              eq(eventGuests.eventId, event.id),
              eq(eventGuests.status, "approved")
            )
          )
      ).length;
      for (const o of await db
        .select()
        .from(users)
        .where(inArray(users.id, organiserIds))) {
        await sendEmail({
          to: o.email,
          subject: `${person.name} can't make ${event.title}`,
          kind: "event_signup_withdrawn",
          html: `<p><strong>${person.name}</strong> has taken their name off <strong>${event.title}</strong> on ${formatDayLong(event.date)}.</p>
<p>That leaves ${stillComing} ${stillComing === 1 ? "person" : "people"} on the list.${seatReleased ? " Their desk has gone back into the pool." : ""}</p>
<p>${link(`${appUrl()}/events/${event.id}/guests`, "See who's coming")}</p>`,
        });
      }
    }
  }

  return { ok: true, seatReleased, title: event.title };
}

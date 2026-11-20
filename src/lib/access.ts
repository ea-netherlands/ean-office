import { db, bookings, eventGuests, eventAttendance } from "@/db";
import { and, eq } from "drizzle-orm";
import { isActiveMember, SessionUser } from "./auth";

// Who counts as "in the room" for the things only people in the room should
// get. Filling in the join form or signing up for an event creates an account
// that can log in straight away, before anyone on the team has looked at it,
// so "logged in" on its own is not enough for these.

/** Whether someone holds a seat on a date. An invited guest is not a member,
 *  but with a seat that day they belong in the room like anyone else. */
export async function hasBookingOn(userId: string, date: string): Promise<boolean> {
  const rows = await db
    .select({ id: bookings.id })
    .from(bookings)
    .where(
      and(eq(bookings.userId, userId), eq(bookings.date, date), eq(bookings.status, "booked"))
    )
    .limit(1);
  return rows.length > 0;
}

/** Who may see who's in (names, desks, photos, profiles) and check in at a
 *  desk: members, and guests with a seat that day. */
export async function inTheRoom(user: SessionUser | null, date: string): Promise<boolean> {
  if (!user) return false;
  return isActiveMember(user) || (await hasBookingOn(user.id, date));
}

/** Whether someone is expected at an event: a member, or a guest who is on
 *  its list (an approved request or sign-up, or an RSVP from before those). */
export async function onEventList(user: SessionUser | null, eventId: string): Promise<boolean> {
  if (!user) return false;
  if (isActiveMember(user)) return true;
  const guest = await db
    .select({ id: eventGuests.id })
    .from(eventGuests)
    .where(
      and(
        eq(eventGuests.eventId, eventId),
        eq(eventGuests.userId, user.id),
        eq(eventGuests.status, "approved")
      )
    )
    .limit(1);
  if (guest.length > 0) return true;
  const rsvp = await db
    .select({ id: eventAttendance.id })
    .from(eventAttendance)
    .where(
      and(
        eq(eventAttendance.eventId, eventId),
        eq(eventAttendance.userId, user.id),
        eq(eventAttendance.source, "rsvp")
      )
    )
    .limit(1);
  return rsvp.length > 0;
}

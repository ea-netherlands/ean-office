/**
 * The one "come to this" link, for anything on the office calendar.
 *
 * Co-working days have had this from the start: a link the organiser pastes
 * into a Slack channel, which anyone can use without an account. Evening
 * events had nothing — a member could RSVP with one tap if they were already
 * logged in, and everyone else had no way in at all, which is backwards for
 * the events most likely to bring someone new through the door.
 *
 * The two differ in one respect only, and it follows from desks: a co-working
 * day takes the whole office, so the organiser curates who comes. An evening
 * event runs after hours with no desks to ration, so signing up is signing
 * up. See lib/coworking-guests.ts for the curated half.
 *
 * Luma wins wherever it exists, for both kinds. A day promoted on Luma
 * already collects RSVPs there, and a second list here just leaves the
 * organiser checking two.
 */

import { isCoworkingDay } from "./coworking";

export type JoinableEvent = {
  id: string;
  url?: string | null;
  type?: string | null;
};

export function eventJoin(
  event: JoinableEvent,
  /** Makes it absolute, for emails. Leave off in the UI. */
  base = ""
): { href: string; external: boolean; label: string } {
  if (event.url) {
    return { href: event.url, external: true, label: "RSVP on Luma" };
  }
  return {
    href: `${base}/events/${event.id}/rsvp`,
    external: false,
    label: isCoworkingDay(event.type) ? "Ask to join" : "Sign up",
  };
}

/** Evening events take sign-ups; co-working days take requests. */
export function isOpenSignup(event: { type?: string | null }): boolean {
  return !isCoworkingDay(event.type);
}

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
  /** Evening events only — see `acceptsSignups`. */
  signupsOpen?: boolean | null;
};

/**
 * Whether this thing is taking names at all.
 *
 * A co-working day always is: asking to join one has been how they work from
 * the start, and the organiser decides each request anyway. An evening event
 * takes names only when someone has said it should — the office runs private
 * sessions (the intro course) alongside the open reading groups and socials,
 * and those two must not look the same to a member scrolling the calendar.
 */
export function acceptsSignups(event: JoinableEvent): boolean {
  return isCoworkingDay(event.type) ? true : event.signupsOpen !== false;
}

/**
 * Where someone would go to join this. Always answers — the page exists
 * either way, and it is the page (and the action behind it) that turns
 * people away when sign-ups are shut. Callers deciding whether to *show* a
 * link ask `acceptsSignups` first; `EventJoinLink` does that for you.
 */
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

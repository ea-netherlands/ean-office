/**
 * "Add it to my calendar" for desk bookings.
 *
 * A booking that only exists in this app is a booking people forget, and the
 * commonest quiet waste of a desk is someone who meant to come. So every
 * confirmation carries a calendar file — attached, so one tap files it, and
 * linked, because plenty of clients hide attachments on phones.
 *
 * A full day is an all-day entry marked TRANSPARENT: it belongs at the top of
 * the day, not as a ten-hour block that makes you look unbookable to every
 * colleague with access to your calendar. Half days are real timed entries
 * with a 30-minute alarm, because those you can actually be late for.
 */

import type { Booking } from "./booking";
import { describeSeat } from "./desks";
import { buildIcsCalendar, IcsEvent } from "./ics";
import { asSlot, SLOT_LABEL, slotWindow } from "./slots";
import type { Settings } from "./settings";
import { formatDay } from "./dates";
import { makeToken } from "./tokens";
import { appUrl } from "./auth";

/** Bare address for the iCalendar ORGANIZER field. */
function organiserEmail(): string {
  const from = process.env.EMAIL_FROM || "office@effectiefaltruisme.nl";
  const match = from.match(/<([^>]+)>/);
  return match ? match[1] : from;
}

/** "9:00–13:30" -> ["09:00", 270] */
function windowToStart(window: string): { start: string; minutes: number } {
  const [rawFrom, rawTo] = window.split("–").map((s) => s.trim());
  const mins = (t: string) => {
    const [h, m] = t.split(":").map(Number);
    return (h || 0) * 60 + (m || 0);
  };
  const pad = (t: string) => {
    const [h, m] = t.split(":");
    return `${String(Number(h)).padStart(2, "0")}:${(m ?? "00").padStart(2, "0")}`;
  };
  const from = mins(rawFrom ?? "9:00");
  const to = mins(rawTo ?? "13:30");
  return { start: pad(rawFrom ?? "9:00"), minutes: Math.max(30, to - from) };
}

export function bookingIcsEvent(booking: Booking, cfg: Settings): IcsEvent {
  const slot = asSlot(booking.slot);
  const seat = describeSeat(booking);
  const base: IcsEvent = {
    uid: `booking-${booking.id}@office.effectiefaltruisme.nl`,
    title:
      slot === "day"
        ? `Office — ${seat}`
        : `Office ${SLOT_LABEL[slot]} — ${seat}`,
    description: [
      `You have ${seat} at the EA Netherlands office${slot === "day" ? "" : ` for the ${SLOT_LABEL[slot]} (${slotWindow(slot, cfg)})`}.`,
      "Scan the QR code by the door when you arrive.",
      "",
      `Change or cancel: ${appUrl()}/me`,
    ].join("\n"),
    location: cfg.office_address,
    url: `${appUrl()}/me`,
    date: booking.date,
    organiserEmail: organiserEmail(),
  };
  if (slot === "day") return base;
  const { start, minutes } = windowToStart(slotWindow(slot, cfg));
  return { ...base, startTime: start, durationMinutes: minutes, alarmMinutesBefore: 30 };
}

export function bookingIcs(bookings: Booking[], cfg: Settings): string {
  return buildIcsCalendar(
    bookings.map((b) => bookingIcsEvent(b, cfg)),
    "PUBLISH",
    bookings.length > 1 ? "EA Netherlands office" : undefined
  );
}

/**
 * A hosted .ics, because mail clients on phones routinely bury attachments.
 * Signed and single-purpose like every other no-login link here: the token
 * yields one calendar file and never a session. It stays valid a week past
 * the booking so a late "add it after all" still works.
 */
export function calendarUrl(booking: Booking): string {
  const exp = new Date(`${booking.date}T23:59:59+02:00`);
  exp.setDate(exp.getDate() + 7);
  return `${appUrl()}/calendar/${makeToken("calendar", `b:${booking.id}`, exp)}.ics`;
}

export function seriesCalendarUrl(seriesId: string, lastDate: string): string {
  const exp = new Date(`${lastDate}T23:59:59+02:00`);
  exp.setDate(exp.getDate() + 7);
  return `${appUrl()}/calendar/${makeToken("calendar", `s:${seriesId}`, exp)}.ics`;
}

/** Filename people see in their downloads folder. */
export function icsFilename(bookings: Booking[]): string {
  return bookings.length === 1
    ? `office-${bookings[0].date}.ics`
    : `office-${formatDay(bookings[0].date).replace(/\s+/g, "-").toLowerCase()}-series.ics`;
}

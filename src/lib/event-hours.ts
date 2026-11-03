import { isWorkingDay } from "./dates";

// Events at the office must stay inside the window the alarm and door
// schedule allow: finished before the alarm activates at 22:00, and on a
// working day not before 17:30, when office hours end. Weekends and public
// holidays have no office hours to keep clear, so they can start any time.
// Themed coworking days run during normal office hours and don't touch the
// alarm, so they're exempt.

export const EVENING_START_MIN = "17:30";
export const EVENING_END_MAX = "22:00";

export function needsEveningWindow(type: string): boolean {
  return type !== "themed_coworking";
}

/** The earliest an event may start on `date`, or null if it can start any time. */
export function eventStartMin(type: string, date: string): string | null {
  if (!needsEveningWindow(type)) return null;
  // No date picked yet: assume a working day, the stricter case.
  if (date && !isWorkingDay(date)) return null;
  return EVENING_START_MIN;
}

/** The sentence under the time inputs, saying what the window is for `date`. */
export function eventHoursHint(type: string, date: string): string | null {
  if (!needsEveningWindow(type)) return null;
  return eventStartMin(type, date)
    ? `On weekdays events run ${EVENING_START_MIN}–${EVENING_END_MAX}, after office hours. Weekends can start earlier. Everything needs to wrap up by ${EVENING_END_MAX}, when the office alarm activates.`
    : `There are no office hours that day, so you can start whenever you like. Everything needs to wrap up by ${EVENING_END_MAX}, when the office alarm activates.`;
}

export function validateEventHours(
  type: string,
  date: string,
  startsAt: string | null,
  endsAt: string | null
): string | null {
  if (!needsEveningWindow(type)) return null;
  const startMin = eventStartMin(type, date);
  if (startsAt && startMin && startsAt < startMin) {
    return `On weekdays events can't start before ${startMin}, when office hours end. Weekends can start earlier.`;
  }
  if (endsAt && endsAt > EVENING_END_MAX) {
    return `Events need to end by ${EVENING_END_MAX} — the office alarm activates then.`;
  }
  return null;
}

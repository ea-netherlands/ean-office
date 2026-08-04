// Evening events at the office must stay inside the window the alarm and
// door schedule allow: not before 17:30, and finished before the alarm
// activates at 22:00. Themed coworking days run during normal office hours
// and don't touch the alarm, so they're exempt.

export const EVENING_START_MIN = "17:30";
export const EVENING_END_MAX = "22:00";

export function needsEveningWindow(type: string): boolean {
  return type !== "themed_coworking";
}

export function validateEventHours(
  type: string,
  startsAt: string | null,
  endsAt: string | null
): string | null {
  if (!needsEveningWindow(type)) return null;
  if (startsAt && startsAt < EVENING_START_MIN) {
    return `Evening events can't start before ${EVENING_START_MIN}.`;
  }
  if (endsAt && endsAt > EVENING_END_MAX) {
    return `Evening events need to end by ${EVENING_END_MAX} — the office alarm activates then.`;
  }
  return null;
}

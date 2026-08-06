// Co-working days: one member takes the whole office for a working day —
// an AI safety day, a fundraising sprint, a visiting org's team day. Unlike
// evening events they run inside office hours, so the office closes to
// general desk booking and the organiser curates who comes instead.
//
// Structurally they're `events` rows of type `themed_coworking`, which is
// what the funder reports already count. This module is the vocabulary; the
// database side lives in lib/coworking-guests.ts.

import { isWorkingDay } from "./dates";
import type { Settings } from "./settings";

export const COWORKING_TYPE = "themed_coworking" as const;

/** The office is open 9:00–19:00; a co-working day has to sit inside that. */
export const OFFICE_OPEN = "09:00";
export const OFFICE_CLOSE = "19:00";
export const COWORKING_DEFAULT_START = "09:30";
export const COWORKING_DEFAULT_END = "17:00";

export function isCoworkingDay(type: string | null | undefined): boolean {
  return type === COWORKING_TYPE;
}

/** Desks plus the lunch table — the whole room is the organiser's that day. */
export function coworkingSpotCount(cfg: Settings): number {
  return cfg.desk_count + cfg.flex_count;
}

/**
 * Everything that makes a proposed date impossible rather than merely
 * inconvenient. A clash with someone else's booking is not in here on
 * purpose: those people keep their desks, and the organiser is told.
 */
export function validateCoworkingDay(
  date: string,
  startsAt: string | null,
  endsAt: string | null,
  today: string
): string | null {
  if (!date) return "Pick a day.";
  if (date < today) return "That day has already passed.";
  if (!isWorkingDay(date)) {
    return "Co-working days run Monday to Friday, outside public holidays.";
  }
  if (startsAt && startsAt < OFFICE_OPEN) {
    return `The office opens at ${OFFICE_OPEN} — start from then.`;
  }
  if (endsAt && endsAt > OFFICE_CLOSE) {
    return `The office closes at ${OFFICE_CLOSE} — finish by then. Running into the evening? Propose an event instead.`;
  }
  if (startsAt && endsAt && endsAt <= startsAt) {
    return "The end time needs to be after the start time.";
  }
  return null;
}

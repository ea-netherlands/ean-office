// Half-day bookings. The office day splits at the communal lunch hour: a
// "morning" runs until lunch starts, an "afternoon" from lunch — so when two
// people share a desk the handover happens over lunch, while neither of them
// is working at it anyway.
//
// A booking's slot covers one or both halves. Everything downstream —
// capacity, desk conflicts, occupancy weighting — is derived from that
// coverage rather than from the slot name, so there's one rule, not three.

export const SLOTS = ["day", "am", "pm"] as const;
export type Slot = (typeof SLOTS)[number];
export type Half = "am" | "pm";

export const HALVES: Half[] = ["am", "pm"];

/** 13:00 — the middle of the lunch hour, and where "now" flips to afternoon. */
export const HANDOVER_MINUTES = 13 * 60;

export const SLOT_LABEL: Record<Slot, string> = {
  day: "full day",
  am: "morning",
  pm: "afternoon",
};

/** Compact badge text. A full day needs no badge — it's the norm. */
export const SLOT_BADGE: Record<Slot, string> = {
  day: "",
  am: "AM",
  pm: "PM",
};

export function isSlot(v: unknown): v is Slot {
  return typeof v === "string" && (SLOTS as readonly string[]).includes(v);
}

export function asSlot(v: unknown): Slot {
  return isSlot(v) ? v : "day";
}

export function coversAm(slot: Slot): boolean {
  return slot === "day" || slot === "am";
}

export function coversPm(slot: Slot): boolean {
  return slot === "day" || slot === "pm";
}

/** The halves a slot occupies — the basis of every conflict check. */
export function halves(slot: Slot): Half[] {
  return slot === "day" ? ["am", "pm"] : [slot];
}

/** Two bookings clash when they want any of the same half. */
export function overlaps(a: Slot, b: Slot): boolean {
  return (coversAm(a) && coversAm(b)) || (coversPm(a) && coversPm(b));
}

/** Desk-days: a half day is half a desk-day, so reported occupancy stays
 *  comparable with periods before half-day booking existed. */
export function slotWeight(slot: Slot): number {
  return slot === "day" ? 1 : 0.5;
}

/** " (morning)" — appended to a date in emails and confirmations. */
export function slotSuffix(slot: Slot): string {
  return slot === "day" ? "" : ` (${SLOT_LABEL[slot]})`;
}

/** Which half of the day it is, from Amsterdam minutes-since-midnight. */
export function currentHalf(minutesOfDay: number): Half {
  return minutesOfDay < HANDOVER_MINUTES ? "am" : "pm";
}

/** Human-readable hours for a slot, from the admin-editable windows. */
export function slotWindow(
  slot: Slot,
  cfg: { am_window: string; pm_window: string }
): string {
  if (slot === "am") return cfg.am_window;
  if (slot === "pm") return cfg.pm_window;
  return `${cfg.am_window.split("–")[0]}–${cfg.pm_window.split("–")[1] ?? ""}`;
}

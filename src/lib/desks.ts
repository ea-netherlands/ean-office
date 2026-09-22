/**
 * Where a desk is in the room.
 *
 * "Desk 3" means nothing to someone on their fourth visit, and the floor plan
 * only exists on the booking page — which is no use in an email or on the
 * doormat. These are the relationships the plan in components/desk-map.tsx
 * actually encodes (top wall, the island and its two ends, the lunch table by
 * the kitchen) and nothing more: a confidently wrong direction sends someone
 * to somebody else's desk, which is worse than a desk number on its own.
 *
 * Only the real eight-desk room has a known layout. Any other desk count is a
 * plain grid on screen and gets no hint here.
 */

const REAL_ROOM_DESKS = 8;

const WHERE: Record<number, string> = {
  1: "at the door end of the desk island",
  2: "in the middle of the desk island",
  3: "in the middle of the desk island",
  4: "in the middle of the desk island",
  5: "in the middle of the desk island",
  6: "at the lounge end of the desk island",
  7: "against the top wall",
  8: "against the top wall",
};

/** "at the door end of the desk island", or "" when we can't say. */
export function deskLocation(
  deskNumber: number | null | undefined,
  deskCount: number = REAL_ROOM_DESKS
): string {
  if (!deskNumber || deskCount !== REAL_ROOM_DESKS) return "";
  return WHERE[deskNumber] ?? "";
}

/** " — at the door end of the desk island", ready to append in a sentence. */
export function deskLocationSuffix(
  deskNumber: number | null | undefined,
  deskCount: number = REAL_ROOM_DESKS
): string {
  const where = deskLocation(deskNumber, deskCount);
  return where ? `, ${where}` : "";
}

/** What a booking sits at: "desk 3" or "a lunch-table spot". */
export type Seated = { seatType: string; deskNumber: number | null };

export function describeSeat(booking: Seated): string {
  return booking.seatType === "desk"
    ? `desk ${booking.deskNumber ?? ""}`.trim()
    : "a lunch-table spot";
}

/**
 * ", at the door end of the desk island" — appended after a desk number so a
 * newcomer can find it without the floor plan. Empty for the lunch table
 * (which is by the kitchen and unmissable) and for any non-standard room.
 */
export function deskWhere(booking: Seated, deskCount?: number): string {
  if (booking.seatType !== "desk") return "";
  return deskLocationSuffix(booking.deskNumber, deskCount);
}

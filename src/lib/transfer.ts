import { db, bookings, users } from "@/db";
import { and, eq, inArray } from "drizzle-orm";
import { bookDay } from "./booking";
import { todayAms } from "./dates";
import { asSlot, overlaps, type Slot } from "./slots";

// Moving the old spreadsheet's bookings into the app. Shared by the CLI
// script and /admin/transfer so the dry run a person sees on screen is
// produced by exactly the same code that later writes.

export type TransferRow = {
  date: string;
  name: string;
  email: string;
  slot: Slot;
  seatType: "desk" | "flex";
  action: string; // "transfer" | "review"
  note?: string;
};

export type TransferOutcome =
  | "will book"
  | "booked"
  | "already there"
  | "no email given"
  | "unknown email"
  | "needs review"
  | "past"
  | "failed";

export type TransferResult = {
  row: TransferRow;
  outcome: TransferOutcome;
  detail?: string;
};

export const PROBLEM_OUTCOMES: TransferOutcome[] = [
  "unknown email",
  "no email given",
  "failed",
];

/**
 * Walk every row through the same ladder, optionally writing.
 *
 * With `commit: false` nothing is written and bookable rows come back as
 * "will book" — that's the dry run. Re-running after a commit is safe: a row
 * whose hours the member already holds reports "already there" and is left
 * alone, so a half-finished run can simply be repeated.
 */
export async function runTransfer(
  rows: TransferRow[],
  opts: { commit?: boolean; includeReview?: boolean } = {}
): Promise<TransferResult[]> {
  const { commit = false, includeReview = false } = opts;

  const allUsers = await db
    .select({ id: users.id, email: users.email })
    .from(users);
  const byEmail = new Map(allUsers.map((u) => [u.email.toLowerCase(), u.id]));

  const today = todayAms();
  const results: TransferResult[] = [];

  for (const row of rows) {
    const push = (outcome: TransferOutcome, detail?: string) =>
      results.push({ row, outcome, detail });

    if (!row.date || row.date < today) {
      push("past");
      continue;
    }
    if (row.action !== "transfer" && !includeReview) {
      push("needs review", row.note);
      continue;
    }
    const email = row.email.trim().toLowerCase();
    if (!email) {
      push("no email given");
      continue;
    }
    const userId = byEmail.get(email);
    if (!userId) {
      push("unknown email", email);
      continue;
    }

    // Whatever is in the app already wins — it's the source of truth now.
    const existing = await db
      .select({ slot: bookings.slot })
      .from(bookings)
      .where(
        and(
          eq(bookings.userId, userId),
          eq(bookings.date, row.date),
          inArray(bookings.status, ["booked", "waitlisted"])
        )
      );
    if (existing.some((b) => overlaps(asSlot(b.slot), row.slot))) {
      push("already there");
      continue;
    }

    if (!commit) {
      push("will book");
      continue;
    }

    // Through the normal booking path, so capacity, the half-day overlap
    // rules and desk pairing all apply as they would for a member.
    const res = await bookDay(userId, row.date, {
      source: "admin",
      slot: row.slot,
      seatType: row.seatType,
      sendConfirmation: false,
    });
    if (res.ok && !("waitlisted" in res)) {
      push("booked", res.booking.deskNumber ? `desk ${res.booking.deskNumber}` : "lunch table");
    } else if (res.ok) {
      push("failed", "that day was full — put on the waitlist instead");
    } else {
      push("failed", res.error);
    }
  }

  return results;
}

export function summarise(results: TransferResult[]): Record<string, number> {
  return results.reduce<Record<string, number>>((acc, r) => {
    acc[r.outcome] = (acc[r.outcome] ?? 0) + 1;
    return acc;
  }, {});
}

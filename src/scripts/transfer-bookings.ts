/**
 * Move the old spreadsheet's future bookings into the app.
 *
 *   npx tsx src/scripts/transfer-bookings.ts                       # dry run (local)
 *   npx tsx src/scripts/transfer-bookings.ts --commit              # write (local)
 *   DATABASE_URL="postgres://…" npx tsx src/scripts/transfer-bookings.ts --commit
 *
 * Reads data/transfer/future-bookings.csv, produced by
 * `extract-sheet-bookings.ts` and then completed by hand with an email per
 * person. Rows whose `action` is not "transfer" are skipped unless
 * --include-review is passed.
 *
 * Bookings go through the normal `bookDay` path rather than raw inserts, so
 * capacity, the half-day overlap rules, desk pairing and the unique indexes
 * all apply exactly as they would for a member clicking Book. Source is
 * "admin" so these don't count against anyone's future-booking cap and don't
 * trigger a confirmation email per row — one announcement covers it.
 *
 * Safe to re-run: a row that's already booked is reported as "already there"
 * and left alone.
 */
import * as fs from "fs";
import * as path from "path";
import { db, ensureMigrated } from "../db";
import { bookings, users } from "../db/schema";
import { and, eq, inArray } from "drizzle-orm";
import { bookDay } from "../lib/booking";
import { asSlot, overlaps, SLOT_LABEL, type Slot } from "../lib/slots";
import { todayAms } from "../lib/dates";

type CsvRow = {
  date: string;
  name: string;
  email: string;
  slot: Slot;
  seatType: "desk" | "flex";
  action: string;
  note: string;
};

type Outcome =
  | "booked"
  | "already there"
  | "no email given"
  | "unknown email"
  | "skipped (needs review)"
  | "past"
  | "failed";

/** Minimal CSV reader — handles quoted fields, which the notes column has. */
function parseCsv(text: string): Record<string, string>[] {
  const rows: string[][] = [];
  let field = "";
  let row: string[] = [];
  let quoted = false;
  for (let i = 0; i < text.length; i++) {
    const c = text[i];
    if (quoted) {
      if (c === '"') {
        if (text[i + 1] === '"') {
          field += '"';
          i++;
        } else quoted = false;
      } else field += c;
      continue;
    }
    if (c === '"') quoted = true;
    else if (c === ",") {
      row.push(field);
      field = "";
    } else if (c === "\n") {
      row.push(field);
      rows.push(row);
      row = [];
      field = "";
    } else if (c !== "\r") field += c;
  }
  if (field || row.length) {
    row.push(field);
    rows.push(row);
  }
  const [header, ...body] = rows.filter((r) => r.some((c) => c.trim() !== ""));
  return body.map((r) =>
    Object.fromEntries(header.map((h, i) => [h.trim(), (r[i] ?? "").trim()]))
  );
}

async function main() {
  const commit = process.argv.includes("--commit");
  const includeReview = process.argv.includes("--include-review");
  await ensureMigrated();

  const file = path.join(process.cwd(), "data", "transfer", "future-bookings.csv");
  if (!fs.existsSync(file)) {
    console.error(
      `Missing ${file}\nRun extract-sheet-bookings.ts first, then fill in the email column.`
    );
    process.exit(1);
  }

  const rows = parseCsv(fs.readFileSync(file, "utf8")).map<CsvRow>((r) => ({
    date: r.date,
    name: r.name,
    email: r.email.toLowerCase(),
    slot: asSlot(r.slot),
    seatType: r.seat_type === "flex" ? "flex" : "desk",
    action: r.action || "transfer",
    note: r.note ?? "",
  }));

  // Resolve emails to accounts up front so a typo is a report line, not a crash.
  const allUsers = await db
    .select({ id: users.id, email: users.email, name: users.name, status: users.status })
    .from(users);
  const byEmail = new Map(allUsers.map((u) => [u.email.toLowerCase(), u]));

  const today = todayAms();
  const results: { row: CsvRow; outcome: Outcome; detail?: string }[] = [];

  for (const row of rows) {
    const record = (outcome: Outcome, detail?: string) =>
      results.push({ row, outcome, detail });

    if (row.date < today) {
      record("past");
      continue;
    }
    if (row.action !== "transfer" && !includeReview) {
      record("skipped (needs review)", row.note);
      continue;
    }
    if (!row.email) {
      record("no email given");
      continue;
    }
    const user = byEmail.get(row.email);
    if (!user) {
      record("unknown email", row.email);
      continue;
    }

    // Anything overlapping already in the app wins — the app is now the
    // source of truth, and a re-run must not disturb it.
    const existing = await db
      .select({ slot: bookings.slot })
      .from(bookings)
      .where(
        and(
          eq(bookings.userId, user.id),
          eq(bookings.date, row.date),
          inArray(bookings.status, ["booked", "waitlisted"])
        )
      );
    if (existing.some((b) => overlaps(asSlot(b.slot), row.slot))) {
      record("already there");
      continue;
    }

    if (!commit) {
      record("booked", "(dry run)");
      continue;
    }

    const res = await bookDay(user.id, row.date, {
      source: "admin",
      slot: row.slot,
      seatType: row.seatType,
      sendConfirmation: false,
    });
    if (res.ok && !("waitlisted" in res)) {
      record("booked", `desk ${res.booking.deskNumber ?? "—"}`);
    } else if (res.ok) {
      record("failed", "day was full — waitlisted instead");
    } else {
      record("failed", res.error);
    }
  }

  // ---------- report ----------
  const counts = results.reduce<Record<string, number>>((acc, r) => {
    acc[r.outcome] = (acc[r.outcome] ?? 0) + 1;
    return acc;
  }, {});
  console.log(commit ? "\n=== TRANSFER (committing) ===" : "\n=== DRY RUN (nothing written) ===");
  for (const [outcome, n] of Object.entries(counts).sort((a, b) => b[1] - a[1])) {
    console.log(`  ${String(n).padStart(3)}  ${outcome}`);
  }

  const problems = results.filter(
    (r) => r.outcome === "unknown email" || r.outcome === "no email given" || r.outcome === "failed"
  );
  if (problems.length > 0) {
    console.log("\nNeeds attention:");
    const seen = new Set<string>();
    for (const p of problems) {
      const key = `${p.outcome}:${p.row.name}:${p.detail ?? ""}`;
      if (seen.has(key)) continue;
      seen.add(key);
      console.log(
        `  ${p.row.date}  ${p.row.name.padEnd(14)} ${p.outcome}${p.detail ? ` — ${p.detail}` : ""}`
      );
    }
  }

  const halfDays = results.filter((r) => r.outcome === "booked" && r.row.slot !== "day");
  if (halfDays.length > 0) {
    console.log(`\nHalf days carried across (${halfDays.length}):`);
    for (const h of halfDays) {
      console.log(`  ${h.row.date}  ${h.row.name.padEnd(14)} ${SLOT_LABEL[h.row.slot]}`);
    }
  }

  if (!commit) {
    console.log("\nRe-run with --commit to write these.");
  }
  process.exit(0);
}

main().catch((err) => {
  console.error("Transfer failed:", err);
  process.exit(1);
});

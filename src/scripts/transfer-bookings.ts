/**
 * Move the old spreadsheet's future bookings into the app, from a terminal.
 *
 *   npx tsx src/scripts/transfer-bookings.ts                       # dry run
 *   npx tsx src/scripts/transfer-bookings.ts --commit              # write
 *   DATABASE_URL="postgres://…" npx tsx src/scripts/transfer-bookings.ts --commit
 *
 * There's a friendlier version of this at /admin/transfer, which needs no
 * database password. Both call `runTransfer` in lib/transfer.ts, so the two
 * can't drift apart.
 *
 * Reads data/transfer/future-bookings.csv, produced by
 * `extract-sheet-bookings.ts` and completed by `match-members.ts`. Rows whose
 * `action` isn't "transfer" are skipped unless --include-review is passed.
 */
import * as fs from "fs";
import * as path from "path";
import { ensureMigrated } from "../db";
import { runTransfer, summarise, PROBLEM_OUTCOMES } from "../lib/transfer";
import type { TransferRow } from "../lib/transfer";
import { asSlot, SLOT_LABEL } from "../lib/slots";

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
      `Missing ${file}\nRun extract-sheet-bookings.ts, then match-members.ts.`
    );
    process.exit(1);
  }

  const rows = parseCsv(fs.readFileSync(file, "utf8")).map<TransferRow>((r) => ({
    date: r.date,
    name: r.name,
    email: r.email,
    slot: asSlot(r.slot),
    seatType: r.seat_type === "flex" ? "flex" : "desk",
    action: r.action || "transfer",
    note: r.note ?? "",
  }));

  const results = await runTransfer(rows, { commit, includeReview });
  const counts = summarise(results);

  console.log(
    commit ? "\n=== TRANSFER (committing) ===" : "\n=== DRY RUN (nothing written) ==="
  );
  for (const [outcome, n] of Object.entries(counts).sort((a, b) => b[1] - a[1])) {
    console.log(`  ${String(n).padStart(3)}  ${outcome}`);
  }

  const problems = results.filter((r) => PROBLEM_OUTCOMES.includes(r.outcome));
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

  const halfDays = results.filter(
    (r) => (r.outcome === "booked" || r.outcome === "will book") && r.row.slot !== "day"
  );
  if (halfDays.length > 0) {
    console.log(`\nHalf days carried across (${halfDays.length}):`);
    for (const h of halfDays) {
      console.log(`  ${h.row.date}  ${h.row.name.padEnd(14)} ${SLOT_LABEL[h.row.slot]}`);
    }
  }

  if (!commit) console.log("\nRe-run with --commit to write these.");
  process.exit(0);
}

main().catch((err) => {
  console.error("Transfer failed:", err);
  process.exit(1);
});

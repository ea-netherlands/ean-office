/**
 * Pull the still-in-the-future bookings out of the old hotdesk spreadsheet
 * into a reviewable CSV, ready for `transfer-bookings.ts`.
 *
 *   npx tsx src/scripts/extract-sheet-bookings.ts "~/Downloads/EAN office - hotdesk booking.xlsx"
 *
 * The sheet holds first names, not email addresses, so this can't finish the
 * job on its own: it emits a blank `email` column for a human to fill in. It
 * also can't carry desk numbers across — the sheet's desk columns are
 * positional and don't correspond to the app's floor plan — so the app
 * reassigns desks itself on import.
 */
import * as fs from "fs";
import * as path from "path";
import { todayAms } from "../lib/dates";
import type { Slot } from "../lib/slots";

type Row = {
  date: string;
  name: string;
  email: string;
  slot: Slot;
  seatType: "desk" | "flex";
  note: string;
  action: "transfer" | "review";
};

/** "(afternoon)", "(>13.00)", "(morning)" — how people wrote half days by hand. */
function slotFromAnnotation(annotation: string): { slot: Slot; certain: boolean } {
  const a = annotation.toLowerCase();
  if (!a) return { slot: "day", certain: true };
  if (/morning|ochtend|<\s*13|until\s*13|till\s*13/.test(a)) {
    return { slot: "am", certain: true };
  }
  if (/afternoon|middag|>\s*1[23]|from\s*1[23]|after\s*1[23]/.test(a)) {
    return { slot: "pm", certain: true };
  }
  return { slot: "day", certain: false }; // something else in brackets — flag it
}

function csvEscape(v: string): string {
  return /[",\n]/.test(v) ? `"${v.replace(/"/g, '""')}"` : v;
}

async function main() {
  const input = process.argv[2];
  if (!input) {
    console.error('Usage: npx tsx src/scripts/extract-sheet-bookings.ts "<path to .xlsx>"');
    process.exit(1);
  }
  const file = input.replace(/^~/, process.env.HOME ?? "~");
  if (!fs.existsSync(file)) {
    console.error(`No such file: ${file}`);
    process.exit(1);
  }

  // Imported lazily so the app's runtime never depends on a dev-only parser.
  // xlsx ships CJS, so the namespace lands under .default under tsx/ESM.
  const mod: Record<string, unknown> = await import("xlsx");
  const XLSX = ("readFile" in mod ? mod : mod.default) as typeof import("xlsx");
  const wb = XLSX.readFile(file, { cellDates: true });
  const sheet = wb.Sheets["Register your seat!"];
  if (!sheet) {
    console.error("Sheet 'Register your seat!' not found.");
    process.exit(1);
  }

  const grid = XLSX.utils.sheet_to_json<unknown[]>(sheet, {
    header: 1,
    raw: true,
    blankrows: true,
  });

  // Row 6 (1-indexed) carries the column headers.
  const header = (grid[5] ?? []).map((c) => String(c ?? "").trim());
  const seatCols = header
    .map((h, i) => ({ h, i }))
    .filter(({ h }) => /^desk|caf|stopping/i.test(h))
    .map(({ h, i }) => ({
      index: i,
      // "Work café" is the app's flex seat; "Stopping by" isn't a desk at all.
      seatType: /caf/i.test(h) ? ("flex" as const) : ("desk" as const),
      informal: /stopping/i.test(h),
    }));

  const today = todayAms();
  const rows: Row[] = [];

  for (const raw of grid.slice(6)) {
    const cell0 = raw?.[0];
    if (!(cell0 instanceof Date)) continue;
    const date = new Date(
      Date.UTC(cell0.getFullYear(), cell0.getMonth(), cell0.getDate())
    )
      .toISOString()
      .slice(0, 10);
    if (date < today) continue;

    for (const col of seatCols) {
      const value = raw[col.index];
      if (!value) continue;
      // One cell can hold several people: "Jeroen (>13.00), Marieke (morning)"
      for (const part of String(value).split(",")) {
        const entry = part.trim();
        if (!entry) continue;
        const bracket = /\((.*?)\)/.exec(entry);
        const annotation = bracket?.[1]?.trim() ?? "";
        const name = entry.replace(/\(.*?\)/g, "").trim();
        if (!name) continue;

        const { slot, certain } = slotFromAnnotation(annotation);
        // "James S. maybe" was a tentative pencilling-in, not a booking.
        const tentative = /\bmaybe\b|\?$/i.test(name);
        const notes = [
          annotation && `sheet said: ${annotation}`,
          tentative && "tentative in the sheet",
          !certain && annotation && "unrecognised time note",
          col.informal && "was under 'Stopping by', not a desk",
        ].filter(Boolean) as string[];

        rows.push({
          date,
          name: name.replace(/\s*\bmaybe\b\s*/i, "").trim(),
          email: "",
          slot,
          seatType: col.seatType,
          note: notes.join("; "),
          action:
            tentative || col.informal || (annotation && !certain)
              ? "review"
              : "transfer",
        });
      }
    }
  }

  rows.sort((a, b) => a.date.localeCompare(b.date) || a.name.localeCompare(b.name));

  const outDir = path.join(process.cwd(), "data", "transfer");
  fs.mkdirSync(outDir, { recursive: true });
  const out = path.join(outDir, "future-bookings.csv");
  fs.writeFileSync(
    out,
    ["date,name,email,slot,seat_type,action,note"]
      .concat(
        rows.map((r) =>
          [r.date, r.name, r.email, r.slot, r.seatType, r.action, r.note]
            .map(csvEscape)
            .join(",")
        )
      )
      .join("\n") + "\n"
  );

  const names = [...new Set(rows.map((r) => r.name))].sort();
  const byAction = rows.reduce<Record<string, number>>((acc, r) => {
    acc[r.action] = (acc[r.action] ?? 0) + 1;
    return acc;
  }, {});
  const halfDays = rows.filter((r) => r.slot !== "day").length;

  console.log(`Wrote ${rows.length} future entries to ${out}`);
  console.log(`  from ${rows[0]?.date} to ${rows[rows.length - 1]?.date}`);
  console.log(`  ready to transfer: ${byAction.transfer ?? 0}`);
  console.log(`  needs a human look: ${byAction.review ?? 0}`);
  console.log(`  already half days in the sheet: ${halfDays}`);
  console.log(`  ${names.length} distinct people — fill in the email column:`);
  console.log(`    ${names.join(", ")}`);
  process.exit(0);
}

main().catch((err) => {
  console.error("Extract failed:", err);
  process.exit(1);
});

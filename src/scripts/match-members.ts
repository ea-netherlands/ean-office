/**
 * Match the first names in the old hotdesk sheet against a member list that
 * has email addresses, and produce the two files the migration needs:
 *
 *   data/transfer/import-members.csv    -> paste into /admin/import
 *   data/transfer/future-bookings.csv   -> email column filled in place
 *
 *   npx tsx src/scripts/match-members.ts "~/Downloads/…sampling frame….csv"
 *
 * Deliberately conservative: a sheet name is only filled in when exactly one
 * person in the list can be it. Anything ambiguous ("Max" when there are two
 * Maxes) or absent is left blank and reported, because booking a desk in the
 * wrong person's name is worse than leaving a row for a human.
 */
import * as fs from "fs";
import * as path from "path";

type Member = { name: string; email: string };

/** Split any CSV line, honouring quotes. */
function splitCsvLine(line: string): string[] {
  const out: string[] = [];
  let field = "";
  let quoted = false;
  for (let i = 0; i < line.length; i++) {
    const c = line[i];
    if (quoted) {
      if (c === '"') {
        if (line[i + 1] === '"') {
          field += '"';
          i++;
        } else quoted = false;
      } else field += c;
    } else if (c === '"') quoted = true;
    else if (c === ",") {
      out.push(field);
      field = "";
    } else field += c;
  }
  out.push(field);
  return out;
}

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

/** Pull name/email pairs out of an arbitrarily-shaped export. */
function readMembers(file: string): Member[] {
  const lines = fs.readFileSync(file, "utf8").split("\n");
  const members: Member[] = [];
  for (const line of lines) {
    const cells = splitCsvLine(line).map((c) => c.trim());
    const email = cells.find((c) => EMAIL_RE.test(c));
    if (!email) continue;
    // The name is the first non-empty cell that isn't the email.
    const name = cells.find((c) => c && c !== email && !EMAIL_RE.test(c));
    if (!name) continue;
    members.push({ name, email: email.toLowerCase() });
  }
  return members;
}

const strip = (s: string) =>
  s
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "") // Tomáš -> Tomas
    .toLowerCase()
    .replace(/[^a-z\s]/g, " ")
    .replace(/\s+/g, " ")
    .trim();

/** Dutch/German surname particles, which the sheet abbreviates as "vdB". */
const PARTICLES = new Set(["van", "den", "der", "de", "ten", "te", "von", "el"]);

function initialsOfSurname(fullName: string): string {
  const parts = strip(fullName).split(" ").slice(1);
  return parts.map((p) => p[0]).join("");
}

/**
 * Could `sheetName` (a first name, sometimes with a surname hint like
 * "Ruben vdB" or "James S.") refer to `member`?
 */
function isCandidate(sheetName: string, member: Member): boolean {
  const sheet = strip(sheetName).split(" ");
  const full = strip(member.name).split(" ");
  if (sheet[0] !== full[0]) return false; // first names must agree
  if (sheet.length === 1) return true; // bare first name — any match counts

  const hint = sheet.slice(1).join("");
  const surname = full.slice(1);
  if (surname.length === 0) return false;

  // "S." -> surname starts with s
  if (hint.length === 1) return surname.some((p) => !PARTICLES.has(p) && p[0] === hint);
  // "vdB" -> initials of the surname words, particles included
  if (hint === initialsOfSurname(member.name)) return true;
  // "Anne" in "Jan Anne" is a second given name, not a surname
  return full.join(" ").includes(sheet.join(" "));
}

function csvEscape(v: string): string {
  return /[",\n]/.test(v) ? `"${v.replace(/"/g, '""')}"` : v;
}

/**
 * Accounts that already exist in the app — many regulars are already in.
 * Run this against production (DATABASE_URL set); the local database holds
 * seeded fake people, who will collide with real first names and turn genuine
 * matches into false ambiguities. Pass --csv-only to skip this entirely.
 */
async function readAppUsers(): Promise<Member[]> {
  if (process.argv.includes("--csv-only")) return [];
  if (!process.env.DATABASE_URL) {
    console.warn(
      "! No DATABASE_URL — reading the LOCAL (seeded) database.\n" +
        "  Seeded names cause false ambiguities. Use --csv-only, or set\n" +
        "  DATABASE_URL to match against the real member accounts.\n"
    );
  }
  try {
    const { db, ensureMigrated } = await import("../db");
    const { users } = await import("../db/schema");
    await ensureMigrated();
    const rows = await db.select({ name: users.name, email: users.email }).from(users);
    return rows.map((r) => ({ name: r.name, email: r.email.toLowerCase() }));
  } catch (err) {
    console.warn(`(couldn't read the app's users: ${err}) — matching on the CSV only`);
    return [];
  }
}

async function main() {
  const input = process.argv[2];
  if (!input) {
    console.error('Usage: npx tsx src/scripts/match-members.ts "<member list .csv>"');
    process.exit(1);
  }
  const memberFile = input.replace(/^~/, process.env.HOME ?? "~");
  const bookingsFile = path.join(process.cwd(), "data", "transfer", "future-bookings.csv");
  for (const f of [memberFile, bookingsFile]) {
    if (!fs.existsSync(f)) {
      console.error(`Missing: ${f}`);
      process.exit(1);
    }
  }

  const fromCsv = readMembers(memberFile);
  // Dedupe on email, keeping the longest name (usually the fullest one).
  const byEmail = new Map<string, Member>();
  for (const m of fromCsv) {
    const prev = byEmail.get(m.email);
    if (!prev || m.name.length > prev.name.length) byEmail.set(m.email, m);
  }
  const csvRoster = [...byEmail.values()];

  // ---------- import file: only people the app doesn't have yet ----------
  const appUsers = await readAppUsers();
  const appEmails = new Set(appUsers.map((u) => u.email));
  const outDir = path.join(process.cwd(), "data", "transfer");
  const importFile = path.join(outDir, "import-members.csv");
  const toImport = csvRoster.filter((m) => !appEmails.has(m.email));
  fs.writeFileSync(
    importFile,
    ["name,email"]
      .concat(toImport.map((m) => `${csvEscape(m.name)},${csvEscape(m.email)}`))
      .join("\n") + "\n"
  );

  // Match against both rosters — an existing account resolves a sheet name
  // just as well as a row in the spreadsheet, and better.
  const roster = [...csvRoster];
  for (const u of appUsers) if (!byEmail.has(u.email)) roster.push(u);

  // ---------- match sheet names ----------
  const lines = fs.readFileSync(bookingsFile, "utf8").split("\n").filter(Boolean);
  const header = splitCsvLine(lines[0]);
  const col = Object.fromEntries(header.map((h, i) => [h.trim(), i]));
  const sheetNames = [
    ...new Set(lines.slice(1).map((l) => splitCsvLine(l)[col.name]?.trim()).filter(Boolean)),
  ].sort();

  const resolved = new Map<string, string>();
  const ambiguous: { name: string; options: Member[] }[] = [];
  const missing: string[] = [];

  for (const name of sheetNames) {
    const candidates = roster.filter((m) => isCandidate(name, m));
    if (candidates.length === 1) resolved.set(name, candidates[0].email);
    else if (candidates.length > 1) ambiguous.push({ name, options: candidates });
    else missing.push(name);
  }

  // ---------- write emails back ----------
  let filled = 0;
  const updated = [lines[0]].concat(
    lines.slice(1).map((line) => {
      const cells = splitCsvLine(line);
      const email = resolved.get(cells[col.name]?.trim());
      if (email && !cells[col.email]) {
        cells[col.email] = email;
        filled++;
      }
      return cells.map(csvEscape).join(",");
    })
  );
  fs.writeFileSync(bookingsFile, updated.join("\n") + "\n");

  // ---------- report ----------
  console.log(`Member list: ${csvRoster.length} people with email addresses`);
  console.log(`App already has: ${appUsers.length} accounts`);
  console.log(`  new to import: ${toImport.length}  -> ${importFile}`);
  console.log();
  console.log(`Sheet names: ${sheetNames.length}`);
  console.log(`  matched uniquely: ${resolved.size}  (${filled} booking rows filled in)`);
  console.log(`  ambiguous:        ${ambiguous.length}`);
  console.log(`  not in the list:  ${missing.length}`);

  if (ambiguous.length) {
    console.log("\nAMBIGUOUS — more than one person could be this, left blank:");
    for (const a of ambiguous) {
      console.log(`  "${a.name}" could be:`);
      for (const o of a.options) console.log(`      ${o.name} <${o.email}>`);
    }
  }
  if (missing.length) {
    console.log("\nNOT IN THE LIST — left blank:");
    for (const m of missing) console.log(`  ${m}`);
  }

  const stillBlank = updated
    .slice(1)
    .filter((l) => !splitCsvLine(l)[col.email])
    .length;
  console.log(`\n${stillBlank} of ${updated.length - 1} booking rows still need an email.`);
  process.exit(0);
}

main().catch((err) => {
  console.error("Match failed:", err);
  process.exit(1);
});

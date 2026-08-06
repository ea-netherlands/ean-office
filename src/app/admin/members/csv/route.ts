import { getCurrentUser } from "@/lib/auth";
import { db, users, ensureMigrated } from "@/db";
import { asc } from "drizzle-orm";
import { amsDate, todayAms } from "@/lib/dates";

// The member list as a file. Two jobs: matching the old spreadsheet's first
// names against real accounts, and feeding the newsletter tool the unclaimed
// list for reminders (MEMBER-IMPORT.md) — neither of which should need a
// database password.
//
// Route handlers bypass the admin layout — guard explicitly.
export async function GET() {
  await ensureMigrated();
  const user = await getCurrentUser();
  if (!user || user.role !== "admin") {
    return new Response("Forbidden", { status: 403 });
  }

  const rows = await db.select().from(users).orderBy(asc(users.name));

  const esc = (v: string) => (/[",\n]/.test(v) ? `"${v.replace(/"/g, '""')}"` : v);
  const lines = ["name,email,status,role,source,claimed,guidelines_accepted,last_seen"];
  for (const u of rows) {
    lines.push(
      [
        u.name,
        u.email,
        u.status,
        u.role,
        u.source,
        u.claimedAt ? amsDate(u.claimedAt) : "",
        u.guidelinesAcceptedAt ? amsDate(u.guidelinesAcceptedAt) : "",
        u.lastSeenAt ? amsDate(u.lastSeenAt) : "",
      ]
        .map((v) => esc(String(v ?? "")))
        .join(",")
    );
  }

  return new Response(lines.join("\n"), {
    headers: {
      "Content-Type": "text/csv; charset=utf-8",
      "Content-Disposition": `attachment; filename="ean-office-members-${todayAms()}.csv"`,
    },
  });
}

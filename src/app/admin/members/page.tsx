import { db, users } from "@/db";
import { inArray, asc } from "drizzle-orm";
import { Page, H1, Sub, Icon } from "@/components/ui";
import { flaggedUsers } from "@/lib/noshow";
import { aliasesByUser, findLikelyDuplicates } from "@/lib/users";
import { todayAms } from "@/lib/dates";
import { MembersClient, MemberRow } from "./members-client";

export const dynamic = "force-dynamic";

export default async function MembersPage() {
  const all = await db
    .select()
    .from(users)
    // "declined" is here so a decision can be seen and undone — a declined
    // person is otherwise invisible to admins and silently locked out of login.
    .where(inArray(users.status, ["trial", "active", "inactive", "imported", "declined"]))
    .orderBy(asc(users.name));
  const flagged = await flaggedUsers();
  const flaggedById = new Map(flagged.map((f) => [f.userId, f]));
  const today = todayAms();
  const aliases = await aliasesByUser(all.map((u) => u.id));
  // Same name, two addresses — the shape of "signed up again with my work
  // email", which is otherwise only spotted when two of them show up in the
  // same day's list.
  const duplicates = findLikelyDuplicates(all).map(([a, b]) => ({
    a: { id: a.id, name: a.name, email: a.email },
    b: { id: b.id, name: b.name, email: b.email },
  }));

  const rows: MemberRow[] = all.map((u) => ({
    id: u.id,
    name: u.name,
    email: u.email,
    role: u.role,
    status: u.status,
    trialDate: u.trialDate,
    trialEnded: u.status === "trial" && !!u.trialDate && u.trialDate <= today,
    noShowCount: flaggedById.get(u.id)?.count ?? 0,
    noShowEmailed: !!flaggedById.get(u.id)?.emailedAt,
    noShowOptOut: u.noshowEmailOptOut,
    hasProfile: !!u.causeArea,
    lastSeenAt: u.lastSeenAt ? u.lastSeenAt.toISOString().slice(0, 10) : null,
    source: u.source,
    aliases: aliases.get(u.id) ?? [],
  }));

  const unclaimed = rows.filter((r) => r.status === "imported").length;

  return (
    <Page wide>
      <H1>Members</H1>
      <Sub>
        {rows.filter((r) => r.status === "active" || r.status === "trial").length}{" "}
        active · {rows.filter((r) => r.role === "admin").length} admins ·{" "}
        {flagged.length} flagged for no-shows
        {unclaimed > 0 && <> · {unclaimed} imported, not yet claimed</>}
      </Sub>
      <a
        href="/admin/members/csv"
        download
        className="inline-flex items-center gap-1.5 text-sm text-teal-700 font-medium border border-slate-300 rounded-xl px-3 py-1.5 hover:bg-slate-50 mb-4"
      >
        <Icon name="download" />
        Download as CSV
      </a>
      <MembersClient rows={rows} duplicates={duplicates} />
    </Page>
  );
}

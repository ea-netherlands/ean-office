import { db, users } from "@/db";
import { inArray, asc } from "drizzle-orm";
import { Page, H1, Sub } from "@/components/ui";
import { flaggedUsers } from "@/lib/noshow";
import { todayAms } from "@/lib/dates";
import { MembersClient, MemberRow } from "./members-client";

export const dynamic = "force-dynamic";

export default async function MembersPage() {
  const all = await db
    .select()
    .from(users)
    .where(inArray(users.status, ["trial", "active", "inactive"]))
    .orderBy(asc(users.name));
  const flagged = await flaggedUsers();
  const flaggedById = new Map(flagged.map((f) => [f.userId, f]));
  const today = todayAms();

  const rows: MemberRow[] = all.map((u) => ({
    id: u.id,
    name: u.name,
    email: u.email,
    role: u.role,
    status: u.status,
    trialEndsAt: u.trialEndsAt,
    trialEnded: u.status === "trial" && !!u.trialEndsAt && u.trialEndsAt <= today,
    noShowCount: flaggedById.get(u.id)?.count ?? 0,
    noShowEmailed: !!flaggedById.get(u.id)?.emailedAt,
    noShowOptOut: u.noshowEmailOptOut,
    hasProfile: !!u.causeArea,
    lastSeenAt: u.lastSeenAt ? u.lastSeenAt.toISOString().slice(0, 10) : null,
  }));

  return (
    <Page wide>
      <H1>Members</H1>
      <Sub>
        {rows.filter((r) => r.status !== "inactive").length} active ·{" "}
        {rows.filter((r) => r.role === "admin").length} admins ·{" "}
        {flagged.length} flagged for no-shows
      </Sub>
      <MembersClient rows={rows} />
    </Page>
  );
}

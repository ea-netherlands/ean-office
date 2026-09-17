import { db, guestRequests, visitRequests, users } from "@/db";
import { sql } from "drizzle-orm";

/**
 * A past request tied to the same email, surfaced when an admin is deciding a
 * new one — prompted by declining someone whose earlier, positive visit as a
 * member's guest nobody reviewing the new request knew about. Matched on
 * email rather than user id, since a guest often has no account until (or
 * unless) their request is approved.
 */
export type PriorVisit = {
  date: string;
  status: string;
  kind: "self" | "guest";
  hostName: string | null;
};

/**
 * Every decided visit or guest request for `email`, elsewhere in the system,
 * excluding the one currently being reviewed (`excludeId`) — that one is the
 * card doing the asking, not history. Newest first.
 */
export async function findPriorVisits(
  email: string,
  excludeId: string
): Promise<PriorVisit[]> {
  const normalized = email.trim().toLowerCase();

  const guestRows = await db
    .select({ req: guestRequests, host: users })
    .from(guestRequests)
    .innerJoin(users, sql`${users.id} = ${guestRequests.hostUserId}`)
    .where(sql`lower(${guestRequests.guestEmail}) = ${normalized} and ${guestRequests.status} != 'pending'`);

  const visitRows = await db
    .select({ req: visitRequests, u: users })
    .from(visitRequests)
    .innerJoin(users, sql`${users.id} = ${visitRequests.userId}`)
    .where(sql`lower(${users.email}) = ${normalized} and ${visitRequests.status} in ('approved', 'declined', 'expired')`);

  const out: PriorVisit[] = [];
  for (const r of guestRows) {
    if (r.req.id === excludeId) continue;
    out.push({
      date: r.req.date,
      status: r.req.status,
      kind: "guest",
      hostName: r.host.name,
    });
  }
  for (const r of visitRows) {
    if (r.req.id === excludeId) continue;
    out.push({
      date: r.req.requestedDate,
      status: r.req.status,
      kind: "self",
      hostName: null,
    });
  }

  return out.sort((a, b) => (a.date < b.date ? 1 : -1));
}

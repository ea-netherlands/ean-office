import { db, visitRequests, users } from "@/db";
import { eq, inArray, desc } from "drizzle-orm";
import { Page, H1, Sub } from "@/components/ui";
import { todayAms, workingDaysBetween, amsDate } from "@/lib/dates";
import { RequestCard, RequestInfo } from "./request-card";

export const dynamic = "force-dynamic";

export default async function RequestsPage() {
  const rows = await db
    .select({ req: visitRequests, u: users })
    .from(visitRequests)
    .innerJoin(users, eq(users.id, visitRequests.userId))
    .orderBy(desc(visitRequests.createdAt));

  const open = rows.filter(
    (r) => r.req.status === "pending" || r.req.status === "awaiting_reply"
  );
  const decided = rows
    .filter((r) => ["approved", "declined", "expired"].includes(r.req.status))
    .slice(0, 20);

  const today = todayAms();
  const toInfo = (r: (typeof rows)[number]): RequestInfo => ({
    id: r.req.id,
    status: r.req.status,
    name: r.u.name,
    email: r.u.email,
    descriptor: r.u.descriptor,
    profileUrl: r.u.profileUrl,
    about: r.u.about,
    expectedFrequency: r.u.expectedFrequency,
    accessibilityNotes: r.u.accessibilityNotes,
    requestedDate: r.req.requestedDate,
    requestedArrival: r.req.requestedArrival,
    createdAt: r.req.createdAt.toISOString(),
    // The anti-twelve-day-lag mechanism: amber after two working days.
    stale:
      r.req.status === "pending" &&
      workingDaysBetween(amsDate(r.req.createdAt), today) >= 2,
    declineReason: r.req.declineReason,
  });

  return (
    <Page wide>
      <H1>Visit requests</H1>
      <Sub>
        Every open request should get a decision within one working day —
        cards turn amber after two.
      </Sub>
      {open.length === 0 ? (
        <p className="text-slate-500 bg-white border border-slate-200 rounded-xl p-6 text-center">
          Queue is empty.
        </p>
      ) : (
        <div className="space-y-4">
          {open.map((r) => (
            <RequestCard key={r.req.id} req={toInfo(r)} />
          ))}
        </div>
      )}

      {decided.length > 0 && (
        <>
          <h2 className="font-semibold mt-8 mb-3 text-slate-500">Recently decided</h2>
          <div className="space-y-2">
            {decided.map((r) => (
              <RequestCard key={r.req.id} req={toInfo(r)} compact />
            ))}
          </div>
        </>
      )}
    </Page>
  );
}

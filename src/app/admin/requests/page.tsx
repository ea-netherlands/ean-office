import Link from "next/link";
import { db, visitRequests, users, guestRequests } from "@/db";
import { eq, inArray, desc } from "drizzle-orm";
import { Page, H1, Sub, Notice } from "@/components/ui";
import { todayAms, workingDaysBetween, amsDate } from "@/lib/dates";
import { asSlot } from "@/lib/slots";
import { getSettings } from "@/lib/settings";
import { adminsAway } from "@/lib/away";
import { findPriorVisits, PriorVisit } from "@/lib/visit-history";
import { RequestCard, RequestInfo } from "./request-card";
import { GuestRequestCard, GuestRequestInfo } from "./guest-request-card";

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

  // Members asking for a desk for someone with no account — a separate queue
  // from first-visit requests, but the same one-working-day promise.
  const guestRows = await db
    .select({ req: guestRequests, host: users })
    .from(guestRequests)
    .innerJoin(users, eq(users.id, guestRequests.hostUserId))
    .orderBy(desc(guestRequests.createdAt));
  const guestOpen = guestRows.filter((r) => r.req.status === "pending");
  const guestDecided = guestRows
    .filter((r) => r.req.status !== "pending")
    .slice(0, 10);

  const today = todayAms();
  const away = adminsAway((await getSettings()).admin_back_on, today);

  const toGuestInfo = (
    r: (typeof guestRows)[number],
    priorVisits: PriorVisit[] = []
  ): GuestRequestInfo => ({
    id: r.req.id,
    status: r.req.status,
    hostName: r.host.name,
    hostEmail: r.host.email,
    guestName: r.req.guestName,
    guestEmail: r.req.guestEmail,
    date: r.req.date,
    endDate: r.req.endDate,
    slot: asSlot(r.req.slot),
    visitType: r.req.visitType,
    reason: r.req.reason,
    createdAt: r.req.createdAt.toISOString(),
    stale:
      r.req.status === "pending" &&
      workingDaysBetween(amsDate(r.req.createdAt), today) >= 2,
    declineReason: r.req.declineReason,
    priorVisits,
  });

  const toInfo = (
    r: (typeof rows)[number],
    priorVisits: PriorVisit[] = []
  ): RequestInfo => ({
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
    priorVisits,
  });

  // Prior history only matters while a decision is still open — a decided
  // card is shown compact and doesn't render it, so skip the lookup there.
  const openInfo = await Promise.all(
    open.map(async (r) => toInfo(r, await findPriorVisits(r.u.email, r.req.id)))
  );
  const guestOpenInfo = await Promise.all(
    guestOpen.map(async (r) =>
      toGuestInfo(r, await findPriorVisits(r.req.guestEmail, r.req.id))
    )
  );

  return (
    <Page wide>
      <H1>Visit requests</H1>
      <Sub>
        Every open request should get a decision within one working day —
        cards turn amber after two.
      </Sub>
      {away && (
        <Notice className="mb-4">
          Holiday mode is on: anyone sending a request is being told
          you&apos;re back on {away.back} and that it probably won&apos;t be
          looked at before then. It clears itself that morning — or{" "}
          <Link href="/admin/settings" className="underline">
            turn it off now
          </Link>
          .
        </Notice>
      )}
      {open.length === 0 ? (
        <p className="text-slate-500 bg-white border border-slate-200 rounded-xl p-6 text-center">
          Queue is empty.
        </p>
      ) : (
        <div className="space-y-4">
          {openInfo.map((info) => (
            <RequestCard key={info.id} req={info} />
          ))}
        </div>
      )}

      {guestOpenInfo.length > 0 && (
        <>
          <h2 className="mt-8 mb-3 text-slate-500">
            Guest requests — members bringing someone
          </h2>
          <div className="space-y-4">
            {guestOpenInfo.map((info) => (
              <GuestRequestCard key={info.id} req={info} />
            ))}
          </div>
        </>
      )}

      {guestDecided.length > 0 && (
        <>
          <h2 className="mt-8 mb-3 text-slate-500">Recent guest decisions</h2>
          <div className="space-y-2">
            {guestDecided.map((r) => (
              <GuestRequestCard key={r.req.id} req={toGuestInfo(r)} compact />
            ))}
          </div>
        </>
      )}

      {decided.length > 0 && (
        <>
          <h2 className="mt-8 mb-3 text-slate-500">Recently decided</h2>
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

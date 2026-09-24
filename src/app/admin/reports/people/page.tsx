import Link from "next/link";
import { getUsage, parseBasis, Basis } from "@/lib/usage";
import { Page, H1, Sub, Card, Badge, btnSecondary, Icon } from "@/components/ui";
import { addDays, formatDay, todayAms } from "@/lib/dates";
import { RangePicker } from "../range-picker";

export const dynamic = "force-dynamic";

function pctStr(v: number): string {
  return `${(v * 100).toFixed(0)}%`;
}

// Weekly visit count → teal intensity. Five working days is the ceiling.
const HEAT = ["bg-slate-100", "bg-teal-100", "bg-teal-300", "bg-teal-500", "bg-teal-700"];
function heat(n: number): string {
  return HEAT[Math.min(n, HEAT.length - 1)];
}

export default async function PeopleUsagePage({
  searchParams,
}: {
  searchParams: Promise<{ from?: string; to?: string; basis?: string }>;
}) {
  const sp = await searchParams;
  const today = todayAms();
  const from = /^\d{4}-\d{2}-\d{2}$/.test(sp.from || "") ? sp.from! : addDays(today, -182);
  const to = /^\d{4}-\d{2}-\d{2}$/.test(sp.to || "") ? sp.to! : today;
  const basis = parseBasis(sp.basis);
  const r = await getUsage(from, to, basis);
  const q = `from=${from}&to=${to}&basis=${basis}`;

  return (
    <Page wide>
      <div className="flex items-start justify-between gap-3 flex-wrap">
        <div>
          <H1>Usage per person</H1>
          <Sub>
            Who used the office, how often and how steadily. Use it to see where
            a threshold would fall before you set one.
          </Sub>
        </div>
        <div className="flex gap-2 no-print">
          <Link href={`/admin/reports?from=${from}&to=${to}`} className={btnSecondary}>
            <Icon name="arrow-left" /> Back to reports
          </Link>
          <a href={`/admin/reports/people/csv?${q}`} className={btnSecondary}>
            <Icon name="download" /> CSV
          </a>
        </div>
      </div>

      <RangePicker from={from} to={to} path="/admin/reports/people" extra={`basis=${basis}`} />

      <div className="flex items-center gap-2 flex-wrap mb-4 text-sm no-print">
        <span className="text-slate-500">Count a visit as</span>
        <BasisLink current={basis} value="booked" from={from} to={to}>
          A booking, minus no-shows
        </BasisLink>
        <BasisLink current={basis} value="attended" from={from} to={to}>
          A check-in
        </BasisLink>
      </div>

      <Card className="mb-4">
        <h2 className="mb-1">How often people come in</h2>
        <p className="text-xs text-slate-500 mb-3">
          {r.people.length} people, {r.totalVisits} visits over {r.workingDays} working
          days ({r.weeks.toFixed(1)} weeks), {formatDay(r.from)} to {formatDay(r.pastTo)}.
          Averages are across the whole period, so someone who joined halfway
          through looks lighter than they are — check their first visit.
        </p>
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="text-left text-xs text-slate-500">
                <th className="py-1.5">Average days a week</th>
                <th className="py-1.5 text-right">People</th>
                <th className="py-1.5 text-right">% of people</th>
                <th className="py-1.5 text-right">% of visits</th>
                <th className="py-1.5 text-right">People at this level or more</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {r.bands.map((b) => (
                <tr key={b.label}>
                  <td className="py-1.5 text-slate-600">{b.label}</td>
                  <td className="py-1.5 text-right tabular-nums font-medium">{b.people}</td>
                  <td className="py-1.5 text-right tabular-nums">{pctStr(b.peoplePct)}</td>
                  <td className="py-1.5 text-right tabular-nums">{pctStr(b.visitsPct)}</td>
                  <td className="py-1.5 text-right tabular-nums">{b.atOrAbove}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </Card>

      <Card>
        <h2 className="mb-1">Everyone</h2>
        <p className="text-xs text-slate-500 mb-3">
          Busiest first. The weekly pattern has one square per week, darker for
          more days. Half days count as a visit; the half-day column shows how
          many there were.
        </p>
        {r.people.length === 0 ? (
          <p className="text-sm text-slate-500">No visits in this period.</p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="text-left text-xs text-slate-500 whitespace-nowrap">
                  <th className="py-1.5 pr-3">Name</th>
                  <th className="py-1.5 pr-3">Cause area</th>
                  <th className="py-1.5 pl-3 text-right">Visits</th>
                  <th className="py-1.5 pl-3 text-right">Half days</th>
                  <th className="py-1.5 pl-3 text-right">Per week</th>
                  <th className="py-1.5 pl-3 text-right">Per month</th>
                  <th className="py-1.5 pl-3 text-right" title="Average in the weeks they came in at all">
                    Per active week
                  </th>
                  <th className="py-1.5 pl-3 text-right">Busiest week</th>
                  <th className="py-1.5 pl-3">First</th>
                  <th className="py-1.5 pl-3">Last</th>
                  <th className="py-1.5 pl-3">Weekly pattern</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {r.people.map((p) => (
                  <tr key={p.userId}>
                    <td className="py-1.5 pr-3">
                      <div className="font-medium">{p.name}</div>
                      <div className="flex gap-1 mt-0.5">
                        {p.role === "admin" && <Badge tone="teal">admin</Badge>}
                        {p.status !== "active" && <Badge>{p.status.replace("_", " ")}</Badge>}
                      </div>
                    </td>
                    <td className="py-1.5 pr-3 text-slate-600">{p.causeArea ?? "Not stated"}</td>
                    <td className="py-1.5 text-right tabular-nums font-medium">{p.visits}</td>
                    <td className="py-1.5 text-right tabular-nums">{p.halfDays || "—"}</td>
                    <td className="py-1.5 text-right tabular-nums font-medium">
                      {p.perWeek.toFixed(1)}
                    </td>
                    <td className="py-1.5 text-right tabular-nums">{p.perMonth.toFixed(1)}</td>
                    <td className="py-1.5 text-right tabular-nums">{p.perActiveWeek.toFixed(1)}</td>
                    <td className="py-1.5 text-right tabular-nums">{p.busiestWeek}</td>
                    <td className="py-1.5 pl-3 whitespace-nowrap text-slate-600">
                      {formatDay(p.firstVisit)}
                    </td>
                    <td className="py-1.5 pl-3 whitespace-nowrap text-slate-600">
                      {formatDay(p.lastVisit)}
                    </td>
                    <td className="py-1.5 pl-3">
                      <div className="flex gap-0.5" aria-label={`Visits per week for ${p.name}`}>
                        {r.weekStarts.map((w) => {
                          const n = p.byWeek.get(w) ?? 0;
                          return (
                            <span
                              key={w}
                              title={`Week of ${formatDay(w)}: ${n} day${n === 1 ? "" : "s"}`}
                              className={`block w-2 h-4 rounded-sm ${heat(n)}`}
                            />
                          );
                        })}
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Card>

      <Card className="mt-4">
        <h2 className="mb-1">Raw data</h2>
        <p className="text-sm text-slate-600 mb-3">
          Every booking and check-in in this period, one row each, with the
          person&apos;s profile alongside. The top of the file explains each
          column, so you can give it straight to a spreadsheet or an AI tool
          and ask your own questions. People appear as codes, not names, so
          you aren&apos;t pasting member details into another service. Only
          download the version with names if you need to know who is who.
        </p>
        <div className="flex gap-2 flex-wrap">
          <a href={`/admin/reports/raw?from=${from}&to=${to}`} className={btnSecondary}>
            <Icon name="download" /> Download raw data
          </a>
          <a href={`/admin/reports/raw?from=${from}&to=${to}&names=1`} className={btnSecondary}>
            <Icon name="download" /> With names
          </a>
        </div>
      </Card>
    </Page>
  );
}

function BasisLink({
  current,
  value,
  from,
  to,
  children,
}: {
  current: Basis;
  value: Basis;
  from: string;
  to: string;
  children: React.ReactNode;
}) {
  const active = current === value;
  return (
    <Link
      href={`/admin/reports/people?from=${from}&to=${to}&basis=${value}`}
      aria-current={active ? "true" : undefined}
      className={`px-2.5 py-1 rounded-lg border ${
        active
          ? "border-teal-300 bg-teal-50 text-teal-700 font-medium"
          : "border-slate-200 hover:bg-slate-50"
      }`}
    >
      {children}
    </Link>
  );
}

import Link from "next/link";
import { getReport, methodologyNote, Report } from "@/lib/reports";
import { Page, H1, Sub, Card, Badge, btnSecondary, Icon } from "@/components/ui";
import { addDays, todayAms } from "@/lib/dates";
import { RangePicker } from "./range-picker";

export const dynamic = "force-dynamic";

function pctStr(v: number, digits = 0): string {
  return `${(v * 100).toFixed(digits)}%`;
}

export default async function ReportsPage({
  searchParams,
}: {
  searchParams: Promise<{ from?: string; to?: string }>;
}) {
  const sp = await searchParams;
  const today = todayAms();
  const from = /^\d{4}-\d{2}-\d{2}$/.test(sp.from || "") ? sp.from! : addDays(today, -182);
  const to = /^\d{4}-\d{2}-\d{2}$/.test(sp.to || "") ? sp.to! : today;
  const r = await getReport(from, to);
  const q = `from=${from}&to=${to}`;

  return (
    <Page wide>
      <div className="flex items-start justify-between gap-3 flex-wrap">
        <div>
          <H1>M&amp;E reports</H1>
          <Sub>
            The EAIF view — every figure here is one EAN reports or targets.
            Occupancy is always a percentage of the 8 desks, never total seats.
          </Sub>
        </div>
        <div className="flex gap-2 no-print">
          <a href={`/admin/reports/csv?${q}`} className={btnSecondary}>
            <Icon name="download" /> CSV
          </a>
          <Link href={`/admin/reports/print?${q}`} className={btnSecondary}>
            <Icon name="printer" /> One-page report
          </Link>
        </div>
      </div>

      <RangePicker from={from} to={to} />

      {/* Data quality panel — always visible, never hidden */}
      <Card className="mb-4 border-teal-300 bg-teal-50/50">
        <h2 className="mb-2">Data quality</h2>
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 mb-3">
          <Stat
            label="Check-in rate"
            value={pctStr(r.checkinRate)}
            warn={r.checkinRate < r.checkinRateTarget}
            hint={`target ${pctStr(r.checkinRateTarget)}`}
          />
          <Stat label="Retroactive check-ins" value={String(r.retroCheckins)} />
          <Stat
            label="Fresh profiles (people)"
            value={pctStr(r.profileCoveragePeople)}
          />
          <Stat
            label="Fresh profiles (desk-days)"
            value={pctStr(r.profileCoverageDeskDays)}
          />
        </div>
        <p className="text-xs text-slate-500 italic">{methodologyNote(r)}</p>
        {r.checkinRate < r.checkinRateTarget && (
          <p className="text-xs text-orange-700 mt-2">
            Check-in rate is below target — that&apos;s a problem to fix in the
            room (a reminder at lunch, a bigger sticker), not in the code.
          </p>
        )}
      </Card>

      {/* Usage */}
      <Card className="mb-4">
        <h2 className="mb-3">Usage</h2>
        <MetricTable
          rows={[
            ["Visits — attended (check-ins)", String(r.visitsAttended), "—"],
            ["Visits — booked", String(r.visitsBooked), "—"],
            ["Visits per month (attended)", r.visitsPerMonth.toFixed(0), "—"],
            ["Unique visitors (period)", String(r.uniqueVisitors), "—"],
            ["Unique visitors per month", r.uniqueVisitorsPerMonth.toFixed(0), "—"],
            [
              "Avg daily occupancy — booked",
              pctStr(r.occupancyBooked),
              "75%",
              r.occupancyBooked >= 0.75,
            ],
            [
              "Avg daily occupancy — attended",
              pctStr(r.occupancyAttended),
              "75%",
              r.occupancyAttended >= 0.75,
            ],
            [
              "Lunch-table days used (overflow)",
              r.flexDaysUsed.toFixed(r.flexDaysUsed % 1 === 0 ? 0 : 1),
              "—",
            ],
            [
              "Half-day bookings",
              r.halfDayBookings > 0
                ? `${r.halfDayBookings} (${pctStr(r.halfDayShare)} of bookings)`
                : "0",
              "—",
            ],
            ["Walk-ins", String(r.walkIns), "—"],
            ["Days with a waitlist", String(r.waitlistedDays), "—"],
            ["New members onboarded", String(r.newMembers), "—"],
            [
              "Trial → regular conversion",
              r.trialsEnded > 0
                ? `${r.trialsConverted}/${r.trialsEnded} (${pctStr(r.trialsConverted / r.trialsEnded)})`
                : "no trials ended",
              "—",
            ],
          ]}
        />
        <p className="text-xs text-slate-500 mt-3">
          The gap between booked and attended occupancy is the no-show rate —
          shrinking it is reportable progress in its own right.{" "}
          <strong>Historical note:</strong> the previously reported 62% (to
          Sept &apos;25) was manually verified bookings — a differently-derived
          series. Don&apos;t graph it continuously with either measure above;
          expect the attended number to be lower, and say why. A defensible
          60% beats an unreproducible 75%.
        </p>
      </Card>

      {/* Events */}
      <Card className="mb-4">
        <h2 className="mb-3">Events</h2>
        <MetricTable
          rows={[
            [
              "Events per month",
              (r.eventCount / r.months).toFixed(1),
              "2–4",
              r.eventCount / r.months >= 2 && r.eventCount / r.months <= 4,
            ],
            [
              "Participants per month",
              (r.eventParticipants / r.months).toFixed(0),
              "20–40",
              r.eventParticipants / r.months >= 20,
            ],
            ["Events (period)", String(r.eventCount), "—"],
            ["Participants (period)", String(r.eventParticipants), "—"],
            ["Average per event", r.avgPerEvent.toFixed(1), "—"],
            [
              "Themed coworking days / month",
              (r.themedDays / r.months).toFixed(1),
              "1–2",
              r.themedDays / r.months >= 1,
            ],
            ["Themed-day participants", String(r.themedParticipants), "—"],
          ]}
        />
        {r.eventsByType.length > 0 && (
          <div className="mt-3 flex flex-wrap gap-2">
            {r.eventsByType.map((t) => (
              <Badge key={t.type}>
                {t.type.replace("_", " ")}: {t.count} ({t.participants} ppl)
              </Badge>
            ))}
          </div>
        )}
      </Card>

      {/* Demographics */}
      <Card className="mb-4">
        <h2 className="mb-1">Who uses the office</h2>
        <p className="text-xs text-slate-500 mb-3">
          From intake profiles, weighted by attendance. Each figure twice — %
          of people and % of desk-days. When they diverge, that&apos;s your
          heaviest users showing themselves.
        </p>
        <MetricTable
          header={["Headline", "% of people", "% of desk-days", "Target"]}
          rows={[
            [
              "Working on existential risk reduction",
              pctStr(r.pctXRisk.people),
              pctStr(r.pctXRisk.deskDays),
              "20–40%",
              r.pctXRisk.deskDays >= 0.2 && r.pctXRisk.deskDays <= 0.4,
            ],
            [
              "Funded (directly/indirectly) by an EA funder",
              pctStr(r.pctEaFunded.people),
              pctStr(r.pctEaFunded.deskDays),
              ">50%",
              r.pctEaFunded.deskDays > 0.5,
            ],
            [
              "Working on EA-aligned cause areas",
              pctStr(r.pctEaAligned.people),
              pctStr(r.pctEaAligned.deskDays),
              ">80%",
              r.pctEaAligned.deskDays > 0.8,
            ],
          ]}
        />
        <Breakdown title="Cause area" rows={r.causeAreas} />
        <Breakdown title="Experience (target ~⅓ each across levels)" rows={r.experience} />
        <Breakdown title="EA funding" rows={r.funding} />
        <Breakdown title="Gender (target ~40% F)" rows={r.gender} />
      </Card>

      {/* What still needs the survey */}
      <Card>
        <h2 className="mb-2">Still needs the annual survey</h2>
        <p className="text-sm text-slate-600">
          The app can&apos;t produce these and doesn&apos;t try: new
          connections made, additional productive hours, counterfactual
          importance, impact stories, NPS. What it <em>can</em> do: email the
          survey to everyone with a check-in this period ({r.uniqueVisitors}{" "}
          people) and report the response rate against known users, so
          responses can be weighted by attendance.
        </p>
      </Card>
    </Page>
  );
}

function Stat({
  label,
  value,
  hint,
  warn,
}: {
  label: string;
  value: string;
  hint?: string;
  warn?: boolean;
}) {
  return (
    <div>
      <p className={`text-xl font-bold ${warn ? "text-orange-600" : ""}`}>{value}</p>
      <p className="text-xs text-slate-500">
        {label}
        {hint ? ` · ${hint}` : ""}
      </p>
    </div>
  );
}

function MetricTable({
  rows,
  header,
}: {
  rows: (string | boolean | undefined)[][];
  header?: string[];
}) {
  const cols = header?.length ?? 3;
  return (
    <div className="overflow-x-auto">
      <table className="w-full text-sm">
        <thead>
          <tr className="text-left text-xs text-slate-500">
            {(header ?? ["Metric", "Current", "Target"]).map((h, i) => (
              <th key={i} className={`py-1.5 ${i > 0 ? "text-right" : ""}`}>
                {h}
              </th>
            ))}
            <th></th>
          </tr>
        </thead>
        <tbody className="divide-y divide-slate-100">
          {rows.map((row, i) => {
            const onTarget = row[cols] as boolean | undefined;
            return (
              <tr key={i}>
                {row.slice(0, cols).map((cell, j) => (
                  <td
                    key={j}
                    className={`py-1.5 ${j > 0 ? "text-right font-medium tabular-nums" : "text-slate-600"}`}
                  >
                    {cell as string}
                  </td>
                ))}
                <td className="py-1.5 pl-2 w-6 text-right">
                  {onTarget === true && <Icon name="circle-check" className="text-green-600" />}
                  {onTarget === false && <Icon name="alert-triangle" className="text-orange-500" />}
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}

function Breakdown({
  title,
  rows,
}: {
  title: string;
  rows: Report["causeAreas"];
}) {
  if (rows.length === 0) return null;
  return (
    <div className="mt-4">
      <h3 className="text-sm font-medium text-slate-500 mb-1">{title}</h3>
      <div className="overflow-x-auto">
        <table className="w-full text-sm">
          <tbody className="divide-y divide-slate-100">
            {rows.map((row) => (
              <tr key={row.label}>
                <td className="py-1 text-slate-600">{row.label}</td>
                <td className="py-1 text-right tabular-nums w-32">
                  {(row.peoplePct * 100).toFixed(0)}% of people
                </td>
                <td className="py-1 text-right tabular-nums w-36 font-medium">
                  {(row.deskDaysPct * 100).toFixed(0)}% of desk-days
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

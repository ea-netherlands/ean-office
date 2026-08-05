import { getReport, methodologyNote } from "@/lib/reports";
import { addDays, formatDayLong, todayAms } from "@/lib/dates";
import { PrintButton } from "./print-button";

export const dynamic = "force-dynamic";

function pct(v: number): string {
  return `${(v * 100).toFixed(0)}%`;
}

// One page, laid out in the order the EAIF form asks for it.
// Use the browser's print dialog to save as PDF.
export default async function PrintReportPage({
  searchParams,
}: {
  searchParams: Promise<{ from?: string; to?: string }>;
}) {
  const sp = await searchParams;
  const today = todayAms();
  const from = /^\d{4}-\d{2}-\d{2}$/.test(sp.from || "") ? sp.from! : addDays(today, -182);
  const to = /^\d{4}-\d{2}-\d{2}$/.test(sp.to || "") ? sp.to! : today;
  const r = await getReport(from, to);

  return (
    <main className="max-w-2xl mx-auto px-8 py-10 text-[13px] leading-relaxed bg-white min-h-screen">
      <PrintButton />
      <h1 className="text-xl">EA Netherlands Office — usage report</h1>
      <p className="text-slate-500 mb-6">
        {formatDayLong(from)} – {formatDayLong(to)} · generated {formatDayLong(today)}
      </p>

      <Section title="Office usage">
        <Row k="Visits (desk-days, attended)" v={String(r.visitsAttended)} />
        <Row k="Visits per month" v={r.visitsPerMonth.toFixed(0)} />
        <Row k="Unique visitors per month" v={r.uniqueVisitorsPerMonth.toFixed(0)} />
        <Row
          k="Average daily occupancy — attended (of 8 desks)"
          v={pct(r.occupancyAttended)}
          t="target 75%"
        />
        <Row k="Average daily occupancy — booked" v={pct(r.occupancyBooked)} />
        <Row k="New members onboarded" v={String(r.newMembers)} />
        <Row
          k="Trial → regular conversion"
          v={r.trialsEnded > 0 ? `${r.trialsConverted}/${r.trialsEnded}` : "n/a"}
        />
      </Section>

      <Section title="Events">
        <Row k="Events" v={`${r.eventCount} (${(r.eventCount / r.months).toFixed(1)}/month)`} t="target 2–4/month" />
        <Row
          k="Event participants"
          v={`${r.eventParticipants} (${(r.eventParticipants / r.months).toFixed(0)}/month)`}
          t="target 20–40/month"
        />
        <Row k="Themed coworking days" v={`${r.themedDays} (${(r.themedDays / r.months).toFixed(1)}/month)`} t="target 1–2/month" />
        <Row k="Themed-day participants" v={String(r.themedParticipants)} />
      </Section>

      <Section title="Who uses the office (% of people / % of desk-days)">
        <Row
          k="Working on existential risk reduction"
          v={`${pct(r.pctXRisk.people)} / ${pct(r.pctXRisk.deskDays)}`}
          t="target 20–40%"
        />
        <Row
          k="Funded by an EA-aligned funder"
          v={`${pct(r.pctEaFunded.people)} / ${pct(r.pctEaFunded.deskDays)}`}
          t="target >50%"
        />
        <Row
          k="Working on EA-aligned cause areas"
          v={`${pct(r.pctEaAligned.people)} / ${pct(r.pctEaAligned.deskDays)}`}
          t="target >80%"
        />
        {r.experience.map((e) => (
          <Row key={e.label} k={`Experience: ${e.label}`} v={`${pct(e.peoplePct)} / ${pct(e.deskDaysPct)}`} />
        ))}
        {r.gender
          .filter((g) => g.label === "Woman")
          .map((g) => (
            <Row key={g.label} k="Female visitors" v={`${pct(g.peoplePct)} / ${pct(g.deskDaysPct)}`} t="target ~40%" />
          ))}
      </Section>

      <Section title="Methodology">
        <p className="text-slate-600">{methodologyNote(r)}</p>
        <p className="text-slate-600 mt-2">
          Occupancy before this system (to Sept 2025) was derived from manually
          verified bookings by a former co-director; that process ended with
          her departure and has been replaced by automated QR check-in, which
          is stricter. The two series are not directly comparable.
        </p>
      </Section>
    </main>
  );
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section className="mb-5">
      <h2 className="border-b border-slate-300 pb-1 mb-2">{title}</h2>
      {children}
    </section>
  );
}

function Row({ k, v, t }: { k: string; v: string; t?: string }) {
  return (
    <div className="flex justify-between gap-4 py-0.5">
      <span className="text-slate-700">{k}</span>
      <span className="font-semibold whitespace-nowrap">
        {v} {t && <span className="font-normal text-slate-400">({t})</span>}
      </span>
    </div>
  );
}

import type { PeriodRow, Report, Trend } from "@/lib/reports";
import { Icon } from "@/components/ui";
import { parseDay } from "@/lib/dates";

const MONTHS = [
  "Jan", "Feb", "Mar", "Apr", "May", "Jun",
  "Jul", "Aug", "Sep", "Oct", "Nov", "Dec",
];

function dayMonth(day: string): string {
  const d = parseDay(day);
  return `${d.getUTCDate()} ${MONTHS[d.getUTCMonth()]}`;
}

function perDay(n: number, days: number): number {
  return days === 0 ? 0 : n / days;
}

const VERDICT: Record<Trend["direction"], { icon: string; word: string }> = {
  up: { icon: "trending-up", word: "Going up" },
  down: { icon: "trending-down", word: "Going down" },
  steady: { icon: "arrow-narrow-right", word: "Holding steady" },
  unknown: { icon: "hourglass", word: "Too early to say" },
};

function Verdict({
  label,
  trend,
  unit,
}: {
  label: string;
  trend: Trend;
  unit: "week" | "month";
}) {
  const v = VERDICT[trend.direction];
  const detail =
    trend.direction === "unknown"
      ? `Pick a longer range: this needs at least ${unit === "week" ? "8 full weeks" : "4 full months"}.`
      : trend.direction === "steady"
        ? `About ${trend.average.toFixed(1)} a working day, with no clear trend.`
        : `From about ${trend.from.toFixed(1)} to about ${trend.to.toFixed(1)} a working day.`;
  return (
    <div className="border border-dashed border-slate-300 rounded-xl p-4">
      <p className="text-xs text-slate-500">{label}</p>
      <p className="text-lg font-medium text-slate-900 flex items-center gap-1.5">
        <Icon name={v.icon} className="text-teal-700" />
        {v.word}
      </p>
      <p className="text-sm text-slate-600">{detail}</p>
    </div>
  );
}

// Same picture as the weekday chart: attended sits inside booked, and the
// light remainder is the no-show gap. Server-rendered; hover and keyboard
// focus show the detail. A bucket the range or today cuts short is drawn
// faded and left out of the verdicts.
export function VisitsOverTime({ data }: { data: Report["overTime"] }) {
  const { rows, unit } = data;
  if (rows.length === 0) {
    return <p className="text-sm text-slate-600">No visits recorded in this range yet.</p>;
  }

  const peak = Math.max(
    ...rows.map((r) => perDay(Math.max(r.visitsBooked, r.visitsAttended), r.days))
  );
  const top = Math.max(4, Math.ceil(peak / 4) * 4);
  const grid = [top, (top * 3) / 4, top / 2, top / 4, 0];
  const name = (r: PeriodRow) =>
    unit === "week"
      ? `Week of ${dayMonth(r.start)}`
      : `${MONTHS[parseDay(r.start).getUTCMonth()]} ${r.start.slice(0, 4)}`;
  // Label the first bar of each month only, so forty bars stay readable.
  const axisLabel = (r: PeriodRow, i: number) => {
    const m = r.start.slice(0, 7);
    return i === 0 || rows[i - 1].start.slice(0, 7) !== m
      ? MONTHS[parseInt(m.slice(5), 10) - 1]
      : "";
  };
  const anyPartial = rows.some((r) => !r.complete);

  return (
    <div>
      <div className="grid gap-3 sm:grid-cols-2 mb-4">
        <Verdict label="Visits booked" trend={data.booked} unit={unit} />
        <Verdict label="Visits attended (check-ins)" trend={data.attended} unit={unit} />
      </div>

      <div className="flex flex-wrap gap-x-4 gap-y-1 text-xs text-slate-600 mb-3">
        <span className="flex items-center gap-1.5">
          <span className="inline-block w-3 h-3 rounded-sm bg-teal-600" />
          Attended
        </span>
        <span className="flex items-center gap-1.5">
          <span className="inline-block w-3 h-3 rounded-sm bg-teal-200" />
          Booked, didn&apos;t check in
        </span>
        {anyPartial && (
          <span className="flex items-center gap-1.5">
            <span className="inline-block w-3 h-3 rounded-sm bg-teal-600 opacity-40" />
            Part {unit}, not in the verdict
          </span>
        )}
      </div>

      <div className="flex gap-2">
        <div className="relative h-48 w-6 shrink-0 text-xs text-slate-500 tabular-nums">
          {grid.map((g) => (
            <span
              key={g}
              className="absolute right-0 -translate-y-1/2"
              style={{ top: `${(1 - g / top) * 100}%` }}
            >
              {g}
            </span>
          ))}
        </div>

        <div className="flex-1 min-w-0">
          <div className="relative h-48 border-b border-slate-300">
            {grid.slice(0, -1).map((g) => (
              <div
                key={g}
                className="absolute inset-x-0 border-t border-slate-100"
                style={{ top: `${(1 - g / top) * 100}%` }}
              />
            ))}

            <div className="absolute inset-0 flex">
              {rows.map((r, i) => {
                const booked = perDay(r.visitsBooked, r.days);
                const attended = perDay(r.visitsAttended, r.days);
                const outer = Math.max(booked, attended);
                // Keep the tooltip on the card at either end of the chart.
                const side =
                  i < rows.length / 3
                    ? "left-0"
                    : i >= (rows.length * 2) / 3
                      ? "right-0"
                      : "left-1/2 -translate-x-1/2";
                return (
                  <div
                    key={r.start}
                    tabIndex={0}
                    className="group relative flex-1 flex justify-center items-end h-full px-px sm:px-0.5 outline-none"
                    aria-label={`${name(r)}: ${attended.toFixed(1)} attended and ${booked.toFixed(1)} booked a working day`}
                  >
                    <div
                      className={`relative w-full max-w-10 bg-teal-200 rounded-t transition-colors group-hover:bg-teal-300 group-focus-visible:bg-teal-300 ${r.complete ? "" : "opacity-40"}`}
                      style={{ height: `${(outer / top) * 100}%` }}
                    >
                      <div
                        className="absolute inset-x-0 bottom-0 bg-teal-600 rounded-t border-t-2 border-white"
                        style={{
                          height: `${outer === 0 ? 0 : (attended / outer) * 100}%`,
                        }}
                      />
                    </div>

                    <div
                      role="tooltip"
                      className={`pointer-events-none absolute bottom-full mb-2 ${side} z-20 hidden group-hover:block group-focus-visible:block w-max rounded-lg border border-slate-200 bg-white px-3 py-2 text-xs shadow-md`}
                    >
                      <p className="font-medium text-slate-900 mb-1">
                        {name(r)}
                        <span className="font-normal text-slate-500">
                          {" "}· {r.days} working {r.days === 1 ? "day" : "days"}
                          {r.complete ? "" : `, part ${unit}`}
                        </span>
                      </p>
                      <dl className="grid grid-cols-[auto_auto_auto] gap-x-4 gap-y-0.5 text-slate-600">
                        <dt>Attended</dt>
                        <dd className="text-right font-medium text-slate-900 tabular-nums">
                          {r.visitsAttended}
                        </dd>
                        <dd className="text-right tabular-nums">{attended.toFixed(1)} a day</dd>
                        <dt>Booked</dt>
                        <dd className="text-right font-medium text-slate-900 tabular-nums">
                          {r.visitsBooked}
                        </dd>
                        <dd className="text-right tabular-nums">{booked.toFixed(1)} a day</dd>
                      </dl>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>

          <div className="flex mt-2">
            {rows.map((r, i) => (
              <div key={r.start} className="flex-1 min-w-0">
                <p className="text-xs text-slate-600 whitespace-nowrap">{axisLabel(r, i)}</p>
              </div>
            ))}
          </div>
        </div>
      </div>

      <p className="text-xs text-slate-500 mt-3">
        A verdict is a straight line through the full {unit}s. It only says up
        or down when the line moves by more than a tenth and stands clear of
        the usual {unit}-to-{unit} swings. Recent {unit}s can still rise a
        little as people answer for missed check-ins.
      </p>

      <details className="mt-3 text-sm">
        <summary className="cursor-pointer text-teal-700">Show as a table</summary>
        <div className="overflow-x-auto mt-2">
          <table className="w-full text-sm">
            <thead>
              <tr className="text-left text-xs text-slate-500">
                <th className="py-1.5">{unit === "week" ? "Week of" : "Month"}</th>
                <th className="py-1.5 text-right">Working days</th>
                <th className="py-1.5 text-right">Booked</th>
                <th className="py-1.5 text-right">Attended</th>
                <th className="py-1.5 text-right">Booked a day</th>
                <th className="py-1.5 text-right">Attended a day</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {rows.map((r) => (
                <tr key={r.start}>
                  <td className="py-1.5 text-slate-600">
                    {unit === "week" ? dayMonth(r.start) : name(r)}
                    {r.complete ? "" : ` (part ${unit})`}
                  </td>
                  <td className="py-1.5 text-right tabular-nums">{r.days}</td>
                  <td className="py-1.5 text-right tabular-nums">{r.visitsBooked}</td>
                  <td className="py-1.5 text-right tabular-nums">{r.visitsAttended}</td>
                  <td className="py-1.5 text-right tabular-nums font-medium">
                    {perDay(r.visitsBooked, r.days).toFixed(1)}
                  </td>
                  <td className="py-1.5 text-right tabular-nums font-medium">
                    {perDay(r.visitsAttended, r.days).toFixed(1)}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </details>
    </div>
  );
}

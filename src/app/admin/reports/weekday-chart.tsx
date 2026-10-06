import type { WeekdayRow } from "@/lib/reports";

const NAMES = ["", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday"];
const GRID = [1, 0.75, 0.5, 0.25, 0];
const TARGET = 0.75;

function pct(v: number): string {
  return `${Math.round(v * 100)}%`;
}

// Booked and attended share one bar: attended is always a subset of booked,
// so the solid part sits inside the light one and the light remainder is the
// no-show gap. Server-rendered; hover and keyboard focus show the detail.
export function WeekdayChart({ rows }: { rows: WeekdayRow[] }) {
  return (
    <div>
      <div className="flex flex-wrap gap-x-4 gap-y-1 text-xs text-slate-600 mb-3">
        <span className="flex items-center gap-1.5">
          <span className="inline-block w-3 h-3 rounded-sm bg-teal-600" />
          Attended
        </span>
        <span className="flex items-center gap-1.5">
          <span className="inline-block w-3 h-3 rounded-sm bg-teal-200" />
          Booked, didn&apos;t check in
        </span>
        <span className="flex items-center gap-1.5">
          <span className="inline-block w-4 border-t-2 border-dashed border-slate-500" />
          Target {pct(TARGET)}
        </span>
      </div>

      <div className="flex gap-2">
        {/* y axis labels */}
        <div className="relative h-48 w-9 shrink-0 text-xs text-slate-500 tabular-nums">
          {GRID.map((g) => (
            <span
              key={g}
              className="absolute right-0 -translate-y-1/2"
              style={{ top: `${(1 - g) * 100}%` }}
            >
              {pct(g)}
            </span>
          ))}
        </div>

        <div className="flex-1 min-w-0">
          <div className="relative h-48 border-b border-slate-300">
            {GRID.slice(0, -1).map((g) => (
              <div
                key={g}
                className={`absolute inset-x-0 ${
                  g === TARGET
                    ? "border-t-2 border-dashed border-slate-500 z-10"
                    : "border-t border-slate-100"
                }`}
                style={{ top: `${(1 - g) * 100}%` }}
              />
            ))}

            <div className="absolute inset-0 flex">
              {rows.map((r) => (
                <div
                  key={r.weekday}
                  tabIndex={0}
                  className="group relative flex-1 flex justify-center items-end h-full px-1.5 sm:px-4 outline-none"
                  aria-label={`${NAMES[r.weekday]}: ${pct(r.occupancyAttended)} attended, ${pct(r.occupancyBooked)} booked`}
                >
                  <div
                    className="relative w-full max-w-16 bg-teal-200 rounded-t transition-colors group-hover:bg-teal-300 group-focus-visible:bg-teal-300"
                    style={{ height: `${Math.min(1, r.occupancyBooked) * 100}%` }}
                  >
                    <div
                      className="absolute inset-x-0 bottom-0 bg-teal-600 rounded-t border-t-2 border-white"
                      style={{
                        height: `${r.occupancyBooked === 0 ? 0 : (r.occupancyAttended / r.occupancyBooked) * 100}%`,
                      }}
                    />
                  </div>

                  <div
                    role="tooltip"
                    className="pointer-events-none absolute bottom-full mb-2 left-1/2 -translate-x-1/2 z-20 hidden group-hover:block group-focus-visible:block w-max rounded-lg border border-slate-200 bg-white px-3 py-2 text-xs shadow-md"
                  >
                    <p className="font-medium text-slate-900 mb-1">
                      {NAMES[r.weekday]}
                      <span className="font-normal text-slate-500">
                        {" "}· {r.days} {r.days === 1 ? "day" : "days"}
                      </span>
                    </p>
                    {r.days === 0 ? (
                      <p className="text-slate-600">None in this period</p>
                    ) : (
                      <dl className="grid grid-cols-[auto_auto] gap-x-4 gap-y-0.5 text-slate-600">
                        <dt>Attended</dt>
                        <dd className="text-right font-medium text-slate-900 tabular-nums">
                          {pct(r.occupancyAttended)}
                        </dd>
                        <dt>Booked</dt>
                        <dd className="text-right font-medium text-slate-900 tabular-nums">
                          {pct(r.occupancyBooked)}
                        </dd>
                        <dt>Lunch table, per day</dt>
                        <dd className="text-right font-medium text-slate-900 tabular-nums">
                          {r.flexPerDay.toFixed(1)}
                        </dd>
                      </dl>
                    )}
                  </div>
                </div>
              ))}
            </div>
          </div>

          <div className="flex mt-2">
            {rows.map((r) => (
              <div key={r.weekday} className="flex-1 text-center">
                <p className="text-xs text-slate-600">
                  <span className="sm:hidden">{NAMES[r.weekday].slice(0, 3)}</span>
                  <span className="hidden sm:inline">{NAMES[r.weekday]}</span>
                </p>
                <p className="text-sm font-medium text-slate-900 tabular-nums">
                  {r.days === 0 ? "—" : pct(r.occupancyAttended)}
                </p>
              </div>
            ))}
          </div>
        </div>
      </div>

      <details className="mt-4 text-sm">
        <summary className="cursor-pointer text-teal-700">Show as a table</summary>
        <div className="overflow-x-auto mt-2">
          <table className="w-full text-sm">
            <thead>
              <tr className="text-left text-xs text-slate-500">
                <th className="py-1.5">Day</th>
                <th className="py-1.5 text-right">Days in period</th>
                <th className="py-1.5 text-right">Attended</th>
                <th className="py-1.5 text-right">Booked</th>
                <th className="py-1.5 text-right">Lunch table, per day</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {rows.map((r) => (
                <tr key={r.weekday}>
                  <td className="py-1.5 text-slate-600">{NAMES[r.weekday]}</td>
                  <td className="py-1.5 text-right tabular-nums">{r.days}</td>
                  <td className="py-1.5 text-right tabular-nums font-medium">
                    {pct(r.occupancyAttended)}
                  </td>
                  <td className="py-1.5 text-right tabular-nums font-medium">
                    {pct(r.occupancyBooked)}
                  </td>
                  <td className="py-1.5 text-right tabular-nums">
                    {r.flexPerDay.toFixed(1)}
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

"use client";

import { useMemo } from "react";
import { formatDayLong, isoWeekday } from "@/lib/dates";
import { Icon } from "@/components/ui";

export type CoworkingDayInfo = {
  date: string;
  /** People already booked at the fuller half of the day. */
  booked: number;
  total: number;
  coworking: { status: "confirmed" | "pending"; title: string | null } | null;
  eveningEvent: string | null;
};

const DOW = ["Mon", "Tue", "Wed", "Thu", "Fri"];

/**
 * Weekdays only, five to a row, each showing how many people have already
 * booked that day — the number that decides whether a day is a good one to
 * take over.
 */
export function DayPicker({
  days,
  selected,
  onSelect,
}: {
  days: CoworkingDayInfo[];
  selected: string;
  onSelect: (date: string) => void;
}) {
  const weeks = useMemo(() => groupIntoWeeks(days), [days]);

  return (
    <div>
      <div className="grid grid-cols-5 gap-1 text-center text-[10px] font-medium text-slate-400 mb-1">
        {DOW.map((d) => (
          <span key={d}>{d}</span>
        ))}
      </div>
      <div className="space-y-1">
        {weeks.map((week, i) => (
          <div key={i} className="grid grid-cols-5 gap-1">
            {week.map((day, j) =>
              day ? (
                <DayCell
                  key={day.date}
                  day={day}
                  selected={day.date === selected}
                  onSelect={onSelect}
                />
              ) : (
                <span key={`gap-${i}-${j}`} />
              )
            )}
          </div>
        ))}
      </div>
      <div className="flex flex-wrap gap-3 mt-3 text-[11px] text-slate-500">
        <Legend swatch="bg-white border border-slate-200" label="Quiet day" />
        <Legend swatch="bg-orange-100 border border-orange-200" label="Several desks booked" />
        <Legend swatch="bg-slate-200 border border-slate-300" label="Already taken" />
      </div>
    </div>
  );
}

function DayCell({
  day,
  selected,
  onSelect,
}: {
  day: CoworkingDayInfo;
  selected: boolean;
  onSelect: (date: string) => void;
}) {
  const taken = !!day.coworking;
  const busy = day.booked >= Math.ceil(day.total / 2);
  const dayNum = parseInt(day.date.slice(8, 10), 10);

  let tone = "bg-white border-slate-200 hover:bg-teal-50 text-slate-700";
  if (taken) tone = "bg-slate-200 border-slate-300 text-slate-500";
  else if (busy) tone = "bg-orange-50 border-orange-200 text-orange-800 hover:bg-orange-100";

  const label = taken
    ? day.coworking!.status === "confirmed"
      ? `${formatDayLong(day.date)} — ${day.coworking!.title} is already running that day`
      : `${formatDayLong(day.date)} — a co-working day is already proposed for this date`
    : `${formatDayLong(day.date)} — ${day.booked} of ${day.total} spots already booked${
        day.eveningEvent ? `, and ${day.eveningEvent} in the evening` : ""
      }`;

  return (
    <button
      type="button"
      disabled={taken}
      onClick={() => onSelect(day.date)}
      title={label}
      aria-label={label}
      className={`rounded-lg border px-1 py-1.5 text-center disabled:cursor-not-allowed cursor-pointer ${tone} ${
        selected ? "ring-2 ring-teal-600 border-teal-600" : ""
      }`}
    >
      <span className="block text-xs font-semibold">{dayNum}</span>
      <span className="block text-[9px] leading-tight">
        {taken ? "taken" : day.booked === 0 ? "free" : `${day.booked} in`}
      </span>
      {day.eveningEvent && !taken && (
        <Icon name="moon" className="text-[9px] text-slate-400" />
      )}
    </button>
  );
}

/** Mon–Fri rows, with blanks where a month or the lookahead starts mid-week. */
function groupIntoWeeks(days: CoworkingDayInfo[]): (CoworkingDayInfo | null)[][] {
  const weeks: (CoworkingDayInfo | null)[][] = [];
  let week: (CoworkingDayInfo | null)[] = [];
  let cursor = 1;
  for (const day of days) {
    const wd = isoWeekday(day.date);
    if (wd < cursor && week.length > 0) {
      while (week.length < 5) week.push(null);
      weeks.push(week);
      week = [];
      cursor = 1;
    }
    while (cursor < wd) {
      week.push(null);
      cursor++;
    }
    week.push(day);
    cursor++;
  }
  if (week.length > 0) {
    while (week.length < 5) week.push(null);
    weeks.push(week);
  }
  return weeks;
}

function Legend({ swatch, label }: { swatch: string; label: string }) {
  return (
    <span className="flex items-center gap-1.5">
      <span className={`w-3 h-3 rounded-full inline-block ${swatch}`} />
      {label}
    </span>
  );
}

"use client";

import { useMemo } from "react";
import { addDays, isoWeekday, todayAms, formatDayLong } from "@/lib/dates";

export type Availability = {
  date: string;
  status: "confirmed" | "pending";
  title: string | null;
};

const WEEKS = 8;
const DOW = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];
const MONTH_SHORT = [
  "Jan", "Feb", "Mar", "Apr", "May", "Jun",
  "Jul", "Aug", "Sep", "Oct", "Nov", "Dec",
];

export function AvailabilityCalendar({
  availability,
  selected,
  onSelect,
}: {
  availability: Availability[];
  selected: string;
  onSelect: (date: string) => void;
}) {
  const today = todayAms();
  const byDate = useMemo(() => new Map(availability.map((a) => [a.date, a])), [availability]);

  const days = useMemo(() => {
    const gridStart = addDays(today, -(isoWeekday(today) - 1));
    return Array.from({ length: WEEKS * 7 }, (_, i) => addDays(gridStart, i));
  }, [today]);

  const focused = byDate.get(selected);

  return (
    <div>
      <div className="grid grid-cols-7 gap-1 text-center text-[10px] font-medium text-slate-400 mb-1">
        {DOW.map((d) => (
          <span key={d}>{d}</span>
        ))}
      </div>
      <div className="grid grid-cols-7 gap-1">
        {days.map((day) => {
          const isPast = day < today;
          const info = byDate.get(day);
          const isSelected = day === selected;
          const dayNum = parseInt(day.slice(8, 10), 10);
          const isFirstOfMonth = dayNum === 1;

          let tone =
            "bg-slate-50 hover:bg-teal-50 text-slate-700 border border-slate-200 cursor-pointer";
          if (isPast) tone = "text-slate-300 cursor-not-allowed";
          else if (info?.status === "confirmed") tone = "bg-teal-600 text-white cursor-pointer";
          else if (info?.status === "pending") tone = "bg-orange-100 text-orange-700 cursor-pointer";

          const title = isPast
            ? formatDayLong(day)
            : info?.status === "confirmed"
              ? `${formatDayLong(day)} — booked: ${info.title}`
              : info?.status === "pending"
                ? `${formatDayLong(day)} — already proposed, awaiting confirmation`
                : `${formatDayLong(day)} — free`;

          return (
            <button
              type="button"
              key={day}
              disabled={isPast}
              onClick={() => onSelect(day)}
              title={title}
              aria-label={title}
              className={`relative aspect-square rounded-lg text-xs flex items-center justify-center ${tone} ${
                isSelected ? "ring-2 ring-teal-500 ring-offset-1" : ""
              }`}
            >
              {isFirstOfMonth && (
                <span className="absolute -top-3.5 left-0 text-[9px] font-semibold text-slate-400">
                  {MONTH_SHORT[parseInt(day.slice(5, 7), 10) - 1]}
                </span>
              )}
              {dayNum}
            </button>
          );
        })}
      </div>
      <div className="flex flex-wrap gap-3 mt-3 text-[11px] text-slate-500">
        <Legend swatch="bg-slate-50 border border-slate-200" label="Free" />
        <Legend swatch="bg-teal-600" label="Booked" />
        <Legend swatch="bg-orange-100" label="Pending" />
      </div>
      {focused && (
        <p className="text-xs text-orange-700 bg-orange-50 border border-orange-200 rounded-lg px-3 py-2 mt-2">
          {focused.status === "confirmed"
            ? `${formatDayLong(selected)} already has "${focused.title}" booked. You can still send this, but check with an admin first.`
            : `${formatDayLong(selected)} already has another proposal awaiting confirmation. You can still send this — an admin will sort out any clash.`}
        </p>
      )}
    </div>
  );
}

function Legend({ swatch, label }: { swatch: string; label: string }) {
  return (
    <span className="flex items-center gap-1.5">
      <span className={`w-3 h-3 rounded-full inline-block ${swatch}`} />
      {label}
    </span>
  );
}

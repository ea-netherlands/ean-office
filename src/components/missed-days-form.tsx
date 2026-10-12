"use client";

import { useState, useTransition } from "react";
import {
  Icon,
  Notice,
  Spinner,
  btnPrimary,
  btnSecondary,
} from "@/components/ui";

export type MissedDay = { date: string; label: string };

/**
 * Settle every missed check-in in one go: tick the days you were in, save
 * once. Unticked days are recorded as days you weren't in, so they don't come
 * up again — which is what a member assumed would happen when they left one
 * alone, before the next month's email asked about it a second time.
 */
export function MissedDaysForm({
  days,
  action,
}: {
  days: MissedDay[];
  action: (
    attended: string[],
    absent: string[]
  ) => Promise<{ ok?: boolean; error?: string }>;
}) {
  const [ticked, setTicked] = useState<Set<string>>(new Set());
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState<{ in: number; out: number } | null>(null);

  if (done) {
    return (
      <Notice>
        {done.in > 0
          ? `Thanks — ${done.in === 1 ? "that day is" : `those ${done.in} days are`} now on the record as visits.`
          : "Thanks — noted."}
        {done.out > 0 && " We won't ask about the others again."}
      </Notice>
    );
  }

  const toggle = (date: string) =>
    setTicked((prev) => {
      const next = new Set(prev);
      if (next.has(date)) next.delete(date);
      else next.add(date);
      return next;
    });
  const allTicked = ticked.size === days.length;

  const save = () =>
    startTransition(async () => {
      setError(null);
      const attended = days.filter((d) => ticked.has(d.date)).map((d) => d.date);
      const absent = days.filter((d) => !ticked.has(d.date)).map((d) => d.date);
      const res = await action(attended, absent);
      if (res.error) setError(res.error);
      else setDone({ in: attended.length, out: absent.length });
    });

  return (
    <div className="text-left">
      <ul className="divide-y divide-slate-100 border-y border-slate-100">
        {days.map((d) => (
          <li key={d.date}>
            <label className="flex items-center gap-3 py-2.5 text-sm cursor-pointer">
              <input
                type="checkbox"
                checked={ticked.has(d.date)}
                onChange={() => toggle(d.date)}
                disabled={pending}
                className="size-4"
              />
              {d.label}
            </label>
          </li>
        ))}
      </ul>
      {days.length > 2 && (
        <button
          type="button"
          disabled={pending}
          onClick={() =>
            setTicked(allTicked ? new Set() : new Set(days.map((d) => d.date)))
          }
          className="text-sm text-teal-700 font-medium mt-2 cursor-pointer"
        >
          {allTicked ? "Untick all" : "I was in on all of them"}
        </button>
      )}
      <p className="text-xs text-slate-500 mt-3">
        Any day you leave unticked is recorded as one you weren&apos;t in, and
        we won&apos;t ask about it again.
      </p>
      {/* "None of them" is a real answer, but not the one to put the big teal
          button on before anyone has looked at the list. */}
      <button
        type="button"
        className={`${ticked.size === 0 ? btnSecondary : btnPrimary} w-full mt-3`}
        disabled={pending}
        onClick={save}
      >
        {pending ? (
          <Spinner />
        ) : ticked.size === 0 ? (
          <Icon name="x" />
        ) : (
          <Icon name="check" />
        )}
        {ticked.size === 0
          ? days.length === 1
            ? "I wasn't in that day"
            : "I wasn't in on any of these"
          : "Save"}
      </button>
      {error && (
        <Notice tone="error" className="mt-3">
          {error}
        </Notice>
      )}
    </div>
  );
}

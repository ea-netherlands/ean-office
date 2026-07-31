"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import {
  bookDateAction,
  joinWaitlistAction,
  cancelBookingAction,
  cancelSeriesAction,
  blockPreviewAction,
  blockCreateAction,
  BlockState,
} from "@/actions/booking";
import { ProfileForm } from "@/components/profile-form";
import { Avatar, btnPrimary, btnSecondary, btnDanger, inputCls, Icon } from "@/components/ui";
import { formatDayLong, WEEKDAY_NAMES } from "@/lib/dates";

export type DayInfo = {
  date: string;
  weekday: number;
  closed: boolean;
  past: boolean;
  desksLeft: number;
  flexLeft: number;
  full: boolean;
  waitlistCount: number;
  people: string[];
  mine: {
    bookingId: string;
    status: "booked" | "waitlisted";
    seatType: string;
    seriesId: string | null;
  } | null;
  blockCapReached: boolean;
  themedEvent: string | null;
};

export function BookGrid(props: {
  days: DayInfo[];
  month: string;
  monthLabel: string;
  prevMonth: string;
  nextMonth: string;
  today: string;
  flexWindow: string;
  horizonWeeks: number;
  hasProfile: boolean;
}) {
  const router = useRouter();
  const [selected, setSelected] = useState<string | null>(null);
  const [showBlock, setShowBlock] = useState(false);
  const [profileFor, setProfileFor] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  const day = props.days.find((d) => d.date === selected) ?? null;

  function book(date: string, skipProfile = false) {
    setMessage(null);
    startTransition(async () => {
      const res = await bookDateAction(date, { skipProfile });
      if (res.needsProfile) {
        setProfileFor(date);
        return;
      }
      setProfileFor(null);
      if (res.error) setMessage(res.error);
      else if (res.seatType === "flex")
        setMessage(
          `Booked a lunch-table spot for ${formatDayLong(date)}. Reminder: the table is used for lunch ${props.flexWindow}, so you'll need to pack up for that hour.`
        );
      else setMessage(`Booked — see you ${formatDayLong(date)}!`);
      router.refresh();
    });
  }

  // Pad the first week so weekday columns line up.
  const firstWeekday = props.days[0]?.weekday ?? 1;

  return (
    <div>
      <div className="flex items-center justify-between mb-3">
        <Link
          href={`/book?m=${props.prevMonth}`}
          className="px-3 py-1.5 rounded-lg border border-slate-300 text-sm hover:bg-slate-50"
        >
          ←
        </Link>
        <h2 className="font-semibold">{props.monthLabel}</h2>
        <Link
          href={`/book?m=${props.nextMonth}`}
          className="px-3 py-1.5 rounded-lg border border-slate-300 text-sm hover:bg-slate-50"
        >
          →
        </Link>
      </div>

      <button
        onClick={() => setShowBlock((v) => !v)}
        className={`${btnSecondary} w-full mb-3`}
      >
        Book repeating {showBlock ? "▴" : "▾"}
      </button>
      {showBlock && (
        <BlockForm horizonWeeks={props.horizonWeeks} onDone={() => router.refresh()} />
      )}

      {message && (
        <div className="bg-teal-50 border border-teal-200 text-teal-900 text-sm rounded-xl px-3 py-2 mb-3">
          {message}
        </div>
      )}

      <div className="grid grid-cols-5 gap-1 text-center text-xs text-slate-400 mb-1">
        {["Mon", "Tue", "Wed", "Thu", "Fri"].map((w) => (
          <div key={w}>{w}</div>
        ))}
      </div>
      <div className="grid grid-cols-5 gap-1">
        {Array.from({ length: firstWeekday - 1 }).map((_, i) => (
          <div key={`pad${i}`} />
        ))}
        {props.days.map((d) => (
          <DayCell
            key={d.date}
            d={d}
            isToday={d.date === props.today}
            selected={d.date === selected}
            onClick={() => setSelected(d.date === selected ? null : d.date)}
          />
        ))}
      </div>

      {day && (
        <DayPanel
          day={day}
          flexWindow={props.flexWindow}
          pending={pending}
          onBook={() => book(day.date)}
          onWaitlist={() =>
            startTransition(async () => {
              const res = await joinWaitlistAction(day.date);
              setMessage(
                res.error ??
                  `You're on the waitlist for ${formatDayLong(day.date)} — we'll email you if a desk opens up.`
              );
              router.refresh();
            })
          }
          onCancel={(all) =>
            startTransition(async () => {
              if (all && day.mine?.seriesId) {
                const res = await cancelSeriesAction(day.mine.seriesId);
                setMessage(`Cancelled ${res.cancelled} remaining days in the series.`);
              } else if (day.mine) {
                await cancelBookingAction(day.mine.bookingId);
                setMessage(`Cancelled ${formatDayLong(day.date)}.`);
              }
              setSelected(null);
              router.refresh();
            })
          }
        />
      )}

      {profileFor && (
        <div className="fixed inset-0 z-30 bg-black/40 flex items-end sm:items-center justify-center p-0 sm:p-4">
          <div className="bg-white w-full sm:max-w-md rounded-t-2xl sm:rounded-xl p-5 max-h-[90vh] overflow-y-auto">
            <h3 className="font-semibold text-lg mb-1">One quick thing first</h3>
            <p className="text-sm text-slate-500 mb-4">
              Five questions, thirty seconds. They power the aggregate usage
              reports that keep this office funded.
            </p>
            <ProfileForm
              onDone={() => {
                const d = profileFor;
                setProfileFor(null);
                book(d);
              }}
              onSkip={() => {
                const d = profileFor;
                setProfileFor(null);
                book(d, true);
              }}
            />
          </div>
        </div>
      )}
    </div>
  );
}

function DayCell({
  d,
  isToday,
  selected,
  onClick,
}: {
  d: DayInfo;
  isToday: boolean;
  selected: boolean;
  onClick: () => void;
}) {
  const dayNum = parseInt(d.date.slice(8), 10);
  const disabled = d.closed || d.past;
  let bg = "bg-white hover:bg-slate-50";
  if (disabled) bg = "bg-slate-100 text-slate-300";
  else if (d.mine?.status === "booked") bg = "bg-teal-600 text-white hover:bg-teal-700";
  else if (d.mine?.status === "waitlisted") bg = "bg-orange-100 hover:bg-orange-200";
  else if (d.full) bg = "bg-slate-200 hover:bg-slate-300";
  else if (d.desksLeft === 0) bg = "bg-orange-50 hover:bg-orange-100";

  return (
    <button
      onClick={onClick}
      disabled={disabled}
      className={`relative rounded-xl border ${
        selected ? "border-teal-600 ring-2 ring-teal-600" : "border-slate-200"
      } ${bg} p-1.5 min-h-[64px] flex flex-col items-start text-left disabled:cursor-default cursor-pointer`}
    >
      <span
        className={`text-xs font-semibold ${
          isToday ? "underline underline-offset-2" : ""
        }`}
      >
        {dayNum}
      </span>
      {!disabled && (
        <>
          <span className="text-[10px] leading-tight mt-0.5">
            {d.mine?.status === "booked"
              ? "You're in"
              : d.mine?.status === "waitlisted"
                ? "Waitlist"
                : d.full
                  ? "Full"
                  : d.desksLeft === 0
                    ? `${d.flexLeft} table`
                    : `${d.desksLeft} desk${d.desksLeft === 1 ? "" : "s"}`}
          </span>
          {d.themedEvent && <Icon name="target-arrow" className="text-[10px] text-teal-700" />}
          {d.people.length > 0 && (
            <span className="flex -space-x-1 mt-auto">
              {d.people.slice(0, 3).map((name, i) => (
                <Avatar key={i} name={name} small />
              ))}
              {d.people.length > 3 && (
                <span className="text-[9px] self-center pl-1.5">
                  +{d.people.length - 3}
                </span>
              )}
            </span>
          )}
        </>
      )}
    </button>
  );
}

function DayPanel({
  day,
  flexWindow,
  pending,
  onBook,
  onWaitlist,
  onCancel,
}: {
  day: DayInfo;
  flexWindow: string;
  pending: boolean;
  onBook: () => void;
  onWaitlist: () => void;
  onCancel: (all: boolean) => void;
}) {
  const deskFullFlexAvailable = day.desksLeft === 0 && day.flexLeft > 0;
  return (
    <div className="mt-4 bg-white border border-slate-200 rounded-xl p-4">
      <h3 className="font-semibold">{formatDayLong(day.date)}</h3>
      {day.themedEvent && (
        <p className="text-sm text-teal-700 mt-0.5"><Icon name="target-arrow" className="mr-1" />{day.themedEvent}</p>
      )}
      <p className="text-sm text-slate-500 mt-1">
        {day.full
          ? `Full — ${day.waitlistCount} on the waitlist`
          : deskFullFlexAvailable
            ? `Desks full — ${day.flexLeft} lunch-table spot${day.flexLeft === 1 ? "" : "s"} left`
            : `${day.desksLeft} desk${day.desksLeft === 1 ? "" : "s"} and ${day.flexLeft} lunch-table spot${day.flexLeft === 1 ? "" : "s"} left`}
      </p>

      {day.people.length > 0 && (
        <div className="flex flex-wrap gap-1.5 mt-3">
          {day.people.map((name, i) => (
            <span
              key={i}
              className="inline-flex items-center gap-1.5 bg-slate-50 border border-slate-200 rounded-full pl-1 pr-2.5 py-0.5 text-xs"
            >
              <Avatar name={name} small />
              {name}
            </span>
          ))}
        </div>
      )}

      <div className="mt-4 flex flex-wrap gap-2">
        {day.mine ? (
          <>
            <button onClick={() => onCancel(false)} disabled={pending} className={btnDanger}>
              {day.mine.status === "waitlisted"
                ? "Leave waitlist"
                : day.mine.seriesId
                  ? "Cancel just this one"
                  : "Cancel this booking"}
            </button>
            {day.mine.seriesId && day.mine.status === "booked" && (
              <button onClick={() => onCancel(true)} disabled={pending} className={btnSecondary}>
                Cancel all remaining in series
              </button>
            )}
          </>
        ) : day.full ? (
          <button onClick={onWaitlist} disabled={pending} className={btnPrimary}>
            Join the waitlist
          </button>
        ) : (
          <button onClick={onBook} disabled={pending} className={btnPrimary}>
            {deskFullFlexAvailable ? "Book a lunch-table spot" : "Book this day"}
          </button>
        )}
      </div>
      {deskFullFlexAvailable && !day.mine && (
        <p className="text-xs text-orange-700 mt-2">
          The lunch table is used for lunch from {flexWindow}, so you&apos;ll
          need to pack up for an hour. Fine for a half day or if you&apos;re
          happy to break — less good for deep work.
        </p>
      )}
    </div>
  );
}

function BlockForm({
  horizonWeeks,
  onDone,
}: {
  horizonWeeks: number;
  onDone: () => void;
}) {
  const [weekdays, setWeekdays] = useState<number[]>([]);
  const [until, setUntil] = useState("");
  const [state, setState] = useState<BlockState | null>(null);
  const [done, setDone] = useState<string[] | null>(null);
  const [pending, startTransition] = useTransition();

  function toggle(wd: number) {
    setState(null);
    setDone(null);
    setWeekdays((prev) =>
      prev.includes(wd) ? prev.filter((x) => x !== wd) : [...prev, wd].sort()
    );
  }

  return (
    <div className="bg-white border border-slate-200 rounded-xl p-4 mb-3">
      <p className="text-sm text-slate-600 mb-3">
        Book the same weekday(s) every week — up to {horizonWeeks} weeks out.
        Every day stays individually cancellable.
      </p>
      <div className="flex gap-1.5 mb-3">
        {[1, 2, 3, 4, 5].map((wd) => (
          <button
            key={wd}
            onClick={() => toggle(wd)}
            className={`px-3 py-2 rounded-xl border text-sm font-medium cursor-pointer ${
              weekdays.includes(wd)
                ? "bg-teal-700 text-white border-teal-700"
                : "bg-white border-slate-300 hover:bg-slate-50"
            }`}
          >
            {WEEKDAY_NAMES[wd - 1].slice(0, 3)}
          </button>
        ))}
      </div>
      <label className="text-sm text-slate-600 flex items-center gap-2 mb-3">
        Until
        <input
          type="date"
          value={until}
          onChange={(e) => {
            setUntil(e.target.value);
            setState(null);
            setDone(null);
          }}
          className={inputCls}
        />
      </label>

      {done ? (
        <p className="text-sm text-teal-800 bg-teal-50 border border-teal-200 rounded-xl px-3 py-2">
          Booked {done.length} day{done.length === 1 ? "" : "s"} — a summary
          email is on its way. Each day can be cancelled on its own.
        </p>
      ) : state?.preview ? (
        <div className="text-sm">
          <p className="mb-2">
            This will book <strong>{state.preview.eligible.length}</strong> of{" "}
            {state.preview.total} matching days.
            {state.preview.skippedFull.length > 0 &&
              ` ${state.preview.skippedFull.length} skipped (full).`}
            {state.preview.skippedBlockCap.length > 0 &&
              ` ${state.preview.skippedBlockCap.length} skipped — repeat bookings can hold at most half the desks on any day, so occasional visitors can still get in.`}
            {state.preview.skippedExisting.length > 0 &&
              ` ${state.preview.skippedExisting.length} already booked by you.`}
            {state.preview.skippedHoliday.length > 0 &&
              ` ${state.preview.skippedHoliday.length} public holiday${state.preview.skippedHoliday.length === 1 ? "" : "s"} skipped.`}
          </p>
          <button
            className={btnPrimary}
            disabled={pending || state.preview.eligible.length === 0}
            onClick={() =>
              startTransition(async () => {
                const res = await blockCreateAction(weekdays, until);
                if (res.error) setState({ error: res.error });
                else {
                  setDone(res.booked ?? []);
                  onDone();
                }
              })
            }
          >
            {pending
              ? "Booking…"
              : `Book ${state.preview.eligible.length} days`}
          </button>
        </div>
      ) : (
        <button
          className={btnSecondary}
          disabled={pending || weekdays.length === 0 || !until}
          onClick={() =>
            startTransition(async () => {
              setState(await blockPreviewAction(weekdays, until));
            })
          }
        >
          {pending ? "Checking…" : "Preview"}
        </button>
      )}
      {state?.error && <p className="text-sm text-red-700 mt-2">{state.error}</p>}
    </div>
  );
}

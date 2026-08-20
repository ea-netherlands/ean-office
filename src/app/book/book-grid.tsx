"use client";

import { useEffect, useRef, useState, useTransition } from "react";
import Link from "next/link";
import {
  bookDateAction,
  joinWaitlistAction,
  cancelBookingAction,
  cancelSeriesAction,
  changeSlotAction,
  blockPreviewAction,
  blockCreateAction,
  switchSeatAction,
  BlockState,
} from "@/actions/booking";
import type { SeatTarget } from "@/lib/booking";
import { DeskMap, DeskHalves, DeskOccupant } from "@/components/desk-map";
import { ProfileForm } from "@/components/profile-form";
import { PeopleList, PersonChipData } from "@/components/people";
import {
  Avatar,
  btnPrimary,
  btnSecondary,
  btnDanger,
  inputCls,
  Icon,
  Spinner,
  Notice,
} from "@/components/ui";
import { formatDayLong, WEEKDAY_NAMES } from "@/lib/dates";
import { halves, Slot, SLOT_LABEL } from "@/lib/slots";

export type MyBooking = {
  bookingId: string;
  status: "booked" | "waitlisted";
  seatType: string;
  slot: Slot;
  seriesId: string | null;
};

export type DayInfo = {
  date: string;
  weekday: number;
  closed: boolean;
  past: boolean;
  desksLeft: Record<Slot, number>;
  flexLeft: Record<Slot, number>;
  full: boolean;
  waitlistCount: number;
  people: PersonChipData[];
  /** Up to two: a member may hold a morning and an afternoon separately. */
  mine: MyBooking[];
  blockCapReached: boolean;
  /** A co-working day: the office is closed to general booking that day. */
  themedEvent: {
    id: string;
    title: string;
    startsAt: string | null;
    endsAt: string | null;
    spotsLeft: number;
    spotsTotal: number;
  } | null;
};

const SLOT_ORDER: Slot[] = ["day", "am", "pm"];
const SLOT_TAB: Record<Slot, string> = {
  day: "Full day",
  am: "Morning",
  pm: "Afternoon",
};

function seatsFor(d: DayInfo, slot: Slot): number {
  return d.desksLeft[slot] + d.flexLeft[slot];
}

/** The booking that covers a given slot, if the member holds one. */
function mineFor(d: DayInfo, slot: Slot): MyBooking | undefined {
  return d.mine.find((b) =>
    halves(b.slot).some((h) => halves(slot).includes(h))
  );
}

export function BookGrid(props: {
  days: DayInfo[];
  month: string;
  monthLabel: string;
  prevMonth: string;
  nextMonth: string;
  today: string;
  flexWindow: string;
  amWindow: string;
  pmWindow: string;
  horizonWeeks: number;
  hasProfile: boolean;
  deskCount: number;
}) {
  const [selected, setSelected] = useState<string | null>(null);
  const [slot, setSlot] = useState<Slot>("day");
  const [showBlock, setShowBlock] = useState(false);
  const [profileFor, setProfileFor] = useState<{
    date: string;
    slot: Slot;
    seat?: SeatTarget;
  } | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [failed, setFailed] = useState(false);
  const [pending, startTransition] = useTransition();
  /**
   * Which action is in flight, so the button the member actually pressed is
   * the one that says it's working — `pending` alone can't tell six buttons
   * apart, and greying all of them out reads as the page having frozen.
   */
  const [busy, setBusy] = useState<
    "book" | "waitlist" | "cancel" | "slot" | "seat" | null
  >(null);
  const panelRef = useRef<HTMLDivElement | null>(null);
  const scrollPanel = useRef(false);

  const day = props.days.find((d) => d.date === selected) ?? null;

  /**
   * The day panel renders below a five-week grid, so on a phone it opened
   * entirely off-screen: tapping a day looked like nothing had happened.
   * Bring it into view once it's actually in the DOM.
   */
  useEffect(() => {
    if (!scrollPanel.current || !panelRef.current) return;
    scrollPanel.current = false;
    // "start", not "nearest": the panel is usually taller than a phone
    // viewport, and "nearest" barely moves for an oversized element.
    // Deliberately instant — `behavior: "smooth"` turned out to be a silent
    // no-op in testing, and a scroll that sometimes doesn't happen is worse
    // than one that always does. Restrained motion suits the system anyway.
    panelRef.current.scrollIntoView({ block: "start" });
  }, [selected]);

  /**
   * Booking makes the panel taller (the cancel button and "change to" row
   * appear), which pushed the confirmation just past the bottom of the
   * screen. Once there's an outcome to read, make sure it's on screen.
   *
   * Also keyed on `props.days`, because the revalidated data lands a beat
   * after the message and re-renders the panel taller again — scrolling only
   * once left the confirmation half off the bottom. `nearest` means this is a
   * no-op as soon as it's fully visible, so the repeat is free.
   */
  useEffect(() => {
    if (!message || !panelRef.current) return;
    panelRef.current
      .querySelector("[role=status]")
      ?.scrollIntoView({ block: "nearest" });
  }, [message, props.days]);

  /** Opening a day starts on whichever hours the member already holds. */
  function selectDay(d: DayInfo) {
    if (d.date === selected) {
      setSelected(null);
      return;
    }
    setSelected(d.date);
    setMessage(null);
    setFailed(false);
    setSlot(d.mine.length === 1 ? d.mine[0].slot : "day");
    scrollPanel.current = true;
  }

  /**
   * Runs an action with a named busy state and leaves the outcome next to the
   * button. `revalidatePath` in the action already sends fresh data back with
   * the response, so there's no `router.refresh()` here — that was a second
   * full render of the page for every booking.
   */
  function run(
    kind: NonNullable<typeof busy>,
    work: () => Promise<{ message?: string; error?: string } | void>
  ) {
    setMessage(null);
    setFailed(false);
    setBusy(kind);
    startTransition(async () => {
      try {
        const res = await work();
        if (res?.error) {
          setMessage(res.error);
          setFailed(true);
        } else if (res?.message) {
          setMessage(res.message);
        }
      } finally {
        setBusy(null);
      }
    });
  }

  function slotNote(s: Slot): string {
    if (s === "am") return ` You have the desk for the morning (${props.amWindow}) — please pack up by the end of lunch.`;
    if (s === "pm") return ` The desk is yours from lunch (${props.pmWindow}).`;
    return "";
  }

  function book(
    date: string,
    bookSlot: Slot,
    skipProfile = false,
    seat?: SeatTarget
  ) {
    const deskNumber = seat?.type === "desk" ? seat.deskNumber : undefined;
    run(seat ? "seat" : "book", async () => {
      const res = await bookDateAction(date, {
        skipProfile,
        deskNumber,
        seatType: seat?.type,
        slot: bookSlot,
      });
      if (res.needsProfile) {
        setProfileFor({ date, slot: bookSlot, seat });
        return;
      }
      setProfileFor(null);
      if (res.error) return { error: res.error };
      if (res.seatType === "flex") {
        return {
          message: `Booked a lunch-table spot for ${formatDayLong(date)}${bookSlot === "day" ? "" : ` (${SLOT_LABEL[bookSlot]})`}.${
            bookSlot === "day"
              ? ` Reminder: the table is used for lunch ${props.flexWindow}, so you'll need to pack up for that hour.`
              : ""
          }`,
        };
      }
      return {
        message:
          `Booked desk ${res.deskNumber ?? ""} — see you ${formatDayLong(date)}${bookSlot === "day" ? "" : ` (${SLOT_LABEL[bookSlot]})`}!`.replace(
            "  ",
            " "
          ) + slotNote(bookSlot),
      };
    });
  }

  function pickSeat(d: DayInfo, seat: SeatTarget) {
    const label = seat.type === "desk" ? `desk ${seat.deskNumber}` : "the lunch table";
    const held = mineFor(d, slot);
    if (held?.status === "booked") {
      // already booked those hours — move seats instead
      run("seat", async () => {
        const res = await switchSeatAction(held.bookingId, seat);
        if (res.error) return { error: res.error };
        const moved = `Moved to ${label} on ${formatDayLong(d.date)}${
          held.slot === "day" ? "" : ` (${SLOT_LABEL[held.slot]})`
        }.`;
        return {
          message:
            seat.type === "flex" && held.slot === "day"
              ? `${moved} The table is used for lunch ${props.flexWindow}, so you'll need to pack up for that hour.`
              : moved,
        };
      });
    } else if (!held) {
      book(d.date, slot, false, seat);
    }
  }

  function changeSlot(d: DayInfo, booking: MyBooking, next: Slot) {
    run("slot", async () => {
      const res = await changeSlotAction(booking.bookingId, next);
      if (res.error) return { error: res.error };
      setSlot(next);
      return {
        message: `${formatDayLong(d.date)} is now ${
          next === "day" ? "a full day" : `${SLOT_LABEL[next]} only`
        }${res.deskNumber ? ` — desk ${res.deskNumber}` : ""}.${slotNote(next)}`,
      };
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
        <h2>{props.monthLabel}</h2>
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
        <BlockForm horizonWeeks={props.horizonWeeks} />
      )}

      {/* Outcomes live in the day panel, next to the button that caused them.
          This copy is only for messages with no panel open to land in. */}
      {message && !day && (
        <Notice tone={failed ? "error" : "ok"} className="mb-3">
          {message}
        </Notice>
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
            onClick={() => selectDay(d)}
          />
        ))}
      </div>

      {day && (
        <div ref={panelRef} className="scroll-mt-16">
        <DayPanel
          day={day}
          slot={slot}
          onSlot={setSlot}
          flexWindow={props.flexWindow}
          amWindow={props.amWindow}
          pmWindow={props.pmWindow}
          pending={pending}
          busy={busy}
          message={message}
          failed={failed}
          deskCount={props.deskCount}
          onPickSeat={(seat) => pickSeat(day, seat)}
          onBook={() => book(day.date, slot)}
          onChangeSlot={(booking, next) => changeSlot(day, booking, next)}
          onWaitlist={() =>
            run("waitlist", async () => {
              const res = await joinWaitlistAction(day.date, slot);
              if (res.error) return { error: res.error };
              return {
                message: `You're on the waitlist for ${formatDayLong(day.date)}${
                  slot === "day" ? "" : ` (${SLOT_LABEL[slot]})`
                } — we'll email you if a desk opens up.`,
              };
            })
          }
          onCancel={(booking, all) =>
            run("cancel", async () => {
              let msg: string;
              if (all && booking.seriesId) {
                const res = await cancelSeriesAction(booking.seriesId);
                msg = `Cancelled ${res.cancelled} remaining days in the series.`;
              } else {
                const res = await cancelBookingAction(booking.bookingId);
                if (res.error) return { error: res.error };
                msg = `Cancelled ${formatDayLong(day.date)}${
                  booking.slot === "day" ? "" : ` (${SLOT_LABEL[booking.slot]})`
                }.`;
              }
              // Closing the panel would take the confirmation with it, so the
              // day stays open and shows what happened.
              return { message: msg };
            })
          }
        />
        </div>
      )}

      {profileFor && (
        <div className="fixed inset-0 z-30 bg-black/40 flex items-end sm:items-center justify-center p-0 sm:p-4">
          <div className="bg-white w-full sm:max-w-md rounded-t-2xl sm:rounded-xl p-5 max-h-[90vh] overflow-y-auto">
            <h3 className="text-lg mb-1">One quick thing first</h3>
            <p className="text-sm text-slate-500 mb-4">
              Five questions, thirty seconds. They power the aggregate usage
              reports that keep this office funded.
            </p>
            <ProfileForm
              onDone={() => {
                const d = profileFor;
                setProfileFor(null);
                book(d.date, d.slot, false, d.seat);
              }}
              onSkip={() => {
                const d = profileFor;
                setProfileFor(null);
                book(d.date, d.slot, true, d.seat);
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
  const closedForEvent = d.closed && !!d.themedEvent;
  const disabled = (d.closed && !closedForEvent) || d.past;
  const booked = d.mine.filter((b) => b.status === "booked");
  const waitlisted = d.mine.some((b) => b.status === "waitlisted");
  // A full day, or both halves held separately, reads as "you're in".
  const yourSlots = booked.map((b) => b.slot);
  const allDayYours =
    yourSlots.includes("day") ||
    (yourSlots.includes("am") && yourSlots.includes("pm"));

  let bg = "bg-white hover:bg-slate-50";
  if (disabled) bg = "bg-slate-100 text-slate-300";
  else if (closedForEvent) bg = "bg-teal-50 text-teal-700 hover:bg-teal-100";
  else if (allDayYours) bg = "bg-teal-600 text-white hover:bg-teal-700";
  else if (booked.length > 0) bg = "bg-teal-100 text-teal-900 hover:bg-teal-200";
  else if (waitlisted) bg = "bg-orange-100 hover:bg-orange-200";
  else if (d.full) bg = "bg-slate-200 hover:bg-slate-300";
  else if (d.desksLeft.day === 0) bg = "bg-orange-50 hover:bg-orange-100";

  // What's left, in the order that matters: whole days first, then halves.
  function availability(): string {
    if (d.desksLeft.day > 0) {
      return `${d.desksLeft.day} desk${d.desksLeft.day === 1 ? "" : "s"}`;
    }
    if (d.flexLeft.day > 0) return `${d.flexLeft.day} table`;
    const am = seatsFor(d, "am") > 0;
    const pm = seatsFor(d, "pm") > 0;
    if (am && pm) return "½ days only";
    if (am) return "AM only";
    if (pm) return "PM only";
    return "Full";
  }

  const label = closedForEvent
    ? booked.length > 0
      ? "You're in"
      : "Co-work"
    : allDayYours
      ? "You're in"
      : booked.length > 0
        ? `You: ${yourSlots.map((s) => (s === "am" ? "AM" : "PM")).join("+")}`
        : waitlisted
          ? "Waitlist"
          : availability();

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
          <span className="text-[10px] leading-tight mt-0.5">{label}</span>
          {d.themedEvent && <Icon name="target-arrow" className="text-[10px] text-teal-700" />}
          {/* Two initials, not three: five columns on a 375px screen leaves
              ~51px inside a cell, and three avatars plus the counter needed
              65 — the overflow clipped the "+7" that says how many are
              actually coming, which is the more useful half. */}
          {!closedForEvent && d.people.length > 0 && (
            <span className="flex -space-x-1 mt-auto max-w-full">
              {d.people.slice(0, 2).map((p) => (
                <Avatar key={p.id} name={p.name} small />
              ))}
              {d.people.length > 2 && (
                <span className="text-[9px] self-center pl-1">
                  +{d.people.length - 2}
                </span>
              )}
            </span>
          )}
        </>
      )}
    </button>
  );
}

type BusyKind = "book" | "waitlist" | "cancel" | "slot" | "seat" | null;

function DayPanel({
  day,
  slot,
  onSlot,
  flexWindow,
  amWindow,
  pmWindow,
  pending,
  busy,
  message,
  failed,
  deskCount,
  onPickSeat,
  onBook,
  onChangeSlot,
  onWaitlist,
  onCancel,
}: {
  day: DayInfo;
  slot: Slot;
  onSlot: (s: Slot) => void;
  flexWindow: string;
  amWindow: string;
  pmWindow: string;
  pending: boolean;
  busy: BusyKind;
  message: string | null;
  failed: boolean;
  deskCount: number;
  onPickSeat: (seat: SeatTarget) => void;
  onBook: () => void;
  onChangeSlot: (booking: MyBooking, next: Slot) => void;
  onWaitlist: () => void;
  onCancel: (booking: MyBooking, all: boolean) => void;
}) {
  if (day.closed && day.themedEvent) {
    const event = day.themedEvent;
    // Someone who booked before the day was taken over keeps their desk, and
    // the panel has to say so — "closed" on a day you're booked reads as a
    // cancellation.
    const yours = day.mine.find((b) => b.status === "booked");
    return (
      <div className="mt-4 bg-white border border-slate-200 rounded-xl p-4">
        <h3>{formatDayLong(day.date)}</h3>
        <p className="text-sm text-teal-700 mt-0.5">
          <Icon name="target-arrow" className="mr-1" />
          {event.title}
          {event.startsAt
            ? ` · ${event.startsAt}${event.endsAt ? `–${event.endsAt}` : ""}`
            : ""}
        </p>
        {yours ? (
          <>
            <p className="text-sm text-slate-600 mt-2">
              A co-working day — the office is closed to general booking, but{" "}
              <strong>you already have a seat</strong>
              {yours.slot === "day" ? "" : ` for the ${SLOT_LABEL[yours.slot]}`}
              , so come as planned.
            </p>
            <button
              onClick={() => onCancel(yours, false)}
              disabled={pending}
              className={`${btnSecondary} mt-3`}
            >
              {busy === "cancel" ? <Spinner /> : null} Cancel my seat
            </button>
          </>
        ) : (
          <>
            <p className="text-sm text-slate-600 mt-2">
              A co-working day — the whole office works on this together, so
              general booking is closed and the organiser decides who&apos;s
              in.{" "}
              {event.spotsLeft > 0
                ? `${event.spotsLeft} of ${event.spotsTotal} spots free.`
                : `All ${event.spotsTotal} spots are taken, but you can still ask.`}
            </p>
            <Link
              href={`/events/${event.id}/rsvp`}
              className={`${btnPrimary} mt-3 inline-flex`}
            >
              Ask to join
            </Link>
          </>
        )}
      </div>
    );
  }

  const desksLeft = day.desksLeft[slot];
  const flexLeft = day.flexLeft[slot];
  const slotFull = desksLeft === 0 && flexLeft === 0;
  const deskFullFlexAvailable = desksLeft === 0 && flexLeft > 0;
  const held = mineFor(day, slot);
  const window = slot === "am" ? amWindow : slot === "pm" ? pmWindow : null;

  // Each desk carries who has it in each half, so the map can show sharing.
  const occupants = new Map<number, DeskHalves>();
  for (const p of day.people) {
    if (!p.deskNumber) continue;
    const entry = occupants.get(p.deskNumber) ?? {};
    for (const h of halves(p.slot ?? "day")) {
      entry[h] = { name: p.name, isYou: !!p.isYou };
    }
    occupants.set(p.deskNumber, entry);
  }
  const flexOccupants: DeskOccupant[] = day.people
    .filter(
      (p) =>
        p.seatType === "flex" &&
        halves(p.slot ?? "day").some((h) => halves(slot).includes(h))
    )
    .map((p) => ({ name: p.name, isYou: !!p.isYou }));
  const canPick = !pending && (!held || held.status === "booked");

  return (
    <div
      aria-busy={pending}
      className="mt-4 bg-white border border-slate-200 rounded-xl p-4"
    >
      <h3>{formatDayLong(day.date)}</h3>

      {/* Which hours — the whole panel below follows this choice. */}
      <div className="mt-3 flex gap-1.5">
        {SLOT_ORDER.map((s) => {
          const seats = seatsFor(day, s);
          const yours = mineFor(day, s);
          const active = s === slot;
          return (
            <button
              key={s}
              onClick={() => onSlot(s)}
              className={`flex-1 rounded-xl border px-2 py-1.5 text-xs font-medium cursor-pointer transition-colors ${
                active
                  ? "bg-teal-700 text-white border-teal-700"
                  : "bg-white border-slate-300 hover:bg-slate-50"
              }`}
            >
              <span className="block">{SLOT_TAB[s]}</span>
              <span
                className={`block text-[10px] font-normal ${
                  active ? "text-teal-100" : "text-slate-400"
                }`}
              >
                {yours?.status === "booked"
                  ? // Holding a half doesn't make the whole day yours.
                    yours.slot === s || yours.slot === "day"
                    ? "yours"
                    : "½ yours"
                  : seats === 0
                    ? "full"
                    : `${seats} free`}
              </span>
            </button>
          );
        })}
      </div>

      <p className="text-sm text-slate-500 mt-2">
        {window && <span className="text-slate-400">{window} · </span>}
        {slotFull
          ? `Full${day.waitlistCount > 0 ? ` — ${day.waitlistCount} on the waitlist` : ""}`
          : deskFullFlexAvailable
            ? `Desks full — ${flexLeft} lunch-table spot${flexLeft === 1 ? "" : "s"} left`
            : `${desksLeft} desk${desksLeft === 1 ? "" : "s"} and ${flexLeft} lunch-table spot${flexLeft === 1 ? "" : "s"} left`}
      </p>

      <div className="mt-4 bg-slate-50 border border-slate-200 rounded-xl p-3">
        <p className="text-xs text-slate-500 mb-2">
          {held?.status === "booked"
            ? "Tap a free desk or the lunch table to move."
            : held
              ? "The room today:"
              : slot === "day"
                ? "Tap a desk that's free all day, or the lunch table — or use the button below for any seat."
                : `Tap a desk that's free that ${SLOT_LABEL[slot]} — desks marked ½ are shared with someone in the other half.`}
        </p>
        <DeskMap
          deskCount={deskCount}
          occupants={occupants}
          slot={slot}
          onPick={(n) => onPickSeat({ type: "desk", deskNumber: n })}
          onPickFlex={() => onPickSeat({ type: "flex" })}
          disabled={!canPick}
          flexOccupants={flexOccupants}
          flexLeft={flexLeft}
          flexWindow={flexWindow}
        />
      </div>

      {day.people.length > 0 && (
        <div className="mt-3">
          <PeopleList people={day.people} />
        </div>
      )}

      <div className="mt-4 flex flex-wrap gap-2">
        {held ? (
          <>
            <button
              onClick={() => onCancel(held, false)}
              disabled={pending}
              className={btnDanger}
            >
              {busy === "cancel" ? (
                <>
                  <Spinner />
                  Cancelling…
                </>
              ) : held.status === "waitlisted" ? (
                "Leave waitlist"
              ) : held.seriesId ? (
                "Cancel just this one"
              ) : (
                `Cancel ${held.slot === "day" ? "this booking" : `this ${SLOT_LABEL[held.slot]}`}`
              )}
            </button>
            {held.seriesId && held.status === "booked" && (
              <button
                onClick={() => onCancel(held, true)}
                disabled={pending}
                className={btnSecondary}
              >
                Cancel all remaining in series
              </button>
            )}
          </>
        ) : slotFull ? (
          <button onClick={onWaitlist} disabled={pending} className={btnPrimary}>
            {busy === "waitlist" ? (
              <>
                <Spinner />
                Joining the waitlist…
              </>
            ) : (
              <>
                Join the waitlist
                {slot === "day" ? "" : ` for the ${SLOT_LABEL[slot]}`}
              </>
            )}
          </button>
        ) : (
          <button onClick={onBook} disabled={pending} className={btnPrimary}>
            {busy === "book" ? (
              <>
                <Spinner />
                Booking…
              </>
            ) : (
              <>
                {deskFullFlexAvailable ? "Book a lunch-table spot" : "Book"}
                {slot === "day" ? " this day" : ` this ${SLOT_LABEL[slot]}`}
              </>
            )}
          </button>
        )}
      </div>

      {/* The outcome, right under the button that caused it. */}
      {message && (
        <Notice tone={failed ? "error" : "ok"} className="mt-3">
          {message}
        </Notice>
      )}

      {/* Reshape a booking you already hold, without cancelling it. */}
      {held?.status === "booked" && (
        <div className="mt-3 flex flex-wrap items-center gap-1.5">
          <span className="text-xs text-slate-500">
            {busy === "slot" ? "Changing…" : "Change to:"}
          </span>
          {SLOT_ORDER.filter((s) => s !== held.slot).map((s) => (
            <button
              key={s}
              onClick={() => onChangeSlot(held, s)}
              disabled={pending}
              className="text-xs border border-slate-300 rounded-lg px-2.5 py-1.5 hover:bg-slate-50 cursor-pointer disabled:opacity-50"
            >
              {s === "day" ? "Full day" : SLOT_LABEL[s]}
            </button>
          ))}
        </div>
      )}

      {deskFullFlexAvailable && !held && (
        <p className="text-xs text-orange-700 mt-2">
          {slot === "day"
            ? `The lunch table is used for lunch from ${flexWindow}, so you'll need to pack up for an hour — book just a morning or an afternoon and you avoid it entirely.`
            : `The lunch table is cleared over lunch (${flexWindow}), which is where a ${SLOT_LABEL[slot]} booking ${slot === "am" ? "ends" : "starts"} anyway.`}
        </p>
      )}
    </div>
  );
}

function BlockForm({ horizonWeeks }: { horizonWeeks: number }) {
  const [weekdays, setWeekdays] = useState<number[]>([]);
  const [slot, setSlot] = useState<Slot>("day");
  const [from, setFrom] = useState("");
  const [until, setUntil] = useState("");
  const [state, setState] = useState<BlockState | null>(null);
  const [done, setDone] = useState<string[] | null>(null);
  const [pending, startTransition] = useTransition();

  function reset() {
    setState(null);
    setDone(null);
  }

  function toggle(wd: number) {
    reset();
    setWeekdays((prev) =>
      prev.includes(wd) ? prev.filter((x) => x !== wd) : [...prev, wd].sort()
    );
  }

  return (
    <div className="bg-white border border-slate-200 rounded-xl p-4 mb-3">
      <p className="text-sm text-slate-600 mb-3">
        Book the same weekday(s) every week — up to {horizonWeeks} weeks out.
        Leave <em>From</em> empty to start tomorrow, or set it to book a stretch
        further ahead. Every day stays individually cancellable.
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
      <div className="flex gap-1.5 mb-3">
        {SLOT_ORDER.map((s) => (
          <button
            key={s}
            onClick={() => {
              reset();
              setSlot(s);
            }}
            className={`flex-1 px-3 py-2 rounded-xl border text-sm font-medium cursor-pointer ${
              slot === s
                ? "bg-teal-700 text-white border-teal-700"
                : "bg-white border-slate-300 hover:bg-slate-50"
            }`}
          >
            {SLOT_TAB[s]}
          </button>
        ))}
      </div>
      <div className="flex flex-wrap gap-3 mb-3">
        <label className="text-sm text-slate-600 flex items-center gap-2">
          From
          <input
            type="date"
            value={from}
            max={until || undefined}
            onChange={(e) => {
              setFrom(e.target.value);
              reset();
            }}
            className={inputCls}
          />
        </label>
        <label className="text-sm text-slate-600 flex items-center gap-2">
          Until
          <input
            type="date"
            value={until}
            min={from || undefined}
            onChange={(e) => {
              setUntil(e.target.value);
              reset();
            }}
            className={inputCls}
          />
        </label>
      </div>

      {done ? (
        <p className="text-sm text-teal-800 bg-teal-50 border border-teal-200 rounded-xl px-3 py-2">
          Booked {done.length}{" "}
          {slot === "day"
            ? `day${done.length === 1 ? "" : "s"}`
            : `${SLOT_LABEL[slot]}${done.length === 1 ? "" : "s"}`}{" "}
          — a summary email is on its way. Each one can be cancelled on its own.
        </p>
      ) : state?.preview ? (
        <div className="text-sm">
          <p className="mb-2">
            This will book <strong>{state.preview.eligible.length}</strong> of{" "}
            {state.preview.total} matching days
            {slot !== "day" && `, ${SLOT_LABEL[slot]}s only`}, between{" "}
            {formatDayLong(state.preview.startDate)} and{" "}
            {formatDayLong(state.preview.endDate)}.
            {state.preview.skippedFull.length > 0 &&
              ` ${state.preview.skippedFull.length} skipped (full).`}
            {state.preview.skippedBlockCap.length > 0 &&
              ` ${state.preview.skippedBlockCap.length} skipped — repeat bookings can hold at most half the desks on any day, so occasional visitors can still get in.`}
            {state.preview.skippedExisting.length > 0 &&
              ` ${state.preview.skippedExisting.length} already booked by you.`}
            {state.preview.skippedHoliday.length > 0 &&
              ` ${state.preview.skippedHoliday.length} public holiday${state.preview.skippedHoliday.length === 1 ? "" : "s"} skipped.`}
            {state.preview.skippedCoworking.length > 0 &&
              ` ${state.preview.skippedCoworking.length} skipped — a co-working day has the whole office. You can ask those organisers for a spot from the calendar.`}
          </p>
          <button
            className={btnPrimary}
            disabled={pending || state.preview.eligible.length === 0}
            onClick={() =>
              startTransition(async () => {
                const res = await blockCreateAction(
                  weekdays,
                  until,
                  slot,
                  from || undefined
                );
                // blockCreateAction revalidates /book, so the grid behind this
                // form updates with the action response — no refresh needed.
                if (res.error) setState({ error: res.error });
                else setDone(res.booked ?? []);
              })
            }
          >
            {pending ? (
              <>
                <Spinner />
                Booking…
              </>
            ) : (
              `Book ${state.preview.eligible.length} ${
                slot === "day" ? "days" : `${SLOT_LABEL[slot]}s`
              }`
            )}
          </button>
        </div>
      ) : (
        <button
          className={btnSecondary}
          disabled={pending || weekdays.length === 0 || !until}
          onClick={() =>
            startTransition(async () => {
              setState(
                await blockPreviewAction(weekdays, until, slot, from || undefined)
              );
            })
          }
        >
          {pending ? (
            <>
              <Spinner />
              Checking…
            </>
          ) : (
            "Preview"
          )}
        </button>
      )}
      {state?.error && <p className="text-sm text-red-700 mt-2">{state.error}</p>}
    </div>
  );
}

"use client";

import { halves, Slot, SLOT_LABEL } from "@/lib/slots";

// The office floor plan, from James's sketch. A unit grid keeps every desk
// the same footprint: desks 2/3/4/5 and 7/8 lie two units wide by one deep,
// desks 1 and 6 are the same desks rotated 90° — one unit wide, spanning
// both rows of the island. Kitchen and lunch table stack against the left
// wall with nothing between them; the desk cluster starts after them, with
// 7 and 8 lined up above 2 and 4. Lounge sits behind the divider, right.
//
// Tracks: kitchen/lunch · gap · desk 1 · desks 7,2,3 · desks 8,4,5 · desk 6.
// A full desk is 2 units across, so the rotated ones (1, 6) are 1 unit.

export type DeskOccupant = { name: string; isYou: boolean };
/** Who holds each half of a desk. Both point at one person for a full day. */
export type DeskHalves = { am?: DeskOccupant; pm?: DeskOccupant };

const GRID_COLS = "2.5fr 0.35fr 1fr 2fr 2fr 1fr";
const GRID_ROWS = "2.25rem 1rem 2.25rem 2.25rem";

export function DeskMap({
  deskCount,
  occupants, // deskNumber -> who holds each half
  slot, // the hours being booked or viewed
  onPick,
  onPickFlex,
  disabled,
  flexOccupants = [],
  flexLeft = 0,
  flexWindow,
}: {
  deskCount: number;
  occupants: Map<number, DeskHalves>;
  slot: Slot;
  onPick?: (n: number) => void;
  onPickFlex?: () => void;
  disabled?: boolean;
  flexOccupants?: DeskOccupant[];
  flexLeft?: number;
  flexWindow?: string;
}) {
  const desk = (n: number, style: React.CSSProperties) => (
    <div style={style} key={n}>
      <Desk
        n={n}
        halves={occupants.get(n)}
        slot={slot}
        onPick={onPick}
        disabled={disabled}
      />
    </div>
  );

  // The drawn layout fits the real 8-desk room; other counts get a plain grid.
  if (deskCount !== 8) {
    return (
      <div className="grid grid-cols-4 gap-1.5">
        {Array.from({ length: deskCount }, (_, i) => (
          <div key={i + 1} className="h-10">
            <Desk
              n={i + 1}
              halves={occupants.get(i + 1)}
              slot={slot}
              onPick={onPick}
              disabled={disabled}
            />
          </div>
        ))}
      </div>
    );
  }

  return (
    <div className="relative select-none border border-slate-300 rounded-xl p-2.5 pr-12 bg-white">
      {/* lounge, behind the divider on the right */}
      <div className="absolute top-2 bottom-2 right-0 w-11 border-l border-dashed border-slate-300 flex items-center justify-center">
        <span className="text-[10px] text-slate-400 -rotate-90 whitespace-nowrap">
          lounge
        </span>
      </div>
      {/* door, left wall */}
      <div className="absolute -left-0.5 top-1/2 -translate-y-1/2 bg-white px-0.5 text-slate-400 text-[9px] leading-none text-center">
        <span className="text-sm leading-none">⇦</span>
        <br />
        door
      </div>

      <div
        className="grid gap-1.5"
        style={{ gridTemplateColumns: GRID_COLS, gridTemplateRows: GRID_ROWS }}
      >
        {/* left wall: kitchen above the lunch table, nothing between them */}
        <div
          style={{ gridColumn: "1 / 2", gridRow: "1" }}
          className="rounded-lg border border-slate-200 bg-slate-50 flex items-center justify-center text-[10px] text-slate-400"
        >
          kitchen
        </div>
        <div style={{ gridColumn: "1 / 2", gridRow: "3 / 5" }}>
          <LunchTable
            occupants={flexOccupants}
            left={flexLeft}
            onPick={onPickFlex}
            disabled={disabled}
            window={flexWindow}
          />
        </div>

        {/* top wall: 7 and 8, lined up above 2 and 4 */}
        {desk(7, { gridColumn: "4 / 5", gridRow: "1" })}
        {desk(8, { gridColumn: "5 / 6", gridRow: "1" })}

        {/* the island: 1 and 6 rotated on the ends, 2/4 over 3/5 between */}
        {desk(1, { gridColumn: "3 / 4", gridRow: "3 / 5" })}
        {desk(2, { gridColumn: "4 / 5", gridRow: "3" })}
        {desk(4, { gridColumn: "5 / 6", gridRow: "3" })}
        {desk(3, { gridColumn: "4 / 5", gridRow: "4" })}
        {desk(5, { gridColumn: "5 / 6", gridRow: "4" })}
        {desk(6, { gridColumn: "6 / 7", gridRow: "3 / 5" })}
      </div>
    </div>
  );
}

function initialsOf(name: string): string {
  return name
    .split(/\s+/)
    .map((w) => w[0])
    .slice(0, 2)
    .join("")
    .toUpperCase();
}

/** The lunch table — a seat like any other, just shared and shaped differently. */
function LunchTable({
  occupants,
  left,
  onPick,
  disabled,
  window: flexWindow,
}: {
  occupants: DeskOccupant[];
  left: number;
  onPick?: () => void;
  disabled?: boolean;
  window?: string;
}) {
  const mine = occupants.some((o) => o.isYou);
  const clickable = !mine && left > 0 && !!onPick && !disabled;
  return (
    <button
      type="button"
      disabled={!clickable}
      onClick={() => onPick?.()}
      title={
        mine
          ? "Lunch table — you"
          : left > 0
            ? `Lunch table — ${left} spot${left === 1 ? "" : "s"} free${
                flexWindow ? ` (packed up for lunch ${flexWindow})` : ""
              }`
            : "Lunch table — full"
      }
      className={`w-full h-full rounded-lg border text-[10px] flex flex-col items-center justify-center leading-tight px-1 text-center transition-colors ${
        mine
          ? "bg-teal-600 border-teal-700 text-white"
          : clickable
            ? "bg-white border-teal-300 text-teal-800 hover:bg-teal-50 cursor-pointer"
            : "bg-slate-50 border-slate-200 text-slate-400 cursor-default"
      }`}
    >
      <span className="font-medium">lunch table</span>
      <span className={mine ? "text-teal-100" : ""}>
        {mine ? "you" : left > 0 ? `${left} free` : "full"}
      </span>
      {occupants.length > 0 && (
        <span
          className={`mt-0.5 text-[9px] ${mine ? "text-teal-100" : "text-slate-400"}`}
        >
          {occupants
            .filter((o) => !o.isYou)
            .map((o) => initialsOf(o.name))
            .join(" ")}
        </span>
      )}
    </button>
  );
}

/**
 * One desk, viewed through the hours you're booking. A desk is free only if
 * every half you want is free — so a desk with just a morning booked reads as
 * available when you're picking an afternoon, and as half-taken when you're
 * picking a whole day.
 */
function Desk({
  n,
  halves: deskHalves,
  slot,
  onPick,
  disabled,
}: {
  n: number;
  halves?: DeskHalves;
  slot: Slot;
  onPick?: (n: number) => void;
  disabled?: boolean;
}) {
  const wanted = halves(slot).map((h) => deskHalves?.[h]);
  const holders = wanted.filter((o): o is DeskOccupant => !!o);
  const free = holders.length === 0;
  const yours = holders.some((o) => o.isYou);
  const clickable = free && !!onPick && !disabled;

  // Shared desks: in a whole-day view, one booked half still blocks you; in a
  // half-day view, the other half's holder is just your neighbour in time.
  const otherHalf =
    slot === "am" ? deskHalves?.pm : slot === "pm" ? deskHalves?.am : undefined;
  const partlyTaken = slot === "day" && holders.length === 1;

  const names = holders.map((o) => (o.isYou ? "you" : initialsOf(o.name)));
  const label = free
    ? otherHalf
      ? "½ free"
      : null
    : partlyTaken
      ? `½ ${names[0]}`
      : [...new Set(names)].join("/");

  const named = (o: DeskOccupant) => (o.isYou ? "you" : o.name);
  // Two different people across the halves is the only case worth spelling out.
  const shared =
    slot === "day" &&
    deskHalves?.am &&
    deskHalves?.pm &&
    deskHalves.am.name !== deskHalves.pm.name;

  const title = free
    ? otherHalf
      ? `Desk ${n} — free ${SLOT_LABEL[slot]} (${named(otherHalf)} ${otherHalf.isYou ? "have" : "has"} the other half)`
      : `Desk ${n} — free`
    : shared
      ? `Desk ${n} — morning: ${named(deskHalves!.am!)}, afternoon: ${named(deskHalves!.pm!)}`
      : `Desk ${n} — ${named(holders[0])}${
          partlyTaken ? ` (${deskHalves?.am ? "morning" : "afternoon"} only)` : ""
        }`;

  return (
    <button
      type="button"
      disabled={!clickable}
      onClick={() => onPick?.(n)}
      title={title}
      className={`w-full h-full rounded-lg border text-xs font-medium flex flex-col items-center justify-center gap-0 leading-tight transition-colors ${
        yours
          ? "bg-teal-600 border-teal-700 text-white"
          : !free
            ? "bg-slate-100 border-slate-200 text-slate-500 cursor-default"
            : clickable
              ? "bg-white border-teal-300 text-teal-800 hover:bg-teal-50 cursor-pointer"
              : "bg-white border-slate-200 text-slate-400"
      }`}
    >
      <span>{n}</span>
      {label && (
        <span className={`text-[9px] ${yours ? "text-teal-100" : "text-slate-400"}`}>
          {label}
        </span>
      )}
    </button>
  );
}

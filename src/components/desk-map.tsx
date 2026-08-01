"use client";

// The office floor plan, from James's sketch: kitchen along the top wall
// with desks 7–8 beside it, the main island in the middle (1, then 2/4
// facing 3/5, then 6), the lunch table bottom-left, and the lounge behind a
// divider on the right. Every desk renders the same size. Tap a free desk
// to take it.

export type DeskOccupant = { name: string; isYou: boolean };

export function DeskMap({
  deskCount,
  occupants, // deskNumber -> occupant
  onPick,
  disabled,
  flexUsed,
  flexTotal,
}: {
  deskCount: number;
  occupants: Map<number, DeskOccupant>;
  onPick?: (n: number) => void;
  disabled?: boolean;
  flexUsed?: number;
  flexTotal?: number;
}) {
  const desk = (n: number) => (
    <Desk key={n} n={n} occupant={occupants.get(n)} onPick={onPick} disabled={disabled} />
  );

  // The drawn layout fits the real 8-desk room; other counts get a plain grid.
  if (deskCount !== 8) {
    return (
      <div className="grid grid-cols-4 gap-1.5">
        {Array.from({ length: deskCount }, (_, i) => desk(i + 1))}
      </div>
    );
  }

  return (
    <div className="relative select-none border border-slate-300 rounded-xl p-2.5 pr-14 bg-white">
      {/* lounge, behind the divider on the right */}
      <div className="absolute top-2 bottom-2 right-0 w-12 border-l border-dashed border-slate-300 flex items-center justify-center">
        <span className="text-[10px] text-slate-400 -rotate-90 whitespace-nowrap">
          lounge
        </span>
      </div>
      {/* door on the left wall */}
      <div className="absolute -left-1 top-1/2 -translate-y-1/2 bg-white px-0.5 text-slate-400 text-[10px] leading-none text-center">
        <span className="text-base leading-none">⇦</span>
        <br />
        door
      </div>

      {/* top wall: kitchen + desks 7, 8 */}
      <div className="grid grid-cols-4 gap-1.5 mb-4">
        <div className="col-span-2 h-10 rounded-lg border border-slate-200 bg-slate-50 flex items-center justify-center text-[10px] text-slate-400">
          kitchen
        </div>
        {desk(7)}
        {desk(8)}
      </div>

      {/* the island: 1 | 2/4 over 3/5 | 6 — all desks the same size */}
      <div className="grid grid-cols-4 grid-rows-2 gap-1.5 mb-4 px-3">
        <div className="row-span-2 flex items-center">{desk(1)}</div>
        {desk(2)}
        {desk(4)}
        <div className="row-span-2 flex items-center">{desk(6)}</div>
        {desk(3)}
        {desk(5)}
      </div>

      {/* lunch table, bottom-left */}
      <div className="w-1/2 h-10 rounded-lg border border-slate-200 bg-slate-50 flex items-center justify-center text-[10px] text-slate-400">
        lunch table
        {typeof flexUsed === "number" && typeof flexTotal === "number"
          ? ` · ${flexUsed}/${flexTotal} spots taken`
          : ""}
      </div>
    </div>
  );
}

function Desk({
  n,
  occupant,
  onPick,
  disabled,
}: {
  n: number;
  occupant?: DeskOccupant;
  onPick?: (n: number) => void;
  disabled?: boolean;
}) {
  const free = !occupant;
  const clickable = free && !!onPick && !disabled;
  const initials = occupant
    ? occupant.name
        .split(/\s+/)
        .map((w) => w[0])
        .slice(0, 2)
        .join("")
        .toUpperCase()
    : null;
  return (
    <button
      type="button"
      disabled={!clickable}
      onClick={() => onPick?.(n)}
      title={
        occupant
          ? occupant.isYou
            ? `Desk ${n} — you`
            : `Desk ${n} — ${occupant.name}`
          : `Desk ${n} — free`
      }
      className={`w-full h-10 rounded-lg border text-xs font-medium flex flex-col items-center justify-center gap-0 leading-tight transition-colors ${
        occupant?.isYou
          ? "bg-teal-600 border-teal-700 text-white"
          : occupant
            ? "bg-slate-100 border-slate-200 text-slate-500 cursor-default"
            : clickable
              ? "bg-white border-teal-300 text-teal-800 hover:bg-teal-50 cursor-pointer"
              : "bg-white border-slate-200 text-slate-400"
      }`}
    >
      <span>{n}</span>
      {occupant && (
        <span className={`text-[9px] ${occupant.isYou ? "text-teal-100" : "text-slate-400"}`}>
          {occupant.isYou ? "you" : initials}
        </span>
      )}
    </button>
  );
}

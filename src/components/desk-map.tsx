"use client";

// The office floor plan, matching the room: desks 7–8 on their own island,
// the door to the left, and the main block — 1 on the end, 2/4 and 3/5
// facing pairs, 6 on the other end. Tap a free desk to take it.

export type DeskOccupant = { name: string; isYou: boolean };

export function DeskMap({
  deskCount,
  occupants, // deskNumber -> occupant
  onPick,
  disabled,
}: {
  deskCount: number;
  occupants: Map<number, DeskOccupant>;
  onPick?: (n: number) => void;
  disabled?: boolean;
}) {
  // The drawn layout fits the real 8-desk room; other counts get a plain grid.
  if (deskCount !== 8) {
    return (
      <div className="grid grid-cols-4 gap-1.5">
        {Array.from({ length: deskCount }, (_, i) => (
          <Desk key={i + 1} n={i + 1} occupant={occupants.get(i + 1)} onPick={onPick} disabled={disabled} />
        ))}
      </div>
    );
  }

  return (
    <div className="select-none">
      <div className="flex justify-center mb-3 pl-14">
        <div className="grid grid-cols-2 gap-1.5 w-44">
          <Desk n={7} occupant={occupants.get(7)} onPick={onPick} disabled={disabled} />
          <Desk n={8} occupant={occupants.get(8)} onPick={onPick} disabled={disabled} />
        </div>
      </div>
      <div className="flex items-center gap-2">
        <div className="text-center text-slate-400 shrink-0 w-12">
          <span className="text-xl leading-none">⇦</span>
          <p className="text-[10px]">door</p>
        </div>
        <div className="grid grid-cols-4 grid-rows-2 gap-1.5 flex-1">
          <div className="row-span-2">
            <Desk n={1} occupant={occupants.get(1)} onPick={onPick} disabled={disabled} tall />
          </div>
          <Desk n={2} occupant={occupants.get(2)} onPick={onPick} disabled={disabled} />
          <Desk n={4} occupant={occupants.get(4)} onPick={onPick} disabled={disabled} />
          <div className="row-span-2">
            <Desk n={6} occupant={occupants.get(6)} onPick={onPick} disabled={disabled} tall />
          </div>
          <Desk n={3} occupant={occupants.get(3)} onPick={onPick} disabled={disabled} />
          <Desk n={5} occupant={occupants.get(5)} onPick={onPick} disabled={disabled} />
        </div>
      </div>
    </div>
  );
}

function Desk({
  n,
  occupant,
  onPick,
  disabled,
  tall,
}: {
  n: number;
  occupant?: DeskOccupant;
  onPick?: (n: number) => void;
  disabled?: boolean;
  tall?: boolean;
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
      className={`w-full ${tall ? "h-full min-h-[72px]" : "h-9"} rounded-lg border text-xs font-medium flex flex-col items-center justify-center gap-0 leading-tight transition-colors ${
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

"use client";

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

const GRID_COLS = "2.5fr 0.35fr 1fr 2fr 2fr 1fr";
const GRID_ROWS = "2.25rem 1rem 2.25rem 2.25rem";

export function DeskMap({
  deskCount,
  occupants, // deskNumber -> occupant
  onPick,
  onPickFlex,
  disabled,
  flexOccupants = [],
  flexLeft = 0,
  flexWindow,
}: {
  deskCount: number;
  occupants: Map<number, DeskOccupant>;
  onPick?: (n: number) => void;
  onPickFlex?: () => void;
  disabled?: boolean;
  flexOccupants?: DeskOccupant[];
  flexLeft?: number;
  flexWindow?: string;
}) {
  const desk = (n: number, style: React.CSSProperties) => (
    <div style={style} key={n}>
      <Desk n={n} occupant={occupants.get(n)} onPick={onPick} disabled={disabled} />
    </div>
  );

  // The drawn layout fits the real 8-desk room; other counts get a plain grid.
  if (deskCount !== 8) {
    return (
      <div className="grid grid-cols-4 gap-1.5">
        {Array.from({ length: deskCount }, (_, i) => (
          <div key={i + 1} className="h-10">
            <Desk n={i + 1} occupant={occupants.get(i + 1)} onPick={onPick} disabled={disabled} />
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
  const initials = occupant ? initialsOf(occupant.name) : null;
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
      className={`w-full h-full rounded-lg border text-xs font-medium flex flex-col items-center justify-center gap-0 leading-tight transition-colors ${
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

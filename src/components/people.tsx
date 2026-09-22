"use client";

import { useState } from "react";
import { Avatar, Badge } from "./ui";
import { Slot, SLOT_BADGE } from "@/lib/slots";

export type PersonChipData = {
  id: string;
  name: string;
  seatType?: string;
  deskNumber?: number | null;
  slot?: Slot;
  isYou?: boolean;
  avatarUrl?: string | null;
  profile: {
    bio: string | null;
    expertise: string | null;
    causeAreas: string[] | null;
    link: string | null;
  } | null;
};

/**
 * Who's-coming chips.
 *
 * Tappable when there's something to show — a community profile, a photo, or
 * both. A photo alone counts: "who is that?" is answered by a face, and most
 * people add a picture long before they write a bio. Gating the tap on the
 * profile meant someone with a photo could only ever be seen at chip size,
 * which is a coloured dot.
 */
export function PeopleList({ people }: { people: PersonChipData[] }) {
  const [openId, setOpenId] = useState<string | null>(null);
  const open = people.find((p) => p.id === openId);

  return (
    <div>
      <div className="flex flex-wrap gap-1.5">
        {people.map((p) => {
          const clickable = !!p.profile || !!p.avatarUrl;
          return (
            <button
              key={p.id}
              disabled={!clickable}
              onClick={() => setOpenId(openId === p.id ? null : p.id)}
              className={`inline-flex items-center gap-1.5 rounded-full pl-1 pr-2.5 py-1 text-xs border ${
                openId === p.id
                  ? "border-teal-600 bg-teal-50"
                  : "border-slate-200 bg-slate-50"
              } ${clickable ? "cursor-pointer hover:bg-teal-50 hover:border-teal-300" : "cursor-default"}`}
              title={clickable ? `About ${p.name}` : undefined}
            >
              <Avatar name={p.name} size="sm" src={p.avatarUrl} />
              {p.isYou ? "You" : p.name}
              {p.seatType === "flex" ? (
                <span className="text-slate-400">table</span>
              ) : p.deskNumber ? (
                <span className="text-slate-400">d{p.deskNumber}</span>
              ) : null}
              {p.slot && p.slot !== "day" && (
                <span className="text-slate-400">{SLOT_BADGE[p.slot]}</span>
              )}
              {clickable && <span className="text-teal-600">›</span>}
            </button>
          );
        })}
      </div>

      {open && (open.profile || open.avatarUrl) && (
        /* Photo beside the text, not sitting on the name like a favicon —
           this panel is the whole point of tapping someone, and a 64px face
           is the difference between "who's that?" and "oh, them". */
        <div className="mt-3 border border-teal-200 bg-teal-50/50 rounded-xl p-3 text-sm flex gap-3 items-start">
          <Avatar name={open.name} src={open.avatarUrl} size="lg" />
          <div className="min-w-0 flex-1">
            <div className="flex items-center gap-2 mb-1.5 flex-wrap">
              <span className="font-semibold">{open.name}</span>
              {open.profile?.link && (
                <a
                  href={open.profile.link}
                  target="_blank"
                  rel="noreferrer"
                  className="text-xs text-teal-700 underline"
                >
                  profile ↗
                </a>
              )}
            </div>
            {open.profile?.causeAreas && open.profile.causeAreas.length > 0 && (
              <p className="flex flex-wrap gap-1 mb-1.5">
                {open.profile.causeAreas.map((c) => (
                  <Badge key={c} tone="teal">
                    {c}
                  </Badge>
                ))}
              </p>
            )}
            {open.profile?.bio && <p className="text-slate-700">{open.profile.bio}</p>}
            {open.profile?.expertise && (
              <p className="text-slate-500 mt-1">
                <span className="font-medium text-slate-600">Ask me about:</span>{" "}
                {open.profile.expertise}
              </p>
            )}
            {/* A face and a name is a legitimate amount to know about
                somebody. Don't make the panel look broken when that's all
                they've shared. */}
            {!open.profile && (
              <p className="text-slate-500">
                {open.isYou
                  ? "This is how you look to other members."
                  : "Hasn't added anything else yet."}
              </p>
            )}
          </div>
        </div>
      )}
    </div>
  );
}

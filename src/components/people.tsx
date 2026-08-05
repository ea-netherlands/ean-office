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
  profile: {
    bio: string | null;
    expertise: string | null;
    causeAreas: string[] | null;
    link: string | null;
  } | null;
};

/**
 * Who's-coming chips. People who opted in to a community profile are
 * tappable and expand to show it; everyone else is just a name.
 */
export function PeopleList({ people }: { people: PersonChipData[] }) {
  const [openId, setOpenId] = useState<string | null>(null);
  const open = people.find((p) => p.id === openId);

  return (
    <div>
      <div className="flex flex-wrap gap-1.5">
        {people.map((p) => {
          const clickable = !!p.profile;
          return (
            <button
              key={p.id}
              disabled={!clickable}
              onClick={() => setOpenId(openId === p.id ? null : p.id)}
              className={`inline-flex items-center gap-1.5 rounded-full pl-1 pr-2.5 py-0.5 text-xs border ${
                openId === p.id
                  ? "border-teal-600 bg-teal-50"
                  : "border-slate-200 bg-slate-50"
              } ${clickable ? "cursor-pointer hover:bg-teal-50 hover:border-teal-300" : "cursor-default"}`}
              title={clickable ? `About ${p.name}` : undefined}
            >
              <Avatar name={p.name} small />
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

      {open?.profile && (
        <div className="mt-3 border border-teal-200 bg-teal-50/50 rounded-xl p-3 text-sm">
          <div className="flex items-center gap-2 mb-1.5">
            <Avatar name={open.name} />
            <span className="font-semibold">{open.name}</span>
            {open.profile.link && (
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
          {open.profile.causeAreas && open.profile.causeAreas.length > 0 && (
            <p className="flex flex-wrap gap-1 mb-1.5">
              {open.profile.causeAreas.map((c) => (
                <Badge key={c} tone="teal">
                  {c}
                </Badge>
              ))}
            </p>
          )}
          {open.profile.bio && <p className="text-slate-700">{open.profile.bio}</p>}
          {open.profile.expertise && (
            <p className="text-slate-500 mt-1">
              <span className="font-medium text-slate-600">Ask me about:</span>{" "}
              {open.profile.expertise}
            </p>
          )}
        </div>
      )}
    </div>
  );
}

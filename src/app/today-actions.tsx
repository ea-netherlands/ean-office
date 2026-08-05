"use client";

import { useState, useTransition } from "react";
import Link from "next/link";
import { checkinAction } from "@/actions/checkin";
import { rsvpAction } from "@/actions/checkin";
import { btnPrimary, btnSecondary, Icon } from "@/components/ui";
import { Slot, SLOT_LABEL } from "@/lib/slots";

export function TodayActions({
  booked,
  checkedIn,
  seatType,
  deskNumber,
  slot,
  full,
}: {
  booked: boolean;
  checkedIn: boolean;
  seatType?: string;
  deskNumber?: number;
  slot?: Slot;
  full: boolean;
}) {
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);

  if (checkedIn) {
    return (
      <div>
        <p className="text-lg font-semibold text-teal-800 flex items-center gap-1.5">
          <Icon name="circle-check" className="text-teal-600" />
          You&apos;re checked in
        </p>
        <p className="text-sm text-slate-500 mt-1">Have a good day at the office!</p>
      </div>
    );
  }

  return (
    <div>
      {booked ? (
        <p className="text-lg font-semibold">
          You&apos;re booked {slot && slot !== "day" ? `this ${SLOT_LABEL[slot]}` : "today"}
          {seatType === "flex"
            ? " (lunch table)"
            : deskNumber
              ? ` — desk ${deskNumber}`
              : ""}
        </p>
      ) : (
        <p className="text-lg font-semibold">
          {full ? "The office is full today" : "You're not booked today"}
        </p>
      )}
      <div className="flex flex-wrap gap-2 mt-3">
        <button
          className={btnPrimary}
          disabled={pending}
          onClick={() =>
            startTransition(async () => {
              const res = await checkinAction();
              if (res.error) setError(res.error);
            })
          }
        >
          {pending ? "Checking in…" : booked ? "Check in" : "I'm here — check in"}
        </button>
        {!booked && !full && (
          <Link href="/book" className={btnSecondary}>
            Book a desk
          </Link>
        )}
      </div>
      {!booked && (
        <p className="text-xs text-slate-400 mt-2">
          At the office anyway? Checking in never turns you away.
        </p>
      )}
      {error && <p className="text-sm text-red-700 mt-2">{error}</p>}
    </div>
  );
}

export function RsvpButton({
  eventId,
  rsvped,
}: {
  eventId: string;
  rsvped: boolean;
}) {
  const [pending, startTransition] = useTransition();
  const [done, setDone] = useState(rsvped);
  if (done) {
    return <span className="text-xs text-teal-700 font-medium whitespace-nowrap">Going ✓</span>;
  }
  return (
    <button
      className="text-xs border border-slate-300 rounded-full px-3 py-1 hover:bg-slate-50 whitespace-nowrap cursor-pointer"
      disabled={pending}
      onClick={() =>
        startTransition(async () => {
          await rsvpAction(eventId);
          setDone(true);
        })
      }
    >
      RSVP
    </button>
  );
}

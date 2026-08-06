"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { cancelEventAction } from "@/actions/cancel-event";
import { btnDanger, btnSecondary, inputCls, Notice, Spinner } from "@/components/ui";

/**
 * Calling an event off. Used by admins in the events list and by organisers
 * on their own guest list, so both routes send the same emails and free the
 * same desks. The reason is optional but asked for every time: "cancelled"
 * with no explanation is the message people remember.
 */
export function CancelEventButton({
  eventId,
  title,
  date,
  coworking,
  signedUp,
  label = "Cancel this event",
  onDone,
}: {
  eventId: string;
  title: string;
  date: string;
  coworking: boolean;
  /** How many people would get an email, for the warning. */
  signedUp: number;
  label?: string;
  onDone?: (note: string) => void;
}) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [reason, setReason] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  if (!open) {
    return (
      <button type="button" className={btnDanger} onClick={() => setOpen(true)}>
        {label}
      </button>
    );
  }

  return (
    <div className="mt-2 space-y-2 border border-red-200 bg-red-50/50 rounded-xl p-3">
      <p className="text-sm text-slate-700">
        Call off <strong>{title}</strong> on {date}?{" "}
        {signedUp > 0
          ? `${signedUp} ${signedUp === 1 ? "person" : "people"} will get an email saying it's off.`
          : "Nobody has signed up yet, so nobody needs telling."}
        {coworking && " The day goes back to normal desk booking."}
      </p>
      <textarea
        className={inputCls}
        rows={2}
        maxLength={500}
        placeholder="Why? This goes in the email — e.g. 'the visiting team had to postpone'."
        value={reason}
        onChange={(e) => setReason(e.target.value)}
      />
      {error && <Notice tone="error">{error}</Notice>}
      <div className="flex gap-2">
        <button
          type="button"
          className={btnDanger}
          disabled={pending}
          onClick={() =>
            startTransition(async () => {
              const res = await cancelEventAction(eventId, reason);
              if (res.error) {
                setError(res.error);
                return;
              }
              setOpen(false);
              onDone?.(res.note ?? "Cancelled.");
              router.refresh();
            })
          }
        >
          {pending ? <Spinner /> : null} Yes, cancel it
        </button>
        <button
          type="button"
          className={btnSecondary}
          disabled={pending}
          onClick={() => setOpen(false)}
        >
          Keep it
        </button>
      </div>
    </div>
  );
}

"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { leaveEventAction } from "@/actions/event-guest";
import { Notice, btnSecondary } from "@/components/ui";

/**
 * Undoing your own sign-up while logged in. Two taps, not one — people land
 * on this page to check the time as often as to leave, and a single
 * unguarded "Leave" next to the date is a mis-tap waiting to happen.
 */
export function LeaveButton({
  eventId,
  pendingRequest,
}: {
  eventId: string;
  /** A co-working day request the organiser hasn't decided on yet. */
  pendingRequest?: boolean;
}) {
  const router = useRouter();
  const [confirming, setConfirming] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  if (!confirming) {
    return (
      <button
        type="button"
        onClick={() => setConfirming(true)}
        className="text-sm text-slate-500 underline cursor-pointer mt-3"
      >
        {pendingRequest ? "Withdraw my request" : "I can't make it"}
      </button>
    );
  }

  return (
    <div className="mt-4">
      <p className="text-sm text-slate-600 mb-2">
        {pendingRequest
          ? "Take your request back? You can ask again later."
          : "Take your name off the list? We'll let the organiser know."}
      </p>
      <div className="flex gap-2 justify-center">
        <button
          type="button"
          disabled={pending}
          onClick={() =>
            startTransition(async () => {
              const res = await leaveEventAction(eventId);
              if (res.error) setError(res.error);
              else router.refresh();
            })
          }
          className={btnSecondary}
        >
          {pending ? "One sec…" : "Yes, take me off"}
        </button>
        <button
          type="button"
          onClick={() => setConfirming(false)}
          className={btnSecondary}
        >
          Keep my place
        </button>
      </div>
      {error && (
        <Notice tone="error" className="mt-2">
          {error}
        </Notice>
      )}
    </div>
  );
}

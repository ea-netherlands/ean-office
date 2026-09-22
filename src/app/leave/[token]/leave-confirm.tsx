"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { leaveEventByTokenAction } from "@/actions/tokens";
import { btnDanger } from "@/components/ui";

export function LeaveConfirm({
  token,
  pending: isRequest,
}: {
  token: string;
  /** A co-working day request the organiser hasn't decided on yet. */
  pending: boolean;
}) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  return (
    <div className="w-full">
      <button
        className={`${btnDanger} w-full text-base py-3.5`}
        disabled={pending}
        onClick={() =>
          startTransition(async () => {
            const res = await leaveEventByTokenAction(token);
            if (res.error) setError(res.error);
            else router.refresh();
          })
        }
      >
        {pending
          ? "One sec…"
          : isRequest
            ? "Yes, withdraw it"
            : "Yes, take me off the list"}
      </button>
      {error && <p className="text-sm text-red-700 mt-2">{error}</p>}
    </div>
  );
}

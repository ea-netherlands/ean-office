"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { checkinAction, eventCheckinAction } from "@/actions/checkin";
import { btnPrimary } from "@/components/ui";

export function CheckinButtons({ full }: { full: boolean }) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  return (
    <div className="w-full">
      <button
        className={`${btnPrimary} w-full text-base py-3.5`}
        disabled={pending}
        onClick={() =>
          startTransition(async () => {
            const res = await checkinAction();
            if (res.error) setError(res.error);
            else router.refresh();
          })
        }
      >
        {pending ? "Checking in…" : full ? "Check in anyway" : "Check in (books today's desk)"}
      </button>
      {error && <p className="text-sm text-red-700 mt-2">{error}</p>}
    </div>
  );
}

CheckinButtons.Events = function EventButtons({
  events,
}: {
  events: { id: string; title: string; done: boolean }[];
}) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  return (
    <div className="space-y-2 w-full">
      {events.map((e) =>
        e.done ? (
          <p key={e.id} className="text-sm text-teal-700 font-medium py-2">
            ✓ You&apos;re counted for “{e.title}”
          </p>
        ) : (
          <button
            key={e.id}
            disabled={pending}
            className="w-full border border-indigo-300 bg-indigo-50 hover:bg-indigo-100 text-indigo-900 rounded-xl px-4 py-3 text-sm font-medium cursor-pointer"
            onClick={() =>
              startTransition(async () => {
                await eventCheckinAction(e.id);
                router.refresh();
              })
            }
          >
            I&apos;m here for “{e.title}”
          </button>
        )
      )}
    </div>
  );
};

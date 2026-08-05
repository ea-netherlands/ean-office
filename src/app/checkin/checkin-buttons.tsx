"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { checkinAction, eventCheckinAction } from "@/actions/checkin";
import { btnPrimary, Icon, Spinner } from "@/components/ui";

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
        {pending ? (
          <>
            <Spinner />
            Checking in…
          </>
        ) : full ? (
          "Check in anyway"
        ) : (
          "Check in (books today's desk)"
        )}
      </button>
      {error && <p className="text-sm text-red-700 mt-2">{error}</p>}
    </div>
  );
}

/**
 * A separate export, not a `CheckinButtons.Events` property: across the
 * server/client boundary the server only holds a client *reference* to this
 * module's exports, and reading a sub-component off that proxy yields
 * undefined — which React reports as "Element type is invalid".
 */
export function EventCheckinButtons({
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
          <p
            key={e.id}
            className="text-sm text-teal-700 font-medium py-2 inline-flex items-center gap-1.5"
          >
            <Icon name="circle-check" />
            You&apos;re counted for “{e.title}”
          </p>
        ) : (
          <button
            key={e.id}
            disabled={pending}
            className="btn-key-subtle w-full border border-teal-200 bg-teal-50 hover:bg-teal-100 text-teal-800 rounded-2xl px-4 py-3 text-sm font-medium cursor-pointer disabled:opacity-50 inline-flex items-center justify-center gap-1.5"
            onClick={() =>
              startTransition(async () => {
                await eventCheckinAction(e.id);
                router.refresh();
              })
            }
          >
            {pending ? <Spinner /> : null}
            I&apos;m here for “{e.title}”
          </button>
        )
      )}
    </div>
  );
}

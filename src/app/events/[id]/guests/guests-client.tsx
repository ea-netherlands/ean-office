"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { decideGuestAction } from "@/actions/event-guest";
import { Badge, Card, btnPrimary, btnSecondary } from "@/components/ui";

export type GuestRow = {
  id: string;
  name: string;
  email: string;
  status: "pending" | "approved" | "declined";
  accessibilityNotes: string | null;
  createdAt: string;
};

export function GuestsClient({ guests }: { guests: GuestRow[] }) {
  const pending = guests.filter((g) => g.status === "pending");
  const decided = guests.filter((g) => g.status !== "pending");

  if (guests.length === 0) {
    return <p className="text-slate-500 text-sm">No requests yet.</p>;
  }

  return (
    <div className="space-y-4">
      {pending.length > 0 && (
        <div className="space-y-2">
          <h2 className="text-sm text-slate-600">
            Waiting on you ({pending.length})
          </h2>
          {pending.map((g) => (
            <GuestCard key={g.id} guest={g} />
          ))}
        </div>
      )}
      {decided.length > 0 && (
        <div className="space-y-2">
          <h2 className="text-sm text-slate-600">Decided</h2>
          {decided.map((g) => (
            <GuestCard key={g.id} guest={g} />
          ))}
        </div>
      )}
    </div>
  );
}

function GuestCard({ guest }: { guest: GuestRow }) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);

  const decide = (decision: "approved" | "declined") =>
    startTransition(async () => {
      const res = await decideGuestAction(guest.id, decision);
      setError(res.error ?? null);
      router.refresh();
    });

  return (
    <Card className="flex items-start justify-between gap-3">
      <div>
        <p className="font-medium">{guest.name}</p>
        <p className="text-sm text-slate-500">{guest.email}</p>
        {guest.accessibilityNotes && (
          <p className="text-sm text-slate-500 mt-1">{guest.accessibilityNotes}</p>
        )}
        {error && <p className="text-sm text-red-700 mt-1">{error}</p>}
      </div>
      {guest.status === "pending" ? (
        <div className="flex gap-2 shrink-0">
          <button
            disabled={pending}
            onClick={() => decide("declined")}
            className={btnSecondary}
          >
            Decline
          </button>
          <button
            disabled={pending}
            onClick={() => decide("approved")}
            className={btnPrimary}
          >
            Approve
          </button>
        </div>
      ) : (
        <Badge tone={guest.status === "approved" ? "teal" : "stone"}>
          {guest.status === "approved" ? "Approved" : "Declined"}
        </Badge>
      )}
    </Card>
  );
}

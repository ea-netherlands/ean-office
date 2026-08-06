"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { decideGuestAction } from "@/actions/event-guest";
import { CancelEventButton } from "@/components/cancel-event-button";
import { Badge, Card, Icon, Notice, btnPrimary, btnSecondary } from "@/components/ui";

export type GuestRow = {
  id: string;
  name: string;
  email: string;
  status: "pending" | "approved" | "declined";
  accessibilityNotes: string | null;
  createdAt: string;
  seat: string | null;
  wasAlreadyBooked: boolean;
};

export type GuestsEvent = {
  id: string;
  title: string;
  dateLabel: string;
  coworking: boolean;
  cancellable: boolean;
  cancelledReason: string | null;
};

export function GuestsClient({
  guests,
  spots,
  shareUrl,
  open,
  event,
}: {
  guests: GuestRow[];
  spots: { total: number; taken: number; left: number };
  shareUrl: string;
  open: boolean;
  event: GuestsEvent;
}) {
  const [notice, setNotice] = useState<string | null>(null);
  const pending = guests.filter((g) => g.status === "pending");
  const decided = guests.filter((g) => g.status !== "pending");
  const live = guests.filter((g) => g.status !== "declined").length;

  return (
    <div className="space-y-4">
      {notice && <Notice className="mb-1">{notice}</Notice>}
      {event.cancelledReason !== null && (
        <Notice tone="error">
          This one has been called off — nobody is expected, and the day is
          open for normal desk booking again.
          {event.cancelledReason ? ` “${event.cancelledReason}”` : ""}
        </Notice>
      )}
      <Card className="space-y-3">
        <div className="flex items-baseline justify-between gap-3 flex-wrap">
          <h2>
            {spots.taken} of {spots.total} spots taken
          </h2>
          <span className="text-sm text-slate-500">
            {spots.left > 0
              ? `${spots.left} still free`
              : "The room is full — free a spot before approving anyone else"}
          </span>
        </div>
        <div
          className="h-2 rounded-full bg-slate-100 overflow-hidden"
          role="img"
          aria-label={`${spots.taken} of ${spots.total} spots taken`}
        >
          <div
            className="h-full bg-teal-600"
            style={{ width: `${Math.min(100, (spots.taken / spots.total) * 100)}%` }}
          />
        </div>
        {open && <ShareLink url={shareUrl} />}
      </Card>

      {/* Plans change, and the organiser is usually the first to know. */}
      {event.cancellable && (
        <Card className="space-y-2">
          <p className="text-sm text-slate-600">
            Can&apos;t go ahead? Call it off here — everyone who signed up gets
            an email, the desks go back, and the day reopens for normal
            booking.
          </p>
          <CancelEventButton
            eventId={event.id}
            title={event.title}
            date={event.dateLabel}
            coworking={event.coworking}
            signedUp={live}
            label={event.coworking ? "Cancel this co-working day" : "Cancel this event"}
            onDone={setNotice}
          />
        </Card>
      )}

      {guests.length === 0 ? (
        <p className="text-slate-500 text-sm">
          No requests yet. Share the link above with anyone you&apos;d like
          there.
        </p>
      ) : (
        <>
          {pending.length > 0 && (
            <div className="space-y-2">
              <h2 className="text-sm text-slate-600">
                Waiting on you ({pending.length})
              </h2>
              {pending.map((g) => (
                <GuestCard key={g.id} guest={g} full={spots.left <= 0} />
              ))}
            </div>
          )}
          {decided.length > 0 && (
            <div className="space-y-2">
              <h2 className="text-sm text-slate-600">Decided</h2>
              {decided.map((g) => (
                <GuestCard key={g.id} guest={g} full={spots.left <= 0} />
              ))}
            </div>
          )}
        </>
      )}
    </div>
  );
}

/** The one thing an organiser needs on day one: a link they can paste. */
function ShareLink({ url }: { url: string }) {
  const [copied, setCopied] = useState(false);
  return (
    <div>
      <p className="text-sm text-slate-600 mb-1.5">
        Share this with anyone you&apos;d like there — they don&apos;t need an
        account.
      </p>
      <div className="flex gap-2 items-center flex-wrap">
        <code className="text-xs bg-slate-50 border border-slate-200 rounded-lg px-2 py-1.5 break-all">
          {url}
        </code>
        <button
          type="button"
          className={btnSecondary}
          onClick={async () => {
            try {
              await navigator.clipboard.writeText(url);
              setCopied(true);
              setTimeout(() => setCopied(false), 2000);
            } catch {
              setCopied(false);
            }
          }}
        >
          <Icon name={copied ? "check" : "copy"} />
          {copied ? "Copied" : "Copy link"}
        </button>
      </div>
    </div>
  );
}

function GuestCard({ guest, full }: { guest: GuestRow; full: boolean }) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [note, setNote] = useState<string | null>(null);

  const decide = (decision: "approved" | "declined") =>
    startTransition(async () => {
      const res = await decideGuestAction(guest.id, decision);
      setError(res.error ?? null);
      setNote(res.note ?? null);
      router.refresh();
    });

  return (
    <Card className="flex items-start justify-between gap-3">
      <div>
        <p className="font-medium">
          {guest.name}{" "}
          {guest.wasAlreadyBooked && <Badge>booked before you</Badge>}
        </p>
        <p className="text-sm text-slate-500">{guest.email}</p>
        {guest.accessibilityNotes && (
          <p className="text-sm text-slate-500 mt-1">{guest.accessibilityNotes}</p>
        )}
        {guest.status === "approved" && (
          <p className="text-sm text-teal-700 mt-1">
            <Icon name="armchair" className="mr-1" />
            {guest.seat ? `Has ${guest.seat}` : "No desk yet — the day was full"}
          </p>
        )}
        {error && <p className="text-sm text-red-700 mt-1">{error}</p>}
        {note && <p className="text-sm text-slate-600 mt-1">{note}</p>}
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
            disabled={pending || full}
            title={full ? "The room is full" : undefined}
            onClick={() => decide("approved")}
            className={btnPrimary}
          >
            Approve
          </button>
        </div>
      ) : (
        <div className="flex flex-col items-end gap-2 shrink-0">
          <Badge tone={guest.status === "approved" ? "teal" : "stone"}>
            {guest.status === "approved" ? "Approved" : "Declined"}
          </Badge>
          {/* Both directions: a mis-tapped Decline shouldn't be final. */}
          <button
            disabled={pending || (guest.status === "declined" && full)}
            onClick={() => decide(guest.status === "approved" ? "declined" : "approved")}
            className="text-xs text-slate-500 underline cursor-pointer disabled:opacity-50"
          >
            {guest.status === "approved" ? "Undo" : "Approve after all"}
          </button>
        </div>
      )}
    </Card>
  );
}

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
  withdrew: boolean;
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
  viaLuma,
  open,
  event,
}: {
  guests: GuestRow[];
  /** Co-working days only — an evening event has no seat count to run out of. */
  spots: { total: number; taken: number; left: number } | null;
  shareUrl: string;
  /** It signs people up on Luma, so the guest list lives there. */
  viaLuma: boolean;
  open: boolean;
  event: GuestsEvent;
}) {
  const [notice, setNotice] = useState<string | null>(null);
  const pending = guests.filter((g) => g.status === "pending");
  const decided = guests.filter((g) => g.status !== "pending");
  const live = guests.filter((g) => g.status !== "declined").length;
  // An evening event has nothing to decide, so its list isn't "decided" —
  // it's who's coming and who dropped out, which are different questions and
  // shouldn't share a heading.
  const coming = decided.filter((g) => g.status === "approved");
  const notComing = decided.filter((g) => g.status === "declined");

  return (
    <div className="space-y-4">
      {notice && <Notice className="mb-1">{notice}</Notice>}
      {event.cancelledReason !== null && (
        <Notice tone="error">
          This one has been called off — nobody is expected
          {event.coworking ? ", and the day is open for normal desk booking again" : ""}.
          {event.cancelledReason ? ` “${event.cancelledReason}”` : ""}
        </Notice>
      )}
      <Card className="space-y-3">
        {spots ? (
          <>
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
          </>
        ) : (
          <div className="flex items-baseline justify-between gap-3 flex-wrap">
            <h2>
              {live} {live === 1 ? "person" : "people"} signed up
            </h2>
            <span className="text-sm text-slate-500">
              {open
                ? "Sign-ups are open — anyone with the link can put their name down"
                : "Sign-ups are closed"}
            </span>
          </div>
        )}
        {open && <ShareLink url={shareUrl} viaLuma={viaLuma} spots={spots} />}
      </Card>

      {/* Plans change, and the organiser is usually the first to know. */}
      {event.cancellable && (
        <Card className="space-y-2">
          <p className="text-sm text-slate-600">
            Can&apos;t go ahead? Call it off here — everyone who signed up gets
            an email
            {event.coworking
              ? ", the desks go back, and the day reopens for normal booking."
              : " so nobody turns up to a locked door."}
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
          {event.coworking ? "No requests yet." : "Nobody yet."} Share the link
          above with anyone you&apos;d like there.
        </p>
      ) : (
        <>
          {pending.length > 0 && (
            <div className="space-y-2">
              <h2 className="text-sm text-slate-600">
                Waiting on you ({pending.length})
              </h2>
              {pending.map((g) => (
                <GuestCard
                  key={g.id}
                  guest={g}
                  full={!!spots && spots.left <= 0}
                  curated={event.coworking}
                />
              ))}
            </div>
          )}
          {event.coworking
            ? decided.length > 0 && (
                <div className="space-y-2">
                  <h2 className="text-sm text-slate-600">Decided</h2>
                  {decided.map((g) => (
                    <GuestCard
                      key={g.id}
                      guest={g}
                      full={!!spots && spots.left <= 0}
                      curated
                    />
                  ))}
                </div>
              )
            : (
              <>
                {coming.length > 0 && (
                  <div className="space-y-2">
                    <h2 className="text-sm text-slate-600">
                      Coming ({coming.length})
                    </h2>
                    {coming.map((g) => (
                      <GuestCard key={g.id} guest={g} full={false} curated={false} />
                    ))}
                  </div>
                )}
                {notComing.length > 0 && (
                  <div className="space-y-2">
                    <h2 className="text-sm text-slate-600">
                      Not coming ({notComing.length})
                    </h2>
                    {notComing.map((g) => (
                      <GuestCard key={g.id} guest={g} full={false} curated={false} />
                    ))}
                  </div>
                )}
              </>
            )}
        </>
      )}
    </div>
  );
}

/** The one thing an organiser needs on day one: a link they can paste. */
function ShareLink({
  url,
  viaLuma,
  spots,
}: {
  url: string;
  viaLuma: boolean;
  spots: { total: number } | null;
}) {
  const [copied, setCopied] = useState(false);
  return (
    <div>
      <p className="text-sm text-slate-600 mb-1.5">
        {viaLuma ? (
          <>
            Sign-ups happen on Luma, so share that page.{" "}
            {/* We can't cap a Luma guest list from here, so the organiser
                has to carry the number across themselves. */}
            {spots && (
              <>
                <strong>Set the Luma capacity to {spots.total}</strong> —
                that&apos;s everyone the office holds, desks and lunch table
                together, and Luma will run a waitlist past it.
              </>
            )}
          </>
        ) : (
          <>
            Share this with anyone you&apos;d like there — they don&apos;t need
            an account.
          </>
        )}
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

function GuestCard({
  guest,
  full,
  curated,
}: {
  guest: GuestRow;
  full: boolean;
  /** Co-working days are decided one by one; evening sign-ups just are. */
  curated: boolean;
}) {
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
        {curated && guest.status === "approved" && (
          <p className="text-sm text-teal-700 mt-1">
            <Icon name="armchair" className="mr-1" />
            {guest.seat ? `Has ${guest.seat}` : "No desk yet — the day was full"}
          </p>
        )}
        {error && <p className="text-sm text-red-700 mt-1">{error}</p>}
        {note && <p className="text-sm text-slate-600 mt-1">{note}</p>}
      </div>
      {!curated ? (
        // Nothing to decide — but an organiser still needs a way to take
        // someone off the list when they say they can't come.
        <div className="flex flex-col items-end gap-2 shrink-0">
          <Badge tone={guest.status === "declined" ? "stone" : "teal"}>
            {guest.status !== "declined"
              ? "Coming"
              : guest.withdrew
                ? "Can't make it"
                : "Removed"}
          </Badge>
          <button
            disabled={pending}
            onClick={() => decide(guest.status === "declined" ? "approved" : "declined")}
            className="text-xs text-slate-500 underline cursor-pointer disabled:opacity-50"
          >
            {guest.status === "declined" ? "Put back on the list" : "Remove"}
          </button>
        </div>
      ) : guest.status === "pending" ? (
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
            {guest.status === "approved"
              ? "Approved"
              : guest.withdrew
                ? "Withdrew"
                : "Declined"}
          </Badge>
          {/* Both directions: a mis-tapped Decline shouldn't be final. A
              person who withdrew is a different case — re-approving them is
              putting someone back who said they couldn't come, so it says so. */}
          <button
            disabled={pending || (guest.status === "declined" && full)}
            onClick={() => decide(guest.status === "approved" ? "declined" : "approved")}
            className="text-xs text-slate-500 underline cursor-pointer disabled:opacity-50"
          >
            {guest.status === "approved"
              ? "Undo"
              : guest.withdrew
                ? "Put back on the list"
                : "Approve after all"}
          </button>
        </div>
      )}
    </Card>
  );
}

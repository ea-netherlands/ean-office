"use client";

import { useState, useTransition, useActionState } from "react";
import { useRouter } from "next/navigation";
import {
  createEventAction,
  setHeadcountAction,
  deleteEventAction,
  setEventTypeAction,
  setEventUrlAction,
  decideEventAction,
  askEventQuestionAction,
  syncLumaAction,
  AdminActionState,
} from "@/actions/admin";
import { CAUSE_AREAS } from "@/lib/profile-options";
import {
  Badge,
  Card,
  btnPrimary,
  btnSecondary,
  btnDanger,
  inputCls,
  labelCls,
} from "@/components/ui";
import { formatDay } from "@/lib/dates";
import { EVENING_START_MIN, EVENING_END_MAX, needsEveningWindow } from "@/lib/event-hours";
import { CancelEventButton } from "@/components/cancel-event-button";

export type EventRow = {
  id: string;
  title: string;
  date: string;
  startsAt: string | null;
  endsAt: string | null;
  type: string;
  causeArea: string | null;
  organiser: string;
  expectedAttendance: number | null;
  headcount: number | null;
  source: string;
  location: string | null;
  url: string | null;
  checkins: number;
  manual: number;
  rsvps: number;
  past: boolean;
  status: string;
  proposalNote: string | null;
  proposedBy: string | null;
  proposedByEmail: string | null;
  questionAskedAt: string | null;
  cancelReason: string | null;
  cancelledByName: string | null;
  /** Co-working days only: what confirming would sit on top of. */
  bookedThatDay: number;
  guestsPending: number;
  guestsApproved: number;
};

const EVENT_TYPES = [
  ["talk", "Talk"],
  ["social", "Social"],
  ["reading_group", "Reading group"],
  ["workshop", "Workshop"],
  ["unconference", "Unconference"],
  ["themed_coworking", "Themed coworking day"],
  ["other", "Other"],
] as const;

export function EventsClient({ rows }: { rows: EventRow[] }) {
  const router = useRouter();
  const [showForm, setShowForm] = useState(false);
  const [newType, setNewType] = useState<string>("talk");
  const [notice, setNotice] = useState<string | null>(null);
  const newEvening = needsEveningWindow(newType);
  const [state, action, pending] = useActionState<AdminActionState, FormData>(
    async (prev, fd) => {
      const res = await createEventAction(prev, fd);
      if (res.ok) {
        setShowForm(false);
        setNotice(res.note ?? null);
        router.refresh();
      }
      return res;
    },
    {}
  );

  // Two different questions wear the same `proposed` status. A member's
  // proposal asks "may this happen here?"; a synced event whose Luma page
  // never said where it is asks only "was this here?". Same gate, different
  // card, because answering them takes different information.
  const allProposed = rows.filter((r) => r.status === "proposed");
  const proposals = allProposed.filter((r) => r.source !== "luma");
  const unplaced = allProposed.filter((r) => r.source === "luma");
  const confirmed = rows.filter((r) => r.status !== "proposed");

  return (
    <div className="space-y-4">
      <div className="flex gap-2 items-center flex-wrap">
        <SyncButton />
        <button className={btnSecondary} onClick={() => setShowForm((v) => !v)}>
          {showForm ? "Close" : "+ Add event manually"}
        </button>
        {notice && <span className="text-sm text-slate-600">{notice}</span>}
      </div>

      {showForm && (
        <Card>
          <form action={action} className="grid sm:grid-cols-2 gap-3">
            <div className="sm:col-span-2">
              <label className={labelCls}>Title *</label>
              <input name="title" required className={inputCls} />
            </div>
            <div>
              <label className={labelCls}>Date *</label>
              <input name="date" type="date" required className={inputCls} />
            </div>
            <div>
              <label className={labelCls}>Type *</label>
              <select
                name="type"
                className={inputCls}
                value={newType}
                onChange={(e) => setNewType(e.target.value)}
              >
                {EVENT_TYPES.map(([v, l]) => (
                  <option key={v} value={v}>
                    {l}
                  </option>
                ))}
              </select>
            </div>
            <div>
              <label className={labelCls}>Starts</label>
              <input
                name="startsAt"
                type="time"
                min={newEvening ? EVENING_START_MIN : undefined}
                max={newEvening ? EVENING_END_MAX : undefined}
                className={inputCls}
              />
            </div>
            <div>
              <label className={labelCls}>Ends</label>
              <input
                name="endsAt"
                type="time"
                min={newEvening ? EVENING_START_MIN : undefined}
                max={newEvening ? EVENING_END_MAX : undefined}
                className={inputCls}
              />
            </div>
            {newEvening ? (
              <p className="text-xs text-slate-400 sm:col-span-2">
                Evening events run {EVENING_START_MIN}–{EVENING_END_MAX} — the
                alarm activates at {EVENING_END_MAX}. Co-working days run
                during office hours and are exempt.
              </p>
            ) : (
              <label className="sm:col-span-2 flex items-start gap-2 text-xs text-slate-600">
                <input type="checkbox" name="clearBookings" className="mt-0.5" />
                <span>
                  Clear the day: cancel any bookings already made for that date
                  and email those people an apology. Leave this off and they
                  keep their desks and join the guest list.
                </span>
              </label>
            )}
            <div>
              <label className={labelCls}>Cause area</label>
              <select name="causeArea" className={inputCls} defaultValue="">
                <option value="">—</option>
                {CAUSE_AREAS.map((c) => (
                  <option key={c}>{c}</option>
                ))}
              </select>
            </div>
            <div>
              <label className={labelCls}>Organiser</label>
              <select name="organiser" className={inputCls} defaultValue="ean">
                <option value="ean">EAN-organised</option>
                <option value="hosted">Hosted for someone else</option>
              </select>
            </div>
            <div>
              <label className={labelCls}>Expected attendance</label>
              <input name="expectedAttendance" type="number" className={inputCls} />
            </div>
            {state.error && (
              <p className="text-sm text-red-700 sm:col-span-2">{state.error}</p>
            )}
            <div className="sm:col-span-2">
              <button type="submit" disabled={pending} className={btnPrimary}>
                {pending ? "Creating…" : "Create event"}
              </button>
            </div>
          </form>
        </Card>
      )}

      {unplaced.length > 0 && (
        <Card className="border-slate-300">
          <h2 className="mb-1">Where were these?</h2>
          <p className="text-sm text-slate-600 mb-3">
            Luma doesn&apos;t say where {unplaced.length === 1 ? "this one is" : "these are"} — the
            location on the page is a link rather than an address, so we
            can&apos;t tell the office from a café. Until you say, {unplaced.length === 1 ? "it shows" : "they show"} to
            nobody and {unplaced.length === 1 ? "counts" : "count"} in no report.
          </p>
          <ul className="divide-y divide-slate-200">
            {unplaced.map((e) => (
              <UnplacedItem key={e.id} e={e} onNotice={setNotice} />
            ))}
          </ul>
        </Card>
      )}

      {proposals.length > 0 && (
        <Card className="border-teal-300 bg-teal-50/50">
          <h2 className="mb-1">Member proposals</h2>
          <p className="text-sm text-slate-600 mb-3">
            Not visible to anyone else and not counted in reports until you
            confirm them.
          </p>
          <ul className="divide-y divide-teal-200/60">
            {proposals.map((e) => (
              <ProposalItem key={e.id} e={e} onNotice={setNotice} />
            ))}
          </ul>
        </Card>
      )}

      <Card>
        {confirmed.length === 0 ? (
          <p className="text-sm text-slate-500">No events yet.</p>
        ) : (
          <ul className="divide-y divide-slate-100">
            {confirmed.map((e) => (
              <EventItem key={e.id} e={e} onNotice={setNotice} />
            ))}
          </ul>
        )}
      </Card>
    </div>
  );
}

function SyncButton() {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [result, setResult] = useState<string | null>(null);
  const [movedAway, setMovedAway] = useState<
    { id: string; title: string; date: string; location: string }[]
  >([]);
  const [skipped, setSkipped] = useState<{ location: string; count: number }[]>([]);
  return (
    <>
      <button
        className={btnPrimary}
        disabled={pending}
        onClick={() =>
          startTransition(async () => {
            const res = await syncLumaAction();
            setMovedAway(res.movedAway ?? []);
            setSkipped(res.skipped ?? []);
            const elsewhere = (res.skipped ?? []).reduce((n, s) => n + s.count, 0);
            setResult(
              res.error
                ? res.error
                : `Read ${res.total} Luma events — ${res.created} new at the office, ` +
                  `${res.updated} updated, ${elsewhere} at another address` +
                  (res.queued ? `, ${res.queued} waiting on you below` : "") +
                  "."
            );
            router.refresh();
          })
        }
      >
        {pending ? "Syncing…" : "Sync from Luma"}
      </button>
      {result && <span className="text-sm text-slate-500">{result}</span>}
      {/* Folded away, but there: if one of these venues is really yours
          written a way we don't recognise, the fix is to paste the line into
          "Office locations in the feed" — and you can only do that if you can
          see what the feed actually says. */}
      {skipped.length > 0 && (
        <details className="basis-full text-sm">
          <summary className="cursor-pointer text-slate-500 hover:text-slate-700">
            Addresses we treated as somewhere else ({skipped.length})
          </summary>
          <ul className="mt-2 space-y-0.5 text-xs text-slate-600">
            {skipped.map((s) => (
              <li key={s.location} className="break-all">
                {s.location}
                {s.count > 1 && <span className="text-slate-400"> × {s.count}</span>}
              </li>
            ))}
          </ul>
          <p className="mt-2 text-xs text-slate-500">
            Is one of these the office under another name? Add it to{" "}
            <strong>Office locations in the feed</strong> in Settings and sync
            again.
          </p>
        </details>
      )}
      {/* These are already in the app but the feed now puts them elsewhere —
          either they predate the office check or the venue has moved. Nothing
          is removed automatically: some carry a guest list. */}
      {movedAway.length > 0 && (
        <p className="basis-full text-sm text-amber-800 bg-amber-50 border border-amber-200 rounded-lg p-3">
          {movedAway.length === 1 ? "One event we hold is" : `${movedAway.length} events we hold are`}{" "}
          no longer at the office. Check whether {movedAway.length === 1 ? "it belongs" : "they belong"} here,
          and delete below if not:
          <span className="block mt-1 text-amber-900">
            {movedAway
              .map((m) => `${m.date} — ${m.title} (${m.location})`)
              .join("; ")}
          </span>
        </p>
      )}
    </>
  );
}

/**
 * One synced event whose Luma page never said where it happened.
 *
 * Two buttons and nothing else. There's no organiser to email and no capacity
 * to weigh — the admin is settling a fact, not granting a request, so the
 * member-proposal machinery (questions to the proposer, keep-or-clear the
 * day) would only be in the way. Confirming runs the ordinary confirm path,
 * so a co-working day still closes its day and brings the people already
 * booked along.
 */
function UnplacedItem({
  e,
  onNotice,
}: {
  e: EventRow;
  onNotice: (note: string | null) => void;
}) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const coworking = !needsEveningWindow(e.type);

  function decide(decision: "confirmed" | "declined") {
    startTransition(async () => {
      const res = await decideEventAction(e.id, decision);
      onNotice(res.note ?? res.error ?? null);
      router.refresh();
    });
  }

  return (
    <li className="py-3">
      <p className="text-sm font-medium">{e.title}</p>
      <p className="text-xs text-slate-500 mt-0.5">
        {formatDay(e.date)}
        {e.startsAt ? ` \u00b7 ${e.startsAt}${e.endsAt ? `\u2013${e.endsAt}` : ""}` : ""}
      </p>
      {e.location && (
        <p className="text-xs text-slate-500 mt-0.5 break-all">
          Luma says: <span className="text-slate-600">{e.location}</span>
        </p>
      )}
      {/* Said before the button rather than after it: on a co-working day
          "at the office" takes the whole room, and that shouldn't be a
          surprise discovered afterwards. */}
      {coworking && !e.past && (
        <p className="text-xs text-slate-600 mt-1.5 bg-white border border-slate-200 rounded-lg px-2 py-1.5">
          It&apos;s a co-working day, so saying it was at the office closes{" "}
          {formatDay(e.date)} to general desk booking.{" "}
          {e.bookedThatDay === 0
            ? "Nobody has booked that day."
            : `${e.bookedThatDay} ${e.bookedThatDay === 1 ? "person keeps their desk" : "people keep their desks"} and hears about it.`}
        </p>
      )}
      <div className="mt-2 flex gap-2 flex-wrap">
        <button className={btnPrimary} disabled={pending} onClick={() => decide("confirmed")}>
          {pending ? "Working\u2026" : "At the office"}
        </button>
        <button className={btnSecondary} disabled={pending} onClick={() => decide("declined")}>
          Somewhere else
        </button>
        {e.url && (
          <a href={e.url} target="_blank" rel="noreferrer" className={btnSecondary}>
            Open on Luma
          </a>
        )}
      </div>
    </li>
  );
}

function ProposalItem({
  e,
  onNotice,
}: {
  e: EventRow;
  /** Deciding removes this card, so its own feedback would vanish with it. */
  onNotice: (note: string | null) => void;
}) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [asking, setAsking] = useState(false);
  const [question, setQuestion] = useState("");
  const [note, setNote] = useState<string | null>(null);
  const coworking = !needsEveningWindow(e.type);

  function decide(
    decision: "confirmed" | "declined",
    existingBookings: "keep" | "clear" = "keep"
  ) {
    startTransition(async () => {
      const res = await decideEventAction(e.id, decision, existingBookings);
      onNotice(res.note ?? res.error ?? null);
      router.refresh();
    });
  }

  return (
    <li className="py-3">
      <p className="text-sm font-medium">
        {e.title}{" "}
        <Badge tone="teal">{coworking ? "co-working day proposed" : "proposed"}</Badge>
        {e.questionAskedAt && <Badge>waiting on them</Badge>}
      </p>
      {coworking && (
        <p className="text-xs text-slate-600 mt-1 bg-white border border-slate-200 rounded-lg px-2 py-1.5">
          Confirming closes {formatDay(e.date)} to general desk booking.{" "}
          {e.bookedThatDay === 0
            ? "Nobody has booked that day yet."
            : `${e.bookedThatDay} ${e.bookedThatDay === 1 ? "person has" : "people have"} already booked it — choose below whether they keep their desks or the day is cleared for the organiser.`}
        </p>
      )}
      <p className="text-xs text-slate-500 mt-0.5">
        {formatDay(e.date)}
        {e.startsAt ? ` \u00b7 ${e.startsAt}${e.endsAt ? `\u2013${e.endsAt}` : ""}` : ""}
        {e.expectedAttendance ? ` \u00b7 expects ~${e.expectedAttendance}` : ""}
      </p>
      {e.proposedBy && (
        <p className="text-xs text-slate-500">
          by {e.proposedBy}
          {e.proposedByEmail && (
            <>
              {" \u00b7 "}
              <a href={`mailto:${e.proposedByEmail}`} className="text-teal-700 underline">
                {e.proposedByEmail}
              </a>
            </>
          )}
          {e.questionAskedAt && ` \u00b7 asked ${e.questionAskedAt}`}
        </p>
      )}
      {e.proposalNote && (
        <p className="text-sm text-slate-700 mt-2 whitespace-pre-line">
          {e.proposalNote}
        </p>
      )}

      {asking ? (
        <div className="mt-3 space-y-2">
          <textarea
            className={inputCls}
            rows={3}
            placeholder="What would you like to ask them? Replies come straight to your inbox, not the shared one."
            value={question}
            onChange={(ev) => setQuestion(ev.target.value)}
          />
          <div className="flex gap-2">
            <button
              className={btnPrimary}
              disabled={pending || !question.trim()}
              onClick={() =>
                startTransition(async () => {
                  const res = await askEventQuestionAction(e.id, question);
                  setNote(res.error ?? `Sent to ${e.proposedBy}.`);
                  if (!res.error) {
                    setAsking(false);
                    setQuestion("");
                  }
                  router.refresh();
                })
              }
            >
              {pending ? "Sending\u2026" : "Send"}
            </button>
            <button className={btnSecondary} onClick={() => setAsking(false)}>
              Cancel
            </button>
          </div>
        </div>
      ) : (
        <div className="mt-3 flex gap-2 flex-wrap">
          <button className={btnPrimary} disabled={pending} onClick={() => decide("confirmed")}>
            {pending
              ? "Working\u2026"
              : coworking && e.bookedThatDay > 0
                ? "Confirm \u2014 they keep their desks"
                : "Confirm"}
          </button>
          {/* Taking the day back is a real decision with real emails, so it's
              its own button rather than a default. */}
          {coworking && e.bookedThatDay > 0 && (
            <button
              className={btnDanger}
              disabled={pending}
              onClick={() => {
                if (
                  confirm(
                    `Cancel ${e.bookedThatDay} ${e.bookedThatDay === 1 ? "person's booking" : "people's bookings"} on ${formatDay(e.date)} and email them an apology?\n\nThey'll be told the office isn't available that day because of "${e.title}", and pointed at the calendar to rebook. This can't be undone from here.`
                  )
                ) {
                  decide("confirmed", "clear");
                }
              }}
            >
              Confirm and clear the day
            </button>
          )}
          <button className={btnSecondary} onClick={() => setAsking(true)}>
            Ask a question
          </button>
          <button className={btnSecondary} disabled={pending} onClick={() => decide("declined")}>
            Decline
          </button>
        </div>
      )}
      {note && <p className="text-xs text-slate-500 mt-2">{note}</p>}
    </li>
  );
}

/**
 * Point a co-working day at its Luma page. Days get proposed here and
 * promoted on Luma afterwards, and until the two are joined up the office
 * site keeps collecting requests the organiser never reads.
 */
function LumaLinkField({ e }: { e: EventRow }) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [url, setUrl] = useState(e.url ?? "");
  const [error, setError] = useState<string | null>(null);

  return (
    <div className="mt-1.5 flex gap-2 items-center flex-wrap">
      <input
        type="url"
        placeholder="Luma page (https://lu.ma/…)"
        value={url}
        onChange={(ev) => setUrl(ev.target.value)}
        className="flex-1 min-w-56 rounded-lg border border-slate-300 px-2 py-1.5 text-xs"
      />
      <button
        className={btnSecondary}
        disabled={pending || url === (e.url ?? "")}
        onClick={() =>
          startTransition(async () => {
            const res = await setEventUrlAction(e.id, url);
            setError(res.error ?? null);
            if (!res.error) router.refresh();
          })
        }
      >
        {e.url ? "Update link" : "Move sign-ups to Luma"}
      </button>
      {error && <span className="text-xs text-red-600">{error}</span>}
    </div>
  );
}

function EventItem({
  e,
  onNotice,
}: {
  e: EventRow;
  onNotice: (note: string | null) => void;
}) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [headcount, setHeadcount] = useState(e.headcount?.toString() ?? "");
  const counted = Math.max(e.checkins + e.manual, e.headcount ?? 0);
  const coworking = !needsEveningWindow(e.type);
  const cancelled = e.status === "cancelled";

  function onTypeChange(type: string) {
    startTransition(async () => {
      await setEventTypeAction(e.id, type);
      router.refresh();
    });
  }

  return (
    <li className="py-3">
      <div className="flex items-start justify-between gap-3 flex-wrap">
        <div>
          <p className="text-sm font-medium">
            <span className={cancelled ? "line-through text-slate-400" : ""}>
              {e.title}
            </span>{" "}
            {cancelled && <Badge tone="red">cancelled</Badge>}
            {e.source === "luma" && <Badge tone="teal">luma</Badge>}
            {e.organiser === "hosted" && <Badge>hosted</Badge>}
          </p>
          {cancelled && (
            <p className="text-xs text-slate-500 mt-0.5">
              {e.cancelledByName ? `Called off by ${e.cancelledByName}` : "Called off"}
              {e.cancelReason ? ` — ${e.cancelReason}` : ""}
            </p>
          )}
          <p className="text-xs text-slate-400 flex items-center gap-1.5 flex-wrap mt-0.5">
            {formatDay(e.date)}
            {e.startsAt ? ` · ${e.startsAt}${e.endsAt ? `–${e.endsAt}` : ""}` : ""}
            {e.causeArea ? ` · ${e.causeArea}` : ""}
            <select
              value={e.type}
              onChange={(ev) => onTypeChange(ev.target.value)}
              className="border border-slate-200 rounded-lg px-1.5 py-0.5 text-xs bg-white cursor-pointer"
              title="Event type (used in funder reports)"
            >
              {EVENT_TYPES.map(([v, l]) => (
                <option key={v} value={v}>
                  {l}
                </option>
              ))}
            </select>
            {e.url && (
              <a
                href={e.url}
                target="_blank"
                rel="noreferrer"
                className="text-teal-700 underline"
              >
                luma page
              </a>
            )}
          </p>
        </div>
        <div className="text-right text-xs text-slate-500">
          <p>
            <strong className="text-base text-slate-800">{counted}</strong> attended
          </p>
          <p>
            {e.checkins} via QR · {e.rsvps} RSVPs
          </p>
        </div>
      </div>
      {coworking && !e.past && !cancelled && (
        <>
          <p className="text-xs text-slate-500 mt-1">
            Closed to general booking ·{" "}
            <a href={`/events/${e.id}/guests`} className="text-teal-700 underline">
              {e.guestsApproved} approved
              {e.guestsPending > 0 ? `, ${e.guestsPending} waiting` : ""}
            </a>
            {e.url
              ? " · sign-ups are on Luma"
              : " · sign-ups are here, on the office site"}
          </p>
          <LumaLinkField e={e} />
        </>
      )}
      {/* Calling it off is for events still to come; past ones get deleted
          below once they've been counted. */}
      {!e.past && !cancelled && (
        <div className="mt-2">
          <CancelEventButton
            eventId={e.id}
            title={e.title}
            date={formatDay(e.date)}
            coworking={coworking}
            signedUp={e.guestsPending + e.guestsApproved + e.rsvps}
            label={coworking ? "Cancel this co-working day" : "Cancel this event"}
            onDone={onNotice}
          />
        </div>
      )}
      {e.past && (
        <div className="mt-2 flex gap-2 items-center">
          <input
            type="number"
            placeholder="Headcount"
            value={headcount}
            onChange={(ev) => setHeadcount(ev.target.value)}
            className="w-28 rounded-lg border border-slate-300 px-2 py-1.5 text-sm"
          />
          <button
            className={btnSecondary}
            disabled={pending}
            onClick={() =>
              startTransition(async () => {
                await setHeadcountAction(e.id, parseInt(headcount, 10));
                router.refresh();
              })
            }
          >
            Save headcount
          </button>
          <button
            className="text-xs text-red-600 ml-auto cursor-pointer"
            onClick={() => {
              if (confirm(`Delete "${e.title}"?`))
                startTransition(async () => {
                  await deleteEventAction(e.id);
                  router.refresh();
                });
            }}
          >
            Delete
          </button>
        </div>
      )}
    </li>
  );
}

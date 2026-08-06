"use client";

import { useState, useTransition, useActionState } from "react";
import { useRouter } from "next/navigation";
import {
  createEventAction,
  setHeadcountAction,
  deleteEventAction,
  setEventTypeAction,
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

  const proposals = rows.filter((r) => r.status === "proposed");
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
  return (
    <>
      <button
        className={btnPrimary}
        disabled={pending}
        onClick={() =>
          startTransition(async () => {
            const res = await syncLumaAction();
            setResult(
              res.error
                ? res.error
                : `Synced ${res.total} Luma events — ${res.created} new, ${res.updated} updated.`
            );
            router.refresh();
          })
        }
      >
        {pending ? "Syncing…" : "Sync from Luma"}
      </button>
      {result && <span className="text-sm text-slate-500">{result}</span>}
    </>
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
        <p className="text-xs text-slate-500 mt-1">
          Closed to general booking ·{" "}
          <a href={`/events/${e.id}/guests`} className="text-teal-700 underline">
            {e.guestsApproved} approved
            {e.guestsPending > 0 ? `, ${e.guestsPending} waiting` : ""}
          </a>
        </p>
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

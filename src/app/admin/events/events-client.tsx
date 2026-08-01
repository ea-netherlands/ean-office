"use client";

import { useState, useTransition, useActionState } from "react";
import { useRouter } from "next/navigation";
import {
  createEventAction,
  setHeadcountAction,
  deleteEventAction,
  setEventTypeAction,
  syncLumaAction,
  AdminActionState,
} from "@/actions/admin";
import { CAUSE_AREAS } from "@/lib/profile-options";
import { Badge, Card, btnPrimary, btnSecondary, inputCls, labelCls } from "@/components/ui";
import { formatDay } from "@/lib/dates";

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
  const [state, action, pending] = useActionState<AdminActionState, FormData>(
    async (prev, fd) => {
      const res = await createEventAction(prev, fd);
      if (res.ok) {
        setShowForm(false);
        router.refresh();
      }
      return res;
    },
    {}
  );

  return (
    <div className="space-y-4">
      <div className="flex gap-2 items-center flex-wrap">
        <SyncButton />
        <button className={btnSecondary} onClick={() => setShowForm((v) => !v)}>
          {showForm ? "Close" : "+ Add event manually"}
        </button>
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
              <select name="type" className={inputCls} defaultValue="talk">
                {EVENT_TYPES.map(([v, l]) => (
                  <option key={v} value={v}>
                    {l}
                  </option>
                ))}
              </select>
            </div>
            <div>
              <label className={labelCls}>Starts</label>
              <input name="startsAt" type="time" className={inputCls} />
            </div>
            <div>
              <label className={labelCls}>Ends</label>
              <input name="endsAt" type="time" className={inputCls} />
            </div>
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

      <Card>
        {rows.length === 0 ? (
          <p className="text-sm text-slate-500">No events yet.</p>
        ) : (
          <ul className="divide-y divide-slate-100">
            {rows.map((e) => (
              <EventItem key={e.id} e={e} />
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

function EventItem({ e }: { e: EventRow }) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [headcount, setHeadcount] = useState(e.headcount?.toString() ?? "");
  const counted = Math.max(e.checkins + e.manual, e.headcount ?? 0);

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
            {e.title}{" "}
            {e.source === "luma" && <Badge tone="teal">luma</Badge>}
            {e.organiser === "hosted" && <Badge>hosted</Badge>}
          </p>
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

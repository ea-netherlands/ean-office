"use client";

import { useActionState, useEffect, useState } from "react";
import Link from "next/link";
import { proposeEventAction, ProposeState } from "@/actions/propose-event";
import { str } from "@/lib/form-values";
import { useFormDraft } from "@/components/form-draft";
import { Card, btnPrimary, btnSecondary, inputCls, labelCls, Icon } from "@/components/ui";
import { AvailabilityCalendar, Availability } from "./availability-calendar";
import { EVENING_END_MAX, eventHoursHint, eventStartMin, needsEveningWindow } from "@/lib/event-hours";

const TYPES = [
  ["reading_group", "Reading group"],
  ["talk", "Talk"],
  ["workshop", "Workshop"],
  ["social", "Social"],
  ["unconference", "Unconference"],
  ["themed_coworking", "Themed coworking day"],
  ["other", "Something else"],
] as const;

export function ProposeForm({
  availability,
  initialDate = "",
}: {
  availability: Availability[];
  /** A date carried over from the booking page, so it arrives already picked. */
  initialDate?: string;
}) {
  const [state, action, pending] = useActionState<ProposeState, FormData>(
    proposeEventAction,
    {}
  );
  const v = state.values;
  const attempt = state.attempt ?? 0;
  const { ref, clear } = useFormDraft("propose-event", attempt);
  const [date, setDate] = useState(str(v, "date") || initialDate);
  const [type, setType] = useState<string>(str(v, "type") || "reading_group");
  const evening = needsEveningWindow(type);
  const startMin = eventStartMin(type, date) ?? undefined;
  const hoursHint = eventHoursHint(type, date);

  useEffect(() => {
    if (state.ok) clear();
  }, [state.ok, clear]);

  if (state.ok) {
    return (
      <Card className="text-center py-10">
        <Icon name="circle-check" className="text-5xl text-teal-600 mb-3" />
        <h2 className="text-xl">Sent to the team</h2>
        <p className="text-slate-500 mt-2 max-w-sm mx-auto">
          An admin will confirm or come back to you with questions. Once
          it&apos;s confirmed you&apos;ll get an email and it&apos;ll show on the office
          calendar.
        </p>
        <Link href="/" className={`${btnSecondary} mt-5`}>
          Back to today
        </Link>
      </Card>
    );
  }

  return (
    <form key={attempt} ref={ref} action={action} className="space-y-4">
      <Card className="space-y-4">
        <div>
          <label className={labelCls}>What is it? *</label>
          <input
            name="title"
            required
            defaultValue={str(v, "title")}
            placeholder="e.g. Biosecurity reading group"
            className={inputCls}
          />
        </div>
        <div>
          <label className={labelCls}>Which dates are free?</label>
          <AvailabilityCalendar availability={availability} selected={date} onSelect={setDate} />
        </div>
        <div className="grid sm:grid-cols-2 gap-3">
          <div>
            <label className={labelCls}>Date *</label>
            <input
              name="date"
              type="date"
              required
              value={date}
              onChange={(e) => setDate(e.target.value)}
              className={inputCls}
            />
          </div>
          <div>
            <label className={labelCls}>Kind of event</label>
            <select
              name="type"
              className={inputCls}
              value={type}
              onChange={(e) => setType(e.target.value)}
            >
              {TYPES.map(([v, l]) => (
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
              defaultValue={str(v, "startsAt")}
              min={startMin}
              max={evening ? EVENING_END_MAX : undefined}
              className={inputCls}
            />
          </div>
          <div>
            <label className={labelCls}>Ends</label>
            <input
              name="endsAt"
              type="time"
              defaultValue={str(v, "endsAt")}
              min={startMin}
              max={evening ? EVENING_END_MAX : undefined}
              className={inputCls}
            />
          </div>
        </div>
        {hoursHint && <p className="text-xs text-slate-500">{hoursHint}</p>}
        <div>
          <label className={labelCls}>Roughly how many people?</label>
          <input
            name="expectedAttendance"
            type="number"
            min={1}
            defaultValue={str(v, "expectedAttendance")}
            className={inputCls}
            placeholder="10"
          />
        </div>
        <div>
          <label className={labelCls}>Anything else we should know?</label>
          <textarea
            name="proposalNote"
            rows={3}
            defaultValue={str(v, "proposalNote")}
            className={inputCls}
            placeholder="What it's for, whether you need the TV or the lounge, anything you'd like help with."
          />
        </div>
        <p className="text-xs text-slate-400">
          Events run outside office hours: weekday evenings from 17:30, or
          any time at weekends. The connecting doors close at 18:00 — an admin
          will walk you through the checklist once it&apos;s confirmed.
        </p>
      </Card>

      {state.error && (
        <p className="text-sm text-red-700 bg-red-50 border border-red-200 rounded-xl px-3 py-2">
          {state.error}
        </p>
      )}
      <button type="submit" disabled={pending} className={`${btnPrimary} w-full py-3.5 text-base`}>
        {pending ? "Sending…" : "Send to the team"}
      </button>
    </form>
  );
}

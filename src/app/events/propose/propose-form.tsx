"use client";

import { useActionState } from "react";
import Link from "next/link";
import { proposeEventAction, ProposeState } from "@/actions/propose-event";
import { Card, btnPrimary, btnSecondary, inputCls, labelCls, Icon } from "@/components/ui";

const TYPES = [
  ["reading_group", "Reading group"],
  ["talk", "Talk"],
  ["workshop", "Workshop"],
  ["social", "Social"],
  ["unconference", "Unconference"],
  ["themed_coworking", "Themed coworking day"],
  ["other", "Something else"],
] as const;

export function ProposeForm() {
  const [state, action, pending] = useActionState<ProposeState, FormData>(
    proposeEventAction,
    {}
  );

  if (state.ok) {
    return (
      <Card className="text-center py-10">
        <Icon name="circle-check" className="text-5xl text-teal-600 mb-3" />
        <h2 className="text-xl font-bold">Sent to the team</h2>
        <p className="text-slate-500 mt-2 max-w-sm mx-auto">
          An admin will confirm or come back to you with questions. Once it's
          confirmed you&apos;ll get an email and it&apos;ll show on the office
          calendar.
        </p>
        <Link href="/" className={`${btnSecondary} mt-5`}>
          Back to today
        </Link>
      </Card>
    );
  }

  return (
    <form action={action} className="space-y-4">
      <Card className="space-y-4">
        <div>
          <label className={labelCls}>What is it? *</label>
          <input
            name="title"
            required
            placeholder="e.g. Biosecurity reading group"
            className={inputCls}
          />
        </div>
        <div className="grid sm:grid-cols-2 gap-3">
          <div>
            <label className={labelCls}>Date *</label>
            <input name="date" type="date" required className={inputCls} />
          </div>
          <div>
            <label className={labelCls}>Kind of event</label>
            <select name="type" className={inputCls} defaultValue="reading_group">
              {TYPES.map(([v, l]) => (
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
        </div>
        <div>
          <label className={labelCls}>Roughly how many people?</label>
          <input
            name="expectedAttendance"
            type="number"
            min={1}
            className={inputCls}
            placeholder="10"
          />
        </div>
        <div>
          <label className={labelCls}>Anything else we should know?</label>
          <textarea
            name="proposalNote"
            rows={3}
            className={inputCls}
            placeholder="What it's for, whether you need the TV or the lounge, anything you'd like help with."
          />
        </div>
        <p className="text-xs text-slate-400">
          Events run outside office hours (after 17:00 or at weekends). The
          alarm is active from 22:00 and the connecting doors close at 18:00 —
          an admin will walk you through the checklist once it&apos;s confirmed.
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

"use client";

import { useActionState, useEffect, useState } from "react";
import Link from "next/link";
import {
  proposeCoworkingDayAction,
  CoworkingProposalState,
} from "@/actions/coworking";
import { str } from "@/lib/form-values";
import { useFormDraft } from "@/components/form-draft";
import { formatDayLong } from "@/lib/dates";
import {
  COWORKING_DEFAULT_END,
  COWORKING_DEFAULT_START,
  OFFICE_CLOSE,
  OFFICE_OPEN,
} from "@/lib/coworking";
import {
  Card,
  Icon,
  btnPrimary,
  btnSecondary,
  inputCls,
  labelCls,
} from "@/components/ui";
import { CoworkingDayInfo, DayPicker } from "./day-picker";

export function CoworkingForm({ days }: { days: CoworkingDayInfo[] }) {
  const [state, action, pending] = useActionState<CoworkingProposalState, FormData>(
    proposeCoworkingDayAction,
    {}
  );
  const v = state.values;
  const attempt = state.attempt ?? 0;
  const { ref, clear } = useFormDraft("coworking-propose", attempt);
  const [date, setDate] = useState(str(v, "date"));
  const picked = days.find((d) => d.date === date);

  useEffect(() => {
    if (state.ok) clear();
  }, [state.ok, clear]);

  if (state.ok) {
    return (
      <Card className="text-center py-10">
        <Icon name="circle-check" className="text-5xl text-teal-600 mb-3" />
        <h2 className="text-xl">Sent to the team</h2>
        <p className="text-slate-500 mt-2 max-w-md mx-auto">
          An admin will confirm it or come back to you with questions. Once
          it&apos;s confirmed the day closes to general desk booking, it shows
          on the office calendar, and you get a link to share — everyone who
          wants to come asks you, and you decide who&apos;s in.
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
          <label className={labelCls}>What&apos;s the day for? *</label>
          <input
            name="title"
            required
            defaultValue={str(v, "title")}
            placeholder="e.g. AI safety co-working day"
            className={inputCls}
          />
        </div>

        <div>
          <label className={labelCls}>Which day? *</label>
          <p className="text-xs text-slate-500 mb-2">
            Weekdays only. The number on each day is how many people have
            already booked a desk then.
          </p>
          <DayPicker days={days} selected={date} onSelect={setDate} />
          <input type="hidden" name="date" value={date} />
        </div>

        {picked && (
          <p
            className={`text-xs rounded-lg px-3 py-2 border ${
              picked.booked > 0
                ? "bg-orange-50 border-orange-200 text-orange-800"
                : "bg-teal-50 border-teal-200 text-teal-900"
            }`}
          >
            {formatDayLong(picked.date)} —{" "}
            {picked.booked === 0 ? (
              <>nobody has booked that day yet, so the room is all yours.</>
            ) : (
              <>
                {picked.booked} of {picked.total} spots{" "}
                {picked.booked === 1 ? "is" : "are"} already booked. Whoever
                confirms your day decides what happens to them: usually they
                keep their desks and count towards your {picked.total}, but if
                you need the room to yourself say so below and the team can
                clear the day and apologise to them.
              </>
            )}
            {picked.eveningEvent && (
              <> There&apos;s also {picked.eveningEvent} that evening.</>
            )}
          </p>
        )}

        <div className="grid sm:grid-cols-2 gap-3">
          <div>
            <label className={labelCls}>Starts</label>
            <input
              name="startsAt"
              type="time"
              defaultValue={str(v, "startsAt") || COWORKING_DEFAULT_START}
              min={OFFICE_OPEN}
              max={OFFICE_CLOSE}
              className={inputCls}
            />
          </div>
          <div>
            <label className={labelCls}>Ends</label>
            <input
              name="endsAt"
              type="time"
              defaultValue={str(v, "endsAt") || COWORKING_DEFAULT_END}
              min={OFFICE_OPEN}
              max={OFFICE_CLOSE}
              className={inputCls}
            />
          </div>
        </div>
        <p className="text-xs text-slate-500">
          Co-working days run inside office hours ({OFFICE_OPEN}–{OFFICE_CLOSE}
          ). Lunch is at 12:30 as usual.
        </p>

        <div>
          <label className={labelCls}>Roughly how many people?</label>
          <input
            name="expectedAttendance"
            type="number"
            min={1}
            defaultValue={str(v, "expectedAttendance")}
            className={inputCls}
            placeholder="8"
          />
          <p className="text-xs text-slate-400 mt-1">
            {days[0]?.total ?? 13} people fit — eight desks and the lunch
            table.
          </p>
        </div>

        <div>
          <label className={labelCls}>Anything the team should know?</label>
          <textarea
            name="proposalNote"
            rows={3}
            defaultValue={str(v, "proposalNote")}
            className={inputCls}
            placeholder="Who it's for, whether people are coming from outside, anything you'd like help with."
          />
        </div>
      </Card>

      <Card className="text-sm text-slate-600 space-y-1.5">
        <p className="font-medium text-slate-800">What confirming does</p>
        <p>
          The day closes to general desk booking and everyone who wants to come
          — members and newcomers alike — asks you through a link you can
          share. You approve or decline each one, and approving gives them a
          desk.
        </p>
        <p>
          Anyone who had already booked that day normally keeps their desk and
          is told what&apos;s happening. If your day needs the whole room, the
          team can instead clear those bookings and apologise to the people
          affected — worth flagging in the box above if that matters.
        </p>
      </Card>

      {state.error && (
        <p
          role="alert"
          className="text-sm text-red-700 bg-red-50 border border-red-200 rounded-xl px-3 py-2"
        >
          {state.error} Nothing else you typed has been lost.
        </p>
      )}
      <button
        type="submit"
        disabled={pending}
        className={`${btnPrimary} w-full py-3.5 text-base`}
      >
        {pending ? "Sending…" : "Send to the team"}
      </button>
    </form>
  );
}

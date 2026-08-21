"use client";

import { useActionState, useEffect, useState } from "react";
import Link from "next/link";
import {
  requestGuestBookingAction,
  GuestBookingState,
} from "@/actions/guest-request";
import { str } from "@/lib/form-values";
import { useFormDraft } from "@/components/form-draft";
import {
  Card,
  Icon,
  btnPrimary,
  btnSecondary,
  inputCls,
  labelCls,
} from "@/components/ui";

const VISIT_TYPES = [
  {
    value: "one_off",
    title: "A one-off visit",
    blurb:
      "They're joining you for the day — a colleague, a collaborator, someone you're working with. Nothing follows afterwards.",
  },
  {
    value: "first_visit",
    title: "Their first visit",
    blurb:
      "You think they might want to use the office regularly. This counts as their trial, and the team will follow up about membership once it's over.",
  },
] as const;

export function GuestForm() {
  const [state, action, pending] = useActionState<GuestBookingState, FormData>(
    requestGuestBookingAction,
    {}
  );
  const v = state.values;
  const attempt = state.attempt ?? 0;
  const { ref, clear } = useFormDraft("guest-request", attempt);
  const [visitType, setVisitType] = useState(
    str(v, "visitType") || "one_off"
  );
  const [multiDay, setMultiDay] = useState(Boolean(str(v, "endDate")));

  useEffect(() => {
    if (state.ok) clear();
  }, [state.ok, clear]);

  if (state.ok) {
    return (
      <Card className="text-center py-10">
        <Icon name="circle-check" className="text-5xl text-teal-600 mb-3" />
        <h2 className="text-xl">Sent to the team</h2>
        <p className="text-slate-500 mt-2 max-w-md mx-auto">
          Someone will look at it within one working day and you&apos;ll hear
          either way. We won&apos;t contact your guest until it&apos;s approved,
          so there&apos;s nothing awkward if the answer is no.
        </p>
        <Link href="/book" className={`${btnSecondary} mt-5`}>
          Back to booking
        </Link>
      </Card>
    );
  }

  return (
    <form ref={ref} action={action} key={attempt} className="space-y-4">
      <Card>
        <label className={labelCls} htmlFor="guestName">
          Who are you bringing?
        </label>
        <input
          id="guestName"
          name="guestName"
          className={inputCls}
          defaultValue={str(v, "guestName")}
          autoFocus={state.field === "guestName"}
          placeholder="Their full name"
        />

        <label className={`${labelCls} mt-4`} htmlFor="guestEmail">
          Their email
        </label>
        <input
          id="guestEmail"
          name="guestEmail"
          type="email"
          className={inputCls}
          defaultValue={str(v, "guestEmail")}
          autoFocus={state.field === "guestEmail"}
          placeholder="them@example.org"
        />
        <p className="text-sm text-slate-500 mt-1">
          Only used to send them the practical details if this is approved.
        </p>
      </Card>

      <Card>
        <span className={labelCls}>What kind of visit is this?</span>
        <div className="space-y-2 mt-2">
          {VISIT_TYPES.map((t) => (
            <label
              key={t.value}
              className={`block border rounded-xl p-3 cursor-pointer ${
                visitType === t.value
                  ? "border-teal-700 bg-teal-50"
                  : "border-slate-300 hover:bg-slate-50"
              }`}
            >
              <input
                type="radio"
                name="visitType"
                value={t.value}
                checked={visitType === t.value}
                onChange={() => setVisitType(t.value)}
                className="sr-only"
              />
              <span className="font-medium block">{t.title}</span>
              <span className="text-sm text-slate-600">{t.blurb}</span>
            </label>
          ))}
        </div>
      </Card>

      <Card>
        <label className={labelCls} htmlFor="date">
          {multiDay ? "First day" : "Which day?"}
        </label>
        <input
          id="date"
          name="date"
          type="date"
          className={inputCls}
          defaultValue={str(v, "date")}
          autoFocus={state.field === "date"}
        />

        <label className="flex items-center gap-2 mt-3 text-sm text-slate-600 cursor-pointer">
          <input
            type="checkbox"
            checked={multiDay}
            onChange={(e) => setMultiDay(e.target.checked)}
          />
          They&apos;re coming for several days
        </label>

        {multiDay && (
          <>
            <label className={`${labelCls} mt-3`} htmlFor="endDate">
              Last day
            </label>
            <input
              id="endDate"
              name="endDate"
              type="date"
              className={inputCls}
              defaultValue={str(v, "endDate")}
              autoFocus={state.field === "endDate"}
            />
            <p className="text-sm text-slate-500 mt-1">
              Every working day in between, weekends and holidays skipped.
            </p>
          </>
        )}

        <label className={`${labelCls} mt-4`} htmlFor="slot">
          How long?
        </label>
        <select
          id="slot"
          name="slot"
          className={inputCls}
          defaultValue={str(v, "slot") || "day"}
        >
          <option value="day">Full day</option>
          <option value="am">Morning</option>
          <option value="pm">Afternoon</option>
        </select>
      </Card>

      <Card>
        <label className={labelCls} htmlFor="reason">
          Why are you bringing them?
        </label>
        <textarea
          id="reason"
          name="reason"
          rows={4}
          className={inputCls}
          defaultValue={str(v, "reason")}
          autoFocus={state.field === "reason"}
          placeholder="A sentence is plenty — who they are and what you'll be doing."
        />
        <p className="text-sm text-slate-500 mt-1">
          This is what the team reads when deciding, so it&apos;s worth a line.
        </p>
      </Card>

      {state.error && (
        <p className="text-sm text-red-700" role="alert">
          {state.error}
        </p>
      )}

      <div className="flex gap-2">
        <button className={btnPrimary} disabled={pending} type="submit">
          {pending ? "Sending…" : "Send request"}
        </button>
        <Link href="/book" className={btnSecondary}>
          Cancel
        </Link>
      </div>
    </form>
  );
}

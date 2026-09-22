"use client";

import { useActionState, useEffect } from "react";
import { requestEventGuestAction, GuestRequestState } from "@/actions/event-guest";
import { str } from "@/lib/form-values";
import { useFormDraft } from "@/components/form-draft";
import { Card, btnPrimary, inputCls, labelCls, Icon } from "@/components/ui";

export function RsvpForm({
  eventId,
  open,
  defaultName,
  defaultEmail,
}: {
  eventId: string;
  /** Evening events: signing up is signing up, so say so rather than
   *  promising a decision that never comes. */
  open?: boolean;
  defaultName?: string;
  defaultEmail?: string;
}) {
  const [state, action, pending] = useActionState<GuestRequestState, FormData>(
    requestEventGuestAction.bind(null, eventId),
    {}
  );
  const v = state.values;
  const attempt = state.attempt ?? 0;
  const { ref, clear } = useFormDraft(`guest:${eventId}`, attempt);

  useEffect(() => {
    if (state.ok) clear();
  }, [state.ok, clear]);

  if (state.ok) {
    return (
      <Card className="text-center py-10">
        <Icon name="circle-check" className="text-5xl text-teal-600 mb-3" />
        <h2 className="text-xl">{open ? "You're on the list" : "Request sent"}</h2>
        <p className="text-slate-500 mt-2 max-w-sm mx-auto">
          {open
            ? "We've emailed you the details, including where to find us. See you there."
            : "The organiser will confirm shortly — you'll get an email either way."}
        </p>
      </Card>
    );
  }

  // Re-keyed on a rejected submit so the echoed answers land — see the note
  // in lib/form-values.
  return (
    <form key={attempt} ref={ref} action={action} className="space-y-4">
      <Card className="space-y-4">
        <div>
          <label className={labelCls}>Name *</label>
          <input
            name="name"
            required
            defaultValue={str(v, "name") || defaultName}
            className={inputCls}
            autoComplete="name"
          />
        </div>
        <div>
          <label className={labelCls}>Email *</label>
          <input
            name="email"
            type="email"
            required
            defaultValue={str(v, "email") || defaultEmail}
            className={inputCls}
            autoComplete="email"
          />
        </div>
        <div>
          <label className={labelCls}>Anything we should know?</label>
          <textarea
            name="accessibilityNotes"
            rows={2}
            defaultValue={str(v, "accessibilityNotes")}
            className={inputCls}
            placeholder={
              open
                ? "Accessibility needs, dietary things — anything."
                : "Accessibility needs, dietary things at lunch — anything."
            }
          />
        </div>
        <label className="flex items-start gap-2 text-sm text-slate-700">
          <input
            type="checkbox"
            name="guidelines"
            required
            defaultChecked={str(v, "guidelines") === "on"}
            className="mt-0.5"
          />
          <span>
            I&apos;ve read the{" "}
            <a
              href="https://effectiefaltruisme.nl/en/legal/code-of-conduct"
              target="_blank"
              rel="noreferrer"
              className="text-teal-700 underline"
            >
              office guidelines
            </a>{" "}
            *
          </span>
        </label>
      </Card>

      {state.error && (
        <p className="text-sm text-red-700 bg-red-50 border border-red-200 rounded-xl px-3 py-2">
          {state.error}
        </p>
      )}
      <button type="submit" disabled={pending} className={`${btnPrimary} w-full py-3.5 text-base`}>
        {pending ? "Sending…" : open ? "Sign me up" : "Ask to join"}
      </button>
    </form>
  );
}

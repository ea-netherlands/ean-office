"use client";

import { useActionState } from "react";
import { requestEventGuestAction, GuestRequestState } from "@/actions/event-guest";
import { Card, btnPrimary, inputCls, labelCls, Icon } from "@/components/ui";

export function RsvpForm({
  eventId,
  defaultName,
  defaultEmail,
}: {
  eventId: string;
  defaultName?: string;
  defaultEmail?: string;
}) {
  const [state, action, pending] = useActionState<GuestRequestState, FormData>(
    requestEventGuestAction.bind(null, eventId),
    {}
  );

  if (state.ok) {
    return (
      <Card className="text-center py-10">
        <Icon name="circle-check" className="text-5xl text-teal-600 mb-3" />
        <h2 className="text-xl font-bold">Request sent</h2>
        <p className="text-slate-500 mt-2 max-w-sm mx-auto">
          The organiser will confirm shortly — you&apos;ll get an email
          either way.
        </p>
      </Card>
    );
  }

  return (
    <form action={action} className="space-y-4">
      <Card className="space-y-4">
        <div>
          <label className={labelCls}>Name *</label>
          <input
            name="name"
            required
            defaultValue={defaultName}
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
            defaultValue={defaultEmail}
            className={inputCls}
            autoComplete="email"
          />
        </div>
        <div>
          <label className={labelCls}>Anything we should know?</label>
          <textarea
            name="accessibilityNotes"
            rows={2}
            className={inputCls}
            placeholder="Accessibility needs, dietary things at lunch — anything."
          />
        </div>
        <label className="flex items-start gap-2 text-sm text-slate-700">
          <input type="checkbox" name="guidelines" required className="mt-0.5" />
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
        {pending ? "Sending…" : "Ask to join"}
      </button>
    </form>
  );
}

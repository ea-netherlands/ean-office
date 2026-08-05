"use client";

import { useActionState } from "react";
import { claimAccountAction, WelcomeState } from "@/actions/welcome";
import { FREQUENCIES } from "@/lib/profile-options";
import { btnPrimary, inputCls, labelCls, Card } from "@/components/ui";

export function WelcomeForm({ defaultName }: { defaultName: string }) {
  const [state, action, pending] = useActionState<WelcomeState, FormData>(
    claimAccountAction,
    {}
  );

  return (
    <form action={action} className="space-y-6">
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
          <label className={labelCls}>
            How often do you expect to come in? *
          </label>
          <select name="expectedFrequency" required className={inputCls} defaultValue="">
            <option value="" disabled>
              Choose…
            </option>
            {FREQUENCIES.map((f) => (
              <option key={f}>{f}</option>
            ))}
          </select>
        </div>
        <div>
          <label className={labelCls}>
            Anything we should know for next time you&apos;re in?
          </label>
          <textarea name="accessibilityNotes" rows={2} className={inputCls} />
          <p className="text-xs text-slate-400 mt-1">
            Accessibility needs, dietary things at lunch — anything.
          </p>
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
        {pending ? "Saving…" : "Start booking"}
      </button>
    </form>
  );
}

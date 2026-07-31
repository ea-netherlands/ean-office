"use client";

import { useActionState } from "react";
import { requestMagicLink, MagicLinkState } from "@/actions/auth";
import { btnPrimary, inputCls } from "@/components/ui";

export function LoginForm({ redirectTo }: { redirectTo?: string }) {
  const [state, action, pending] = useActionState<MagicLinkState, FormData>(
    requestMagicLink,
    {}
  );

  if (state.sent) {
    return (
      <div className="bg-teal-50 border border-teal-200 rounded-xl p-5">
        <p className="font-medium text-teal-900">Check your email</p>
        <p className="text-sm text-teal-800 mt-1">
          If we know that address, a login link is on its way. It works for 30
          minutes.
        </p>
        {state.devLink && (
          <p className="text-xs mt-3 text-slate-500 break-all">
            <span className="font-semibold">Dev mode</span> (no email provider
            configured):{" "}
            <a className="text-teal-700 underline" href={state.devLink}>
              open your login link
            </a>
          </p>
        )}
      </div>
    );
  }

  return (
    <form action={action} className="space-y-3">
      <input
        type="email"
        name="email"
        required
        placeholder="you@example.org"
        className={inputCls}
        autoComplete="email"
      />
      {redirectTo && <input type="hidden" name="redirectTo" value={redirectTo} />}
      {state.error && <p className="text-sm text-red-700">{state.error}</p>}
      <button type="submit" disabled={pending} className={`${btnPrimary} w-full`}>
        {pending ? "Sending…" : "Email me a login link"}
      </button>
    </form>
  );
}

"use client";

import { useActionState, useState } from "react";
import { requestMagicLink, MagicLinkState } from "@/actions/auth";
import { btnPrimary, inputCls } from "@/components/ui";

export function LoginForm({ redirectTo }: { redirectTo?: string }) {
  // Bumping the key remounts the form, clearing the "sent" state so the
  // person can try a different address.
  const [attempt, setAttempt] = useState(0);
  return (
    <LoginFormInner
      key={attempt}
      redirectTo={redirectTo}
      onRetry={() => setAttempt((n) => n + 1)}
    />
  );
}

function LoginFormInner({
  redirectTo,
  onRetry,
}: {
  redirectTo?: string;
  onRetry: () => void;
}) {
  const [state, action, pending] = useActionState<MagicLinkState, FormData>(
    requestMagicLink,
    {}
  );

  if (state.sent) {
    return (
      <div className="bg-teal-50 border border-teal-200 rounded-xl p-5">
        <p className="font-medium text-teal-900">Check your email</p>
        <p className="text-sm text-teal-800 mt-1">
          We&apos;ve sent an email to{" "}
          <span className="font-semibold break-all">{state.email}</span>. If
          you have an account, it contains a login link that works for 30
          minutes.
        </p>
        <div className="text-sm text-teal-800 mt-3 pt-3 border-t border-teal-200 space-y-2">
          <p className="font-medium">Nothing arrived after a few minutes?</p>
          <ul className="list-disc pl-5 space-y-1">
            <li>Check your spam folder, and that the address above is right.</li>
            <li>
              You may have signed up with a different email (work or personal).{" "}
              <button
                type="button"
                onClick={onRetry}
                className="text-teal-700 font-medium underline"
              >
                Try another address
              </button>
              .
            </li>
            <li>
              You may not have an account yet — if you&apos;ve never been to the
              office or never signed up,{" "}
              <a href="/join" className="text-teal-700 font-medium underline">
                request a first visit
              </a>
              .
            </li>
          </ul>
        </div>
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

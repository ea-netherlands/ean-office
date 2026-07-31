"use client";

import { useState, useTransition } from "react";
import { btnPrimary } from "@/components/ui";

export function TokenConfirm({
  token,
  action,
  label,
  doneTitle,
  doneText,
}: {
  token: string;
  action: (token: string) => Promise<{ ok?: boolean; error?: string }>;
  label: string;
  doneTitle: string;
  doneText: string;
}) {
  const [pending, startTransition] = useTransition();
  const [done, setDone] = useState(false);
  const [error, setError] = useState<string | null>(null);

  if (done) {
    return (
      <div>
        <h2 className="text-lg font-bold text-teal-800">{doneTitle}</h2>
        <p className="text-sm text-slate-500 mt-1">{doneText}</p>
      </div>
    );
  }

  return (
    <div className="w-full">
      <button
        className={`${btnPrimary} w-full text-base py-3.5`}
        disabled={pending}
        onClick={() =>
          startTransition(async () => {
            const res = await action(token);
            if (res.error) setError(res.error);
            else setDone(true);
          })
        }
      >
        {pending ? "One sec…" : label}
      </button>
      {error && <p className="text-sm text-red-700 mt-2">{error}</p>}
    </div>
  );
}

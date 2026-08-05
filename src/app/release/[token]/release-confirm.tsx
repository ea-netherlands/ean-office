"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { releaseByTokenAction } from "@/actions/tokens";
import { btnPrimary } from "@/components/ui";

export function ReleaseConfirm({ token }: { token: string }) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  return (
    <div className="w-full">
      <button
        className={`${btnPrimary} w-full text-base py-3.5`}
        disabled={pending}
        onClick={() =>
          startTransition(async () => {
            const res = await releaseByTokenAction(token);
            if (res.error) setError(res.error);
            else router.refresh();
          })
        }
      >
        {pending ? "Freeing it up…" : "Yes, free my afternoon"}
      </button>
      {error && <p className="text-sm text-red-700 mt-2">{error}</p>}
    </div>
  );
}

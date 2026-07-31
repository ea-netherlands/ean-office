"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { cancelByTokenAction } from "@/actions/tokens";
import { btnDanger } from "@/components/ui";

export function CancelConfirm({ token }: { token: string }) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  return (
    <div className="w-full">
      <button
        className={`${btnDanger} w-full text-base py-3.5`}
        disabled={pending}
        onClick={() =>
          startTransition(async () => {
            const res = await cancelByTokenAction(token);
            if (res.error) setError(res.error);
            else router.refresh();
          })
        }
      >
        {pending ? "Cancelling…" : "Yes, cancel it"}
      </button>
      {error && <p className="text-sm text-red-700 mt-2">{error}</p>}
    </div>
  );
}

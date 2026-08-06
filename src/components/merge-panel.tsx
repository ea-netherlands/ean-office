"use client";

import { useEffect, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { mergeUsersAction, previewMergeAction } from "@/actions/merge-users";
import type { MergePlan } from "@/lib/users";
import { Card, Notice, Spinner, btnPrimary, btnSecondary, inputCls } from "@/components/ui";

export type MergeCandidate = { id: string; name: string; email: string };

/**
 * Two accounts, one person. The panel makes the direction explicit — which
 * address stays primary — and shows what moves before anything happens,
 * because a merge can't be undone from the app.
 */
export function MergePanel({
  people,
  initialA,
  initialB,
  onClose,
  onDone,
}: {
  people: MergeCandidate[];
  initialA?: string;
  initialB?: string;
  onClose: () => void;
  onDone: (note: string) => void;
}) {
  const router = useRouter();
  const [keepId, setKeepId] = useState(initialA ?? "");
  const [mergeId, setMergeId] = useState(initialB ?? "");
  const [plan, setPlan] = useState<MergePlan | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();
  const [confirming, setConfirming] = useState(false);

  // Preview on selection rather than in an effect: the pair only changes
  // when someone picks, and an effect here would cascade renders.
  function choose(nextKeep: string, nextMerge: string) {
    setKeepId(nextKeep);
    setMergeId(nextMerge);
    setPlan(null);
    setError(null);
    setConfirming(false);
    if (!nextKeep || !nextMerge || nextKeep === nextMerge) return;
    startTransition(async () => {
      const res = await previewMergeAction(nextKeep, nextMerge);
      setError(res.error ?? null);
      setPlan(res.plan ?? null);
    });
  }

  // The pair can arrive pre-filled from the duplicates list, in which case
  // the selects are already right and only the preview is missing.
  useEffect(() => {
    if (!initialA || !initialB || initialA === initialB) return;
    startTransition(async () => {
      const res = await previewMergeAction(initialA, initialB);
      setError(res.error ?? null);
      setPlan(res.plan ?? null);
    });
  }, [initialA, initialB]);

  const label = (p: MergeCandidate) => `${p.name} · ${p.email}`;

  return (
    <Card className="space-y-3 border-teal-300">
      <div className="flex items-start justify-between gap-3">
        <div>
          <h2>Merge two accounts</h2>
          <p className="text-sm text-slate-600 mt-0.5">
            One person, two addresses. Everything moves to the account you
            keep, and the other address keeps working as a second way to log
            in.
          </p>
        </div>
        <button className={btnSecondary} onClick={onClose}>
          Close
        </button>
      </div>

      <div className="grid sm:grid-cols-2 gap-3">
        <label className="text-sm">
          <span className="block font-medium text-slate-700 mb-1">
            Keep this account
          </span>
          <select
            className={inputCls}
            value={keepId}
            onChange={(e) => choose(e.target.value, mergeId)}
          >
            <option value="">Choose…</option>
            {people.map((p) => (
              <option key={p.id} value={p.id}>
                {label(p)}
              </option>
            ))}
          </select>
        </label>
        <label className="text-sm">
          <span className="block font-medium text-slate-700 mb-1">
            Merge this one into it
          </span>
          <select
            className={inputCls}
            value={mergeId}
            onChange={(e) => choose(keepId, e.target.value)}
          >
            <option value="">Choose…</option>
            {people
              .filter((p) => p.id !== keepId)
              .map((p) => (
                <option key={p.id} value={p.id}>
                  {label(p)}
                </option>
              ))}
          </select>
        </label>
      </div>

      {keepId && mergeId && (
        <button
          type="button"
          className="text-xs text-teal-700 underline cursor-pointer"
          onClick={() => choose(mergeId, keepId)}
        >
          Swap — keep {people.find((p) => p.id === mergeId)?.email} instead
        </button>
      )}

      {error && <Notice tone="error">{error}</Notice>}
      {pending && !plan && (
        <p className="text-sm text-slate-500">
          <Spinner className="mr-1" />
          Working out what would move…
        </p>
      )}

      {plan && (
        <>
          <div className="text-sm text-slate-700 bg-slate-50 border border-slate-200 rounded-xl p-3 space-y-1">
            <p>
              <strong>{plan.merge.email}</strong> folds into{" "}
              <strong>{plan.keep.email}</strong>, which stays the primary
              address.
            </p>
            <ul className="list-disc pl-5 text-slate-600">
              <li>
                {plan.bookings} booking{plan.bookings === 1 ? "" : "s"} and{" "}
                {plan.checkins} check-in{plan.checkins === 1 ? "" : "s"} move
                across
              </li>
              {plan.clashingBookings > 0 && (
                <li>
                  {plan.clashingBookings} booking
                  {plan.clashingBookings === 1 ? "" : "s"} would be cancelled —
                  both accounts hold the same day
                </li>
              )}
              {plan.duplicateCheckins > 0 && (
                <li>
                  {plan.duplicateCheckins} duplicate check-in
                  {plan.duplicateCheckins === 1 ? "" : "s"} dropped (same day,
                  both accounts)
                </li>
              )}
              {plan.eventGuests + plan.eventAttendance > 0 && (
                <li>
                  {plan.eventGuests + plan.eventAttendance} event record
                  {plan.eventGuests + plan.eventAttendance === 1 ? "" : "s"} move
                  across
                </li>
              )}
              <li>
                Logging in will work with: {plan.keep.email},{" "}
                {plan.aliases.join(", ")}
              </li>
            </ul>
          </div>

          {confirming ? (
            <div className="flex gap-2 flex-wrap items-center">
              <span className="text-sm text-slate-700">
                This can&apos;t be undone. Go ahead?
              </span>
              <button
                className={btnPrimary}
                disabled={pending}
                onClick={() =>
                  startTransition(async () => {
                    const res = await mergeUsersAction(keepId, mergeId);
                    if (res.error) {
                      setError(res.error);
                      return;
                    }
                    onDone(res.note ?? "Merged.");
                    onClose();
                    router.refresh();
                  })
                }
              >
                {pending ? <Spinner /> : null} Yes, merge them
              </button>
              <button className={btnSecondary} onClick={() => setConfirming(false)}>
                Not yet
              </button>
            </div>
          ) : (
            <button className={btnPrimary} onClick={() => setConfirming(true)}>
              Merge these two
            </button>
          )}
        </>
      )}
    </Card>
  );
}

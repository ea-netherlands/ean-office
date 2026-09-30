"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import {
  sendSurveyBatchAction,
  sendSurveyReminderAction,
  sendSurveyTestAction,
  SurveySendState,
} from "@/actions/survey";
import { btnPrimary, btnSecondary, Notice, Spinner } from "@/components/ui";

/**
 * Sends one batch after another until nobody is left, so a single press
 * reaches everyone. Each batch is its own server call, which keeps every
 * request short enough for the host's time limit.
 */
function useSendAll(sendOne: () => Promise<SurveySendState>) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const [progress, setProgress] = useState<{ sent: number; left?: number; error?: string } | null>(
    null
  );

  function run() {
    start(async () => {
      let sent = 0;
      for (;;) {
        const res = await sendOne();
        if (res.error) {
          setProgress({ sent, error: res.error });
          break;
        }
        sent += res.sent ?? 0;
        setProgress({ sent, left: res.left });
        if (!res.left || !res.sent) break;
      }
      router.refresh();
    });
  }

  const status = progress && (
    <Notice tone={progress.error ? "error" : "ok"}>
      {progress.error
        ? `${progress.sent > 0 ? `Sent ${progress.sent}, then stopped: ` : ""}${progress.error} Press send again to carry on.`
        : pending
          ? `Sent ${progress.sent} so far, ${progress.left} to go. Keep this page open.`
          : `Done. Sent ${progress.sent}.`}
    </Notice>
  );
  return { run, pending, status };
}

function TestButton({ which }: { which: "invite" | "reminder" }) {
  const [test, setTest] = useState<SurveySendState>({});
  const [testing, startTest] = useTransition();
  return (
    <>
      <button
        type="button"
        className={btnSecondary}
        disabled={testing}
        onClick={() => startTest(async () => setTest(await sendSurveyTestAction(which)))}
      >
        {testing && <Spinner />}
        Send me a test
      </button>
      {test.note && <Notice className="w-full">{test.note}</Notice>}
      {test.error && <Notice tone="error" className="w-full">{test.error}</Notice>}
    </>
  );
}

export function SurveySendForm({
  memberCount,
  importedCount,
}: {
  memberCount: number;
  importedCount: number;
}) {
  const [includeImported, setIncludeImported] = useState(false);
  const { run, pending, status } = useSendAll(() => sendSurveyBatchAction(includeImported));
  const total = memberCount + (includeImported ? importedCount : 0);

  return (
    <div className="space-y-3">
      {importedCount > 0 && (
        <label className="flex items-start gap-2 text-sm text-slate-700">
          <input
            type="checkbox"
            className="mt-1"
            checked={includeImported}
            disabled={pending}
            onChange={(e) => setIncludeImported(e.target.checked)}
          />
          <span>
            Also email the {importedCount} imported{" "}
            {importedCount === 1 ? "person" : "people"} who haven&apos;t
            activated their account yet
          </span>
        </label>
      )}
      <div className="flex gap-3 flex-wrap">
        <TestButton which="invite" />
        <button
          type="button"
          className={btnPrimary}
          disabled={pending || total === 0}
          onClick={() => {
            if (confirm(`Send the survey email to ${total} ${total === 1 ? "person" : "people"}?`)) run();
          }}
        >
          {pending && <Spinner />}
          {total === 0 ? "Everyone has been emailed" : `Send to ${total}`}
        </button>
      </div>
      {status}
    </div>
  );
}

export function SurveyReminderForm({ left }: { left: number }) {
  const { run, pending, status } = useSendAll(sendSurveyReminderAction);

  return (
    <div className="space-y-3">
      <div className="flex gap-3 flex-wrap">
        <TestButton which="reminder" />
        <button
          type="button"
          className={btnPrimary}
          disabled={pending || left === 0}
          onClick={() => {
            if (confirm(`Send the reminder to ${left} ${left === 1 ? "person" : "people"}?`)) run();
          }}
        >
          {pending && <Spinner />}
          Send reminder
        </button>
      </div>
      {status}
    </div>
  );
}

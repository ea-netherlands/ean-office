"use client";

import { useActionState, useState, useTransition } from "react";
import { sendSurveyBatchAction, sendSurveyTestAction, SurveySendState } from "@/actions/survey";
import { btnPrimary, btnSecondary, Notice, Spinner } from "@/components/ui";

export function SurveySendForm({ importedCount }: { importedCount: number }) {
  const [state, send, sending] = useActionState<SurveySendState, FormData>(
    sendSurveyBatchAction,
    {}
  );
  const [test, setTest] = useState<SurveySendState>({});
  const [testing, startTest] = useTransition();

  return (
    <form
      action={send}
      onSubmit={(e) => {
        if (!confirm("Send the survey email to everyone who hasn't had it yet?")) e.preventDefault();
      }}
      className="space-y-3"
    >
      {importedCount > 0 && (
        <label className="flex items-start gap-2 text-sm text-slate-700">
          <input type="checkbox" name="includeImported" className="mt-1" />
          <span>
            Also email the {importedCount} imported {importedCount === 1 ? "person" : "people"} who
            haven&apos;t activated their account yet
          </span>
        </label>
      )}
      <div className="flex gap-3 flex-wrap">
        <button
          type="button"
          className={btnSecondary}
          disabled={testing}
          onClick={() => startTest(async () => setTest(await sendSurveyTestAction()))}
        >
          {testing && <Spinner />}
          Send me a test
        </button>
        <button type="submit" className={btnPrimary} disabled={sending}>
          {sending && <Spinner />}
          Send to members
        </button>
      </div>
      {test.note && <Notice>{test.note}</Notice>}
      {test.error && <Notice tone="error">{test.error}</Notice>}
      {state.note && <Notice>{state.note}</Notice>}
      {state.error && <Notice tone="error">{state.error}</Notice>}
    </form>
  );
}

"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import {
  approveRequestAction,
  declineRequestAction,
  askQuestionAction,
} from "@/actions/admin";
import { DECLINE_REASONS } from "@/lib/profile-options";
import { Badge, btnPrimary, btnSecondary, btnDanger, inputCls } from "@/components/ui";
import { formatDayLong } from "@/lib/dates";

export type RequestInfo = {
  id: string;
  status: string;
  name: string;
  email: string;
  descriptor: string | null;
  profileUrl: string | null;
  about: string | null;
  expectedFrequency: string | null;
  accessibilityNotes: string | null;
  requestedDate: string;
  requestedArrival: string;
  createdAt: string;
  stale: boolean;
  declineReason: string | null;
};

export function RequestCard({
  req,
  compact,
}: {
  req: RequestInfo;
  compact?: boolean;
}) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [mode, setMode] = useState<"none" | "ask" | "decline">("none");
  const [question, setQuestion] = useState("");
  const [reason, setReason] = useState<string>(DECLINE_REASONS[0]);
  const [error, setError] = useState<string | null>(null);

  if (compact) {
    return (
      <div className="bg-white border border-slate-200 rounded-xl px-4 py-2.5 flex items-center justify-between text-sm">
        <span>
          <strong>{req.name}</strong> · {formatDayLong(req.requestedDate)}
        </span>
        <Badge
          tone={
            req.status === "approved"
              ? "green"
              : req.status === "declined"
                ? "red"
                : "stone"
          }
        >
          {req.status}
        </Badge>
      </div>
    );
  }

  return (
    <div
      className={`bg-white border rounded-xl p-4 ${
        req.stale ? "border-orange-400 ring-2 ring-orange-200" : "border-slate-200"
      }`}
    >
      <div className="flex items-start justify-between gap-3 flex-wrap">
        <div>
          <h3>
            {req.name}{" "}
            {req.stale && <Badge tone="amber">waiting {"≥"}2 working days</Badge>}
            {req.status === "awaiting_reply" && (
              <Badge tone="stone">waiting on them</Badge>
            )}
          </h3>
          <p className="text-sm text-slate-500">{req.email}</p>
        </div>
        <p className="text-sm font-medium">
          {formatDayLong(req.requestedDate)} · {req.requestedArrival}
        </p>
      </div>

      <dl className="mt-3 grid sm:grid-cols-2 gap-x-6 gap-y-2 text-sm">
        <Field label="Who they are" value={req.descriptor} />
        <Field label="Expected frequency" value={req.expectedFrequency} />
        <Field
          label="Profile"
          value={
            req.profileUrl ? (
              <a
                href={req.profileUrl}
                target="_blank"
                rel="noreferrer"
                className="text-teal-700 underline break-all"
              >
                {req.profileUrl}
              </a>
            ) : null
          }
        />
        <Field label="First-day needs" value={req.accessibilityNotes || "—"} />
        <div className="sm:col-span-2">
          <Field label="What they're working on" value={req.about} />
        </div>
      </dl>

      {mode === "ask" && (
        <div className="mt-3 space-y-2">
          <textarea
            className={inputCls}
            rows={2}
            placeholder="Your question — sent as an email they can reply to"
            value={question}
            onChange={(e) => setQuestion(e.target.value)}
          />
          <div className="flex gap-2">
            <button
              className={btnPrimary}
              disabled={pending || !question.trim()}
              onClick={() =>
                startTransition(async () => {
                  const res = await askQuestionAction(req.id, question);
                  if (res.error) setError(res.error);
                  else router.refresh();
                })
              }
            >
              Send question
            </button>
            <button className={btnSecondary} onClick={() => setMode("none")}>
              Back
            </button>
          </div>
        </div>
      )}

      {mode === "decline" && (
        <div className="mt-3 space-y-2">
          <select
            className={inputCls}
            value={reason}
            onChange={(e) => setReason(e.target.value)}
          >
            {DECLINE_REASONS.map((r) => (
              <option key={r}>{r}</option>
            ))}
          </select>
          <p className="text-xs text-slate-400">
            The reason is stored for EAN&apos;s records and never shown to the
            requester — they get the kind templated email.
          </p>
          <div className="flex gap-2">
            <button
              className={btnDanger}
              disabled={pending}
              onClick={() =>
                startTransition(async () => {
                  const res = await declineRequestAction(req.id, reason);
                  if (res.error) setError(res.error);
                  else router.refresh();
                })
              }
            >
              Confirm decline
            </button>
            <button className={btnSecondary} onClick={() => setMode("none")}>
              Back
            </button>
          </div>
        </div>
      )}

      {mode === "none" && (
        <div className="mt-4 flex gap-2 flex-wrap">
          <button
            className={btnPrimary}
            disabled={pending}
            onClick={() =>
              startTransition(async () => {
                const res = await approveRequestAction(req.id);
                if (res.error) setError(res.error);
                else router.refresh();
              })
            }
          >
            {pending ? "Working…" : "Approve"}
          </button>
          <button className={btnSecondary} onClick={() => setMode("ask")}>
            Ask a question
          </button>
          <button className={btnDanger} onClick={() => setMode("decline")}>
            Decline
          </button>
        </div>
      )}
      {error && <p className="text-sm text-red-700 mt-2">{error}</p>}
    </div>
  );
}

function Field({ label, value }: { label: string; value: React.ReactNode }) {
  return (
    <div>
      <dt className="text-xs text-slate-500">{label}</dt>
      <dd className="text-slate-700">{value || "—"}</dd>
    </div>
  );
}

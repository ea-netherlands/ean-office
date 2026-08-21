"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import {
  approveGuestRequestAction,
  declineGuestRequestAction,
} from "@/actions/guest-request";
import { Badge, btnPrimary, btnSecondary, btnDanger, inputCls } from "@/components/ui";
import { formatDayLong } from "@/lib/dates";
import { SLOT_LABEL, type Slot } from "@/lib/slots";

export type GuestRequestInfo = {
  id: string;
  status: string;
  hostName: string;
  hostEmail: string;
  guestName: string;
  guestEmail: string;
  date: string;
  endDate: string | null;
  slot: Slot;
  visitType: "one_off" | "first_visit";
  reason: string;
  createdAt: string;
  stale: boolean;
  declineReason: string | null;
};

export function GuestRequestCard({
  req,
  compact,
}: {
  req: GuestRequestInfo;
  compact?: boolean;
}) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [mode, setMode] = useState<"none" | "decline">("none");
  const [reason, setReason] = useState("");
  const [error, setError] = useState<string | null>(null);

  const range = req.endDate
    ? `${formatDayLong(req.date)} to ${formatDayLong(req.endDate)}`
    : formatDayLong(req.date);
  const when =
    req.slot === "day" ? range : `${range} (${SLOT_LABEL[req.slot]})`;

  if (compact) {
    return (
      <div className="bg-white border border-slate-200 rounded-xl px-4 py-2 text-sm flex items-center gap-2">
        <span className="font-medium">{req.guestName}</span>
        <span className="text-slate-500">guest of {req.hostName}</span>
        <span className="text-slate-400">·</span>
        <span className="text-slate-500">{when}</span>
        <span className="ml-auto">
          <Badge tone={req.status === "approved" ? "teal" : "stone"}>
            {req.status}
          </Badge>
        </span>
      </div>
    );
  }

  return (
    <div
      className={`bg-white border rounded-xl p-4 ${
        req.stale ? "border-amber-300 bg-amber-50" : "border-slate-200"
      }`}
    >
      <div className="flex items-start gap-2 mb-2">
        <div>
          <p className="font-medium">
            {req.guestName}{" "}
            <span className="font-normal text-slate-500">
              — guest of {req.hostName}
            </span>
          </p>
          <p className="text-sm text-slate-500">{req.guestEmail}</p>
        </div>
        <span className="ml-auto flex gap-1.5">
          <Badge tone={req.visitType === "first_visit" ? "teal" : "stone"}>
            {req.visitType === "first_visit" ? "first visit" : "one-off"}
          </Badge>
          {req.stale && <Badge tone="amber">waiting</Badge>}
        </span>
      </div>

      <p className="text-sm mb-2">
        <strong>{when}</strong>
      </p>

      <blockquote className="text-sm text-slate-600 border-l-2 border-slate-200 pl-3 mb-3">
        {req.reason}
      </blockquote>

      {req.visitType === "first_visit" && (
        <p className="text-sm text-slate-500 mb-3">
          Approving makes this their trial day — they&apos;ll need admitting or
          declining afterwards, same as a /join request.
        </p>
      )}

      {error && <p className="text-sm text-red-700 mb-2">{error}</p>}

      {mode === "decline" ? (
        <div className="space-y-2">
          <input
            className={inputCls}
            placeholder="Why not? (optional — the host sees this)"
            value={reason}
            onChange={(e) => setReason(e.target.value)}
          />
          <div className="flex gap-2">
            <button
              className={btnDanger}
              disabled={pending}
              onClick={() =>
                startTransition(async () => {
                  const res = await declineGuestRequestAction(req.id, reason);
                  if (res.error) setError(res.error);
                  else router.refresh();
                })
              }
            >
              Confirm decline
            </button>
            <button className={btnSecondary} onClick={() => setMode("none")}>
              Cancel
            </button>
          </div>
        </div>
      ) : (
        <div className="flex gap-2">
          <button
            className={btnPrimary}
            disabled={pending}
            onClick={() =>
              startTransition(async () => {
                const res = await approveGuestRequestAction(req.id);
                if (res.error) setError(res.error);
                else router.refresh();
              })
            }
          >
            {pending ? "Booking…" : "Approve & book a desk"}
          </button>
          <button
            className={btnSecondary}
            disabled={pending}
            onClick={() => setMode("decline")}
          >
            Decline
          </button>
        </div>
      )}
    </div>
  );
}

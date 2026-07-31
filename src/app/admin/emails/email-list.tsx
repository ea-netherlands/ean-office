"use client";

import { useState } from "react";
import { Badge, Card } from "@/components/ui";

export function EmailList({
  rows,
}: {
  rows: {
    id: string;
    to: string;
    subject: string;
    kind: string;
    body: string;
    sentAt: string;
    delivered: boolean;
  }[];
}) {
  const [open, setOpen] = useState<string | null>(null);
  if (rows.length === 0) {
    return <Card><p className="text-sm text-slate-500">No emails yet.</p></Card>;
  }
  return (
    <Card>
      <ul className="divide-y divide-slate-100">
        {rows.map((r) => (
          <li key={r.id} className="py-2.5">
            <button
              className="w-full text-left flex items-center justify-between gap-2 cursor-pointer"
              onClick={() => setOpen(open === r.id ? null : r.id)}
            >
              <span className="text-sm">
                <span className="font-medium">{r.subject}</span>{" "}
                <span className="text-slate-400">→ {r.to}</span>
              </span>
              <span className="flex items-center gap-2 shrink-0">
                <Badge>{r.kind}</Badge>
                <span className="text-xs text-slate-400">{r.sentAt}</span>
              </span>
            </button>
            {open === r.id && (
              <div
                className="mt-3 border border-slate-200 rounded-xl p-4 text-sm bg-slate-50 [&_a]:text-teal-700 [&_a]:underline"
                dangerouslySetInnerHTML={{ __html: r.body }}
              />
            )}
          </li>
        ))}
      </ul>
    </Card>
  );
}

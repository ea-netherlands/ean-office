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
            {open === r.id && <EmailBody html={r.body} />}
          </li>
        ))}
      </ul>
    </Card>
  );
}

// The web addresses an email links to, so they can be offered as ordinary
// links outside the locked frame (in demo mode this is how you follow a
// login link).
function linksIn(html: string): string[] {
  const found = new Set<string>();
  for (const m of html.matchAll(/href="(https?:\/\/[^"<>\s]+)"/g)) {
    found.add(m[1].replace(/&amp;/g, "&"));
  }
  return [...found];
}

// Logged emails quote text typed into public forms (a name on /join, an RSVP
// note), so their HTML is never trusted. The empty `sandbox` means nothing in
// the frame can run a script, submit a form, open a window or navigate.
function EmailBody({ html }: { html: string }) {
  const links = linksIn(html);
  return (
    <div className="mt-3">
      <iframe
        title="Email body"
        sandbox=""
        srcDoc={`<!doctype html><meta charset="utf-8"><body style="font-family:-apple-system,'Segoe UI',sans-serif;font-size:14px;line-height:1.55;color:#1a1a1a;margin:16px;">${html}</body>`}
        className="w-full h-72 border border-slate-200 rounded-xl bg-slate-50"
      />
      {links.length > 0 && (
        <ul className="mt-2 space-y-1 text-xs">
          {links.map((href) => (
            <li key={href}>
              <a
                href={href}
                target="_blank"
                rel="noopener noreferrer"
                className="text-teal-700 underline break-all"
              >
                {href}
              </a>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

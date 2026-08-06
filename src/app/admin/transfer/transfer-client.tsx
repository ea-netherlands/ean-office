"use client";

import { useState } from "react";
import {
  previewTransferAction,
  commitTransferAction,
  type TransferResult,
  type TransferRow,
  type TransferState,
} from "@/actions/transfer";
import { Card, Badge, btnPrimary, btnSecondary } from "@/components/ui";
import { asSlot, SLOT_LABEL } from "@/lib/slots";

const TONE: Record<string, "green" | "amber" | "stone" | "red" | "teal"> = {
  "will book": "green",
  booked: "green",
  "already there": "stone",
  "needs review": "amber",
  "no email given": "amber",
  "unknown email": "red",
  failed: "red",
  past: "stone",
};

/** Same shape the extract script writes. */
function parseCsv(text: string): { rows: TransferRow[]; error?: string } {
  if (text.charCodeAt(0) === 0xfeff) text = text.slice(1);
  const lines: string[][] = [];
  let row: string[] = [];
  let field = "";
  let quoted = false;
  for (let i = 0; i < text.length; i++) {
    const c = text[i];
    if (quoted) {
      if (c === '"') {
        if (text[i + 1] === '"') {
          field += '"';
          i++;
        } else quoted = false;
      } else field += c;
    } else if (c === '"') quoted = true;
    else if (c === ",") {
      row.push(field);
      field = "";
    } else if (c === "\n" || c === "\r") {
      if (c === "\r" && text[i + 1] === "\n") i++;
      row.push(field);
      field = "";
      if (row.some((x) => x.trim() !== "")) lines.push(row);
      row = [];
    } else field += c;
  }
  if (field !== "" || row.length) {
    row.push(field);
    if (row.some((x) => x.trim() !== "")) lines.push(row);
  }
  if (lines.length < 2) return { rows: [], error: "That file has no rows in it." };

  const header = lines[0].map((h) => h.trim().toLowerCase());
  const at = (name: string) => header.indexOf(name);
  const [d, n, e] = [at("date"), at("name"), at("email")];
  if (d < 0 || n < 0 || e < 0) {
    return {
      rows: [],
      error: "Expected date, name and email columns — is this the bookings file?",
    };
  }
  const s = at("slot");
  const st = at("seat_type");
  const a = at("action");
  const note = at("note");

  return {
    rows: lines.slice(1).map((r) => ({
      date: (r[d] ?? "").trim(),
      name: (r[n] ?? "").trim(),
      email: (r[e] ?? "").trim(),
      slot: asSlot((r[s] ?? "day").trim()),
      seatType: (r[st] ?? "desk").trim() === "flex" ? ("flex" as const) : ("desk" as const),
      action: (r[a] ?? "transfer").trim() || "transfer",
      note: note >= 0 ? (r[note] ?? "").trim() : "",
    })),
  };
}

export function TransferClient() {
  const [rows, setRows] = useState<TransferRow[]>([]);
  const [fileName, setFileName] = useState("");
  const [includeReview, setIncludeReview] = useState(false);
  const [state, setState] = useState<TransferState | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleFile(file: File) {
    setError(null);
    setState(null);
    const { rows: parsed, error: err } = parseCsv(await file.text());
    if (err) {
      setError(err);
      return;
    }
    setFileName(file.name);
    setRows(parsed);
  }

  async function run(commit: boolean) {
    setBusy(true);
    setError(null);
    try {
      const res = commit
        ? await commitTransferAction(rows, includeReview)
        : await previewTransferAction(rows, includeReview);
      if (res.error) setError(res.error);
      else setState(res);
    } finally {
      setBusy(false);
    }
  }

  const counts = state?.counts ?? {};
  const willBook = (counts["will book"] ?? 0) + (counts["booked"] ?? 0);
  const problems = (state?.results ?? []).filter((r) =>
    ["unknown email", "failed"].includes(r.outcome)
  );

  return (
    <div className="space-y-4">
      <Card>
        <p className="text-sm text-slate-600 mb-3">
          Upload the bookings file (<code>future-bookings.csv</code>). Nothing is
          written until you press the second button — the first one just shows
          you what would happen. Running it twice is safe: anything already in
          the app is left alone.
        </p>
        <input
          type="file"
          accept=".csv,text/csv,text/plain"
          onChange={(e) => {
            const f = e.target.files?.[0];
            if (f) handleFile(f);
          }}
          className="block w-full text-sm file:mr-3 file:rounded-lg file:border file:border-slate-300 file:bg-white file:px-3 file:py-1.5 file:text-sm file:cursor-pointer"
        />
        {fileName && (
          <p className="text-sm text-slate-500 mt-2">
            {fileName} — {rows.length} row{rows.length === 1 ? "" : "s"}
          </p>
        )}
        {rows.length > 0 && (
          <>
            <label className="flex items-start gap-2 text-sm text-slate-600 mt-3">
              <input
                type="checkbox"
                checked={includeReview}
                onChange={(e) => {
                  setIncludeReview(e.target.checked);
                  setState(null);
                }}
                className="mt-0.5"
              />
              <span>
                Also transfer the rows marked &ldquo;review&rdquo; — the ones
                pencilled in as &ldquo;maybe&rdquo; in the old sheet.
              </span>
            </label>
            <div className="flex flex-wrap gap-2 mt-3">
              <button
                className={btnSecondary}
                disabled={busy}
                onClick={() => run(false)}
              >
                {busy ? "Checking…" : "Show me what would happen"}
              </button>
              {state && !state.committed && willBook > 0 && (
                <button className={btnPrimary} disabled={busy} onClick={() => run(true)}>
                  {busy ? "Transferring…" : `Yes — transfer ${willBook} booking${willBook === 1 ? "" : "s"}`}
                </button>
              )}
            </div>
          </>
        )}
        {error && <p className="text-sm text-red-700 mt-3">{error}</p>}
      </Card>

      {state?.results && (
        <Card>
          <h2 className="font-semibold mb-1">
            {state.committed ? "Done" : "Dry run — nothing written yet"}
          </h2>
          <p className="text-sm text-slate-500 mb-3">
            {state.committed
              ? "These bookings are now in the app."
              : "This is what pressing the transfer button would do."}
          </p>
          <div className="flex flex-wrap gap-2 mb-4">
            {Object.entries(counts)
              .sort((a, b) => b[1] - a[1])
              .map(([outcome, n]) => (
                <Badge key={outcome} tone={TONE[outcome] ?? "stone"}>
                  {n} {outcome}
                </Badge>
              ))}
          </div>

          {problems.length > 0 && (
            <>
              <h3 className="font-medium text-sm mb-2 text-slate-600">
                Couldn&apos;t be transferred
              </h3>
              <ul className="text-sm divide-y divide-slate-100 mb-4">
                {problems.map((p, i) => (
                  <li key={i} className="py-1.5">
                    {p.row.date} · <strong>{p.row.name}</strong> — {p.outcome}
                    {p.detail ? ` (${p.detail})` : ""}
                  </li>
                ))}
              </ul>
            </>
          )}

          <details>
            <summary className="text-sm text-teal-700 font-medium cursor-pointer">
              Every row
            </summary>
            <ul className="text-sm divide-y divide-slate-100 mt-2">
              {state.results.map((r, i) => (
                <Row key={i} r={r} />
              ))}
            </ul>
          </details>
        </Card>
      )}
    </div>
  );
}

function Row({ r }: { r: TransferResult }) {
  return (
    <li className="py-1.5 flex items-center justify-between gap-3">
      <span>
        {r.row.date} · <strong>{r.row.name}</strong>
        {r.row.slot !== "day" && (
          <span className="text-slate-400"> · {SLOT_LABEL[r.row.slot]}</span>
        )}
        {r.row.seatType === "flex" && <span className="text-slate-400"> · lunch table</span>}
      </span>
      <Badge tone={TONE[r.outcome] ?? "stone"}>
        {r.outcome}
        {r.detail ? ` — ${r.detail}` : ""}
      </Badge>
    </li>
  );
}

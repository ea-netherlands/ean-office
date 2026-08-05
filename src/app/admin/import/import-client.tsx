"use client";

import { useMemo, useState } from "react";
import {
  previewImportAction,
  commitImportAction,
  undoImportAction,
  ImportRow,
  ImportPreviewRow,
  ImportOutcome,
  CommitResult,
} from "@/actions/import";
import { Card, Badge, btnPrimary, btnSecondary, inputCls, labelCls } from "@/components/ui";

function parseCSV(text: string): { headers: string[]; rows: string[][] } {
  if (text.charCodeAt(0) === 0xfeff) text = text.slice(1);
  const firstLine = text.split(/\r?\n/, 1)[0] ?? "";
  const commaCount = (firstLine.match(/,/g) || []).length;
  const semiCount = (firstLine.match(/;/g) || []).length;
  const delim = semiCount > commaCount ? ";" : ",";

  const rows: string[][] = [];
  let row: string[] = [];
  let field = "";
  let inQuotes = false;
  for (let i = 0; i < text.length; i++) {
    const c = text[i];
    if (inQuotes) {
      if (c === '"') {
        if (text[i + 1] === '"') {
          field += '"';
          i++;
        } else inQuotes = false;
      } else field += c;
    } else if (c === '"') {
      inQuotes = true;
    } else if (c === delim) {
      row.push(field);
      field = "";
    } else if (c === "\n" || c === "\r") {
      if (c === "\r" && text[i + 1] === "\n") i++;
      row.push(field);
      field = "";
      if (row.length > 1 || row[0] !== "") rows.push(row);
      row = [];
    } else {
      field += c;
    }
  }
  if (field !== "" || row.length > 0) {
    row.push(field);
    rows.push(row);
  }

  const headers = (rows[0] ?? []).map((h) => h.trim());
  const dataRows = rows
    .slice(1)
    .filter((r) => r.some((c) => c.trim() !== ""));
  return { headers, rows: dataRows };
}

function guessColumn(headers: string[], keywords: string[]): number {
  const lower = headers.map((h) => h.toLowerCase());
  for (const kw of keywords) {
    const i = lower.findIndex((h) => h.includes(kw));
    if (i >= 0) return i;
  }
  return -1;
}

const OUTCOME_LABEL: Record<ImportOutcome, string> = {
  new: "New",
  duplicate_in_file: "Duplicate in this file",
  already_in_system: "Already in the system",
  invalid_email: "Invalid email",
  missing_name: "Missing name",
};
const OUTCOME_TONE: Record<ImportOutcome, "green" | "amber" | "stone" | "red"> = {
  new: "green",
  duplicate_in_file: "amber",
  already_in_system: "stone",
  invalid_email: "red",
  missing_name: "red",
};

export function ImportClient() {
  const [fileName, setFileName] = useState("");
  const [headers, setHeaders] = useState<string[]>([]);
  const [dataRows, setDataRows] = useState<string[][]>([]);
  const [nameCol, setNameCol] = useState(-1);
  const [emailCol, setEmailCol] = useState(-1);
  const [dateCol, setDateCol] = useState(-1);
  const [preview, setPreview] = useState<ImportPreviewRow[] | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<CommitResult | null>(null);

  const rowsFromMapping = useMemo((): ImportRow[] => {
    if (nameCol < 0 || emailCol < 0) return [];
    return dataRows.map((r) => ({
      name: r[nameCol] ?? "",
      email: r[emailCol] ?? "",
      joinedDate: dateCol >= 0 ? toIsoDate(r[dateCol]) : undefined,
    }));
  }, [dataRows, nameCol, emailCol, dateCol]);

  async function handleFile(file: File) {
    setError(null);
    setResult(null);
    setPreview(null);
    const text = await file.text();
    const { headers: h, rows } = parseCSV(text);
    if (h.length === 0) {
      setError("Couldn't find a header row in that file.");
      return;
    }
    setFileName(file.name);
    setHeaders(h);
    setDataRows(rows);
    setNameCol(guessColumn(h, ["name"]));
    setEmailCol(guessColumn(h, ["email", "e-mail"]));
    setDateCol(guessColumn(h, ["joined", "created", "date"]));
  }

  async function runPreview() {
    setError(null);
    setResult(null);
    setBusy(true);
    try {
      const p = await previewImportAction(rowsFromMapping);
      setPreview(p);
    } catch {
      setError("Couldn't preview that file — check the column mapping.");
    } finally {
      setBusy(false);
    }
  }

  async function runCommit() {
    setBusy(true);
    setError(null);
    try {
      const res = await commitImportAction(rowsFromMapping);
      setResult(res);
      setPreview(null);
    } catch {
      setError("Import failed partway through — check /admin/members before retrying.");
    } finally {
      setBusy(false);
    }
  }

  async function runUndo(batchId: string) {
    setBusy(true);
    try {
      const res = await undoImportAction(batchId);
      setResult(null);
      setError(null);
      alert(`Removed ${res.deleted} unclaimed row(s) from that batch.`);
    } finally {
      setBusy(false);
    }
  }

  const counts = useMemo(() => {
    const c: Record<ImportOutcome, number> = {
      new: 0,
      duplicate_in_file: 0,
      already_in_system: 0,
      invalid_email: 0,
      missing_name: 0,
    };
    for (const r of preview ?? []) c[r.outcome]++;
    return c;
  }, [preview]);

  return (
    <div className="space-y-4">
      <Card className="space-y-3">
        <div>
          <label className={labelCls}>CSV file</label>
          <input
            type="file"
            accept=".csv,.tsv,text/csv,text/plain"
            onChange={(e) => {
              const f = e.target.files?.[0];
              if (f) handleFile(f);
            }}
            className="text-sm"
          />
          {fileName && (
            <p className="text-xs text-slate-400 mt-1">
              {fileName} — {dataRows.length} data row{dataRows.length === 1 ? "" : "s"}
            </p>
          )}
        </div>

        {headers.length > 0 && (
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
            <ColumnPicker label="Name column *" headers={headers} value={nameCol} onChange={setNameCol} />
            <ColumnPicker label="Email column *" headers={headers} value={emailCol} onChange={setEmailCol} />
            <ColumnPicker
              label="Join date column (optional)"
              headers={headers}
              value={dateCol}
              onChange={setDateCol}
              allowNone
            />
          </div>
        )}

        {headers.length > 0 && (
          <button
            className={btnSecondary}
            disabled={busy || nameCol < 0 || emailCol < 0}
            onClick={runPreview}
          >
            {busy ? "Checking…" : "Preview import"}
          </button>
        )}
        {error && (
          <p className="text-sm text-red-700 bg-red-50 border border-red-200 rounded-xl px-3 py-2">
            {error}
          </p>
        )}
      </Card>

      {preview && (
        <Card className="space-y-3">
          <div className="flex gap-2 flex-wrap">
            {(Object.keys(counts) as ImportOutcome[]).map(
              (k) =>
                counts[k] > 0 && (
                  <Badge key={k} tone={OUTCOME_TONE[k]}>
                    {counts[k]} {OUTCOME_LABEL[k].toLowerCase()}
                  </Badge>
                )
            )}
          </div>

          <div className="max-h-80 overflow-y-auto border border-slate-100 rounded-lg">
            <table className="w-full text-xs">
              <thead className="bg-slate-50 sticky top-0">
                <tr>
                  <th className="text-left px-2 py-1.5">Name</th>
                  <th className="text-left px-2 py-1.5">Email</th>
                  <th className="text-left px-2 py-1.5">Outcome</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-50">
                {preview.map((r, i) => (
                  <tr key={i}>
                    <td className="px-2 py-1">{r.name || <em className="text-slate-300">blank</em>}</td>
                    <td className="px-2 py-1 text-slate-500">{r.email}</td>
                    <td className="px-2 py-1">
                      <Badge tone={OUTCOME_TONE[r.outcome]}>{OUTCOME_LABEL[r.outcome]}</Badge>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          <button className={btnPrimary} disabled={busy || counts.new === 0} onClick={runCommit}>
            {busy ? "Importing…" : `Import ${counts.new} new people`}
          </button>
        </Card>
      )}

      {result && (
        <Card className="border-teal-300 bg-teal-50">
          <p className="text-sm">
            Imported <strong>{result.inserted}</strong> new people as dormant
            accounts. They&apos;ll show up on{" "}
            <a href="/admin/members" className="text-teal-700 underline">
              Members
            </a>{" "}
            and become real, counted members once they log in and claim their
            account.
          </p>
          <button
            className={`${btnSecondary} mt-3`}
            disabled={busy}
            onClick={() => runUndo(result.batchId)}
          >
            Undo this import (only removes rows nobody has claimed yet)
          </button>
        </Card>
      )}
    </div>
  );
}

function ColumnPicker({
  label,
  headers,
  value,
  onChange,
  allowNone,
}: {
  label: string;
  headers: string[];
  value: number;
  onChange: (v: number) => void;
  allowNone?: boolean;
}) {
  return (
    <div>
      <label className={labelCls}>{label}</label>
      <select
        className={inputCls}
        value={value}
        onChange={(e) => onChange(Number(e.target.value))}
      >
        {allowNone && <option value={-1}>None</option>}
        {!allowNone && value < 0 && (
          <option value={-1} disabled>
            Choose…
          </option>
        )}
        {headers.map((h, i) => (
          <option key={i} value={i}>
            {h || `Column ${i + 1}`}
          </option>
        ))}
      </select>
    </div>
  );
}

/** Best-effort parse of whatever date format the spreadsheet used, e.g. "13/1/2026" or "3 April 2023 14:09". */
function toIsoDate(raw: string | undefined): string | undefined {
  if (!raw) return undefined;
  const s = raw.trim();
  if (!s) return undefined;
  const dmy = s.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})$/);
  if (dmy) {
    const [, d, m, y] = dmy;
    return `${y}-${m.padStart(2, "0")}-${d.padStart(2, "0")}`;
  }
  const parsed = new Date(s);
  if (!isNaN(parsed.getTime())) return parsed.toISOString().slice(0, 10);
  return undefined;
}

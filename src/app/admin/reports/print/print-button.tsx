"use client";

import { btnPrimary } from "@/components/ui";

export function PrintButton() {
  return (
    <div className="no-print mb-6 flex gap-3 items-center">
      <button className={btnPrimary} onClick={() => window.print()}>
        Print / save as PDF
      </button>
      <a href="/admin/reports" className="text-sm text-teal-700">
        ← back to reports
      </a>
    </div>
  );
}

"use client";

import { useRouter } from "next/navigation";

export function RangePicker({ from, to }: { from: string; to: string }) {
  const router = useRouter();
  function set(f: string, t: string) {
    router.push(`/admin/reports?from=${f}&to=${t}`);
  }
  const today = new Date().toISOString().slice(0, 10);
  function monthsAgo(n: number): string {
    const d = new Date();
    d.setMonth(d.getMonth() - n);
    return d.toISOString().slice(0, 10);
  }
  return (
    <div className="no-print flex items-center gap-2 flex-wrap mb-4 text-sm">
      <input
        type="date"
        value={from}
        onChange={(e) => set(e.target.value, to)}
        className="rounded-lg border border-slate-300 px-2 py-1.5"
      />
      <span className="text-slate-400">→</span>
      <input
        type="date"
        value={to}
        onChange={(e) => set(from, e.target.value)}
        className="rounded-lg border border-slate-300 px-2 py-1.5"
      />
      <span className="flex gap-1 ml-2">
        {[3, 6, 12].map((n) => (
          <button
            key={n}
            onClick={() => set(monthsAgo(n), today)}
            className="px-2.5 py-1 rounded-lg border border-slate-200 hover:bg-slate-50 cursor-pointer"
          >
            {n}m
          </button>
        ))}
      </span>
    </div>
  );
}

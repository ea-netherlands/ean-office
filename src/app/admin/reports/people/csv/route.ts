import { NextRequest } from "next/server";
import { getCurrentUser } from "@/lib/auth";
import { ensureMigrated } from "@/db";
import { addDays, todayAms } from "@/lib/dates";
import { getUsage, parseBasis } from "@/lib/usage";

// One row per person, one column per week, so the patterns can be worked on
// in a spreadsheet.
//
// Route handlers bypass the admin layout — guard explicitly.
export async function GET(request: NextRequest) {
  await ensureMigrated();
  const user = await getCurrentUser();
  if (!user || user.role !== "admin") {
    return new Response("Forbidden", { status: 403 });
  }

  const sp = request.nextUrl.searchParams;
  const today = todayAms();
  const from = /^\d{4}-\d{2}-\d{2}$/.test(sp.get("from") || "")
    ? sp.get("from")!
    : addDays(today, -182);
  const to = /^\d{4}-\d{2}-\d{2}$/.test(sp.get("to") || "") ? sp.get("to")! : today;
  const basis = parseBasis(sp.get("basis"));
  const r = await getUsage(from, to, basis);

  const esc = (v: string) => (/[",\n]/.test(v) ? `"${v.replace(/"/g, '""')}"` : v);
  const lines: string[] = [];
  lines.push(
    `# EA Netherlands office — visits per person, ${from} to ${r.pastTo}. A visit is ${
      basis === "attended" ? "a check-in" : "a booking not marked as a no-show"
    }; per_week divides by ${r.workingDays} working days / 5. Week columns start on Monday.`
  );
  lines.push(
    [
      "name",
      "email",
      "status",
      "role",
      "cause_area",
      "visits",
      "half_days",
      "per_week",
      "per_month",
      "active_weeks",
      "per_active_week",
      "busiest_week",
      "first_visit",
      "last_visit",
      ...r.weekStarts.map((w) => `week_${w}`),
    ].join(",")
  );
  for (const p of r.people) {
    lines.push(
      [
        p.name,
        p.email,
        p.status,
        p.role,
        p.causeArea ?? "",
        p.visits,
        p.halfDays,
        p.perWeek.toFixed(2),
        p.perMonth.toFixed(2),
        p.activeWeeks,
        p.perActiveWeek.toFixed(2),
        p.busiestWeek,
        p.firstVisit,
        p.lastVisit,
        ...r.weekStarts.map((w) => p.byWeek.get(w) ?? 0),
      ]
        .map((v) => esc(String(v)))
        .join(",")
    );
  }

  return new Response(lines.join("\n"), {
    headers: {
      "Content-Type": "text/csv; charset=utf-8",
      "Content-Disposition": `attachment; filename="ean-office-per-person-${from}-to-${to}.csv"`,
    },
  });
}

import { NextRequest } from "next/server";
import { getCurrentUser } from "@/lib/auth";
import { ensureMigrated } from "@/db";
import { addDays, todayAms } from "@/lib/dates";
import { DemographicRow, getReport, methodologyNote } from "@/lib/reports";

// Who used the office, as the funder report needs it: the self-reported
// profile answers, counted across everyone who checked in during the range.
//
// Aggregate only, never one row per person. Members gave these answers on
// the promise that we'd report them in aggregate (/join), so this is the
// file that can go into a funder report as it stands.
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
  const r = await getReport(from, to);

  const esc = (v: string) => (/[",\n]/.test(v) ? `"${v.replace(/"/g, '""')}"` : v);
  const pct = (v: number) => (v * 100).toFixed(1);

  const lines: string[] = [];
  lines.push(`# EA Netherlands office — profile of the people who used it, ${from} to ${to}`);
  lines.push(
    `# ${r.uniqueVisitors} people checked in, over ${r.visitsAttended} desk-days. Each figure is given as a share of those people and a share of those desk-days (weighted by how often each person came).`
  );
  lines.push(`# ${methodologyNote(r)}`);
  lines.push(
    `# "funders" rows overlap: someone can name several funders, so they don't add up to 100%.`
  );
  lines.push("question,answer,people,pct_of_people,desk_days,pct_of_desk_days");

  const section = (question: string, rows: DemographicRow[]) => {
    for (const row of rows) {
      lines.push(
        [question, row.label, row.people, pct(row.peoplePct), row.deskDays, pct(row.deskDaysPct)]
          .map((v) => esc(String(v)))
          .join(",")
      );
    }
  };
  const headline = (answer: string, s: { people: number; deskDays: number }) =>
    lines.push(
      ["headline", answer, "", pct(s.people), "", pct(s.deskDays)].map((v) => esc(v)).join(",")
    );

  headline("Funded (directly or via employer) by an EA funder", r.pctEaFunded);
  headline("Working on existential risk reduction", r.pctXRisk);
  headline("Working on EA-aligned cause areas", r.pctEaAligned);
  headline("Profile filled in within the last 12 months", {
    people: r.profileCoveragePeople,
    deskDays: r.profileCoverageDeskDays,
  });
  section("ea_funding", r.funding);
  section("funders", r.funders);
  section("cause_area", r.causeAreas);
  section("role", r.roleCategories);
  section("experience", r.experience);
  section("gender", r.gender);

  return new Response(lines.join("\n"), {
    headers: {
      "Content-Type": "text/csv; charset=utf-8",
      "Content-Disposition": `attachment; filename="ean-office-profile-${from}-to-${to}.csv"`,
    },
  });
}

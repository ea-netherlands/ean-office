import { NextRequest } from "next/server";
import { getCurrentUser } from "@/lib/auth";
import { db, bookings, checkins, ensureMigrated } from "@/db";
import { and, gte, lte, inArray } from "drizzle-orm";
import { addDays, isWorkingDay, todayAms } from "@/lib/dates";
import { DemographicRow, getReport, methodologyNote } from "@/lib/reports";
import { getSettings } from "@/lib/settings";

// The funder report as a file: who used the office, then how busy it was
// each day. Everything in it is a total, never one row per person — members
// gave their profile answers on the promise that we'd report them only in
// aggregate (/join), so this file can go into a funder report as it stands.
//
// Two tables in one file, one after the other, each under its own header.
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

  const cfg = await getSettings();
  const r = await getReport(from, to);

  const esc = (v: string) => (/[",\n]/.test(v) ? `"${v.replace(/"/g, '""')}"` : v);
  const pct = (v: number) => (v * 100).toFixed(1);
  const row = (cells: (string | number)[]) => cells.map((v) => esc(String(v))).join(",");

  const lines: string[] = [];
  lines.push(`# EA Netherlands office — funder report data, ${from} to ${to}`);
  lines.push(`# ${methodologyNote(r)}`);
  lines.push("#");

  // Part 1 — who used the office
  lines.push(
    `# Part 1: who used the office. ${r.uniqueVisitors} people checked in, over ${r.visitsAttended} desk-days. Each answer is given as a share of those people and a share of those desk-days (weighted by how often each person came). Answers are from members' own profiles, as they stand today.`
  );
  lines.push(
    `# The "funders" rows overlap: someone can name several funders, so they don't add up to 100%.`
  );
  lines.push("question,answer,people,pct_of_people,desk_days,pct_of_desk_days");
  const headline = (answer: string, s: { people: number; deskDays: number }) =>
    lines.push(row(["headline", answer, "", pct(s.people), "", pct(s.deskDays)]));
  const section = (question: string, rows: DemographicRow[]) => {
    for (const d of rows) {
      lines.push(
        row([question, d.label, d.people, pct(d.peoplePct), d.deskDays, pct(d.deskDaysPct)])
      );
    }
  };
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

  // Part 2 — how busy it was, day by day
  const bookingRows = await db
    .select()
    .from(bookings)
    .where(
      and(gte(bookings.date, from), lte(bookings.date, to), inArray(bookings.status, ["booked", "waitlisted"]))
    );
  const checkinRows = await db
    .select()
    .from(checkins)
    .where(and(gte(checkins.date, from), lte(checkins.date, to)));

  const checkinSet = new Map<string, { total: number; retro: number }>();
  for (const c of checkinRows) {
    const cur = checkinSet.get(c.date) ?? { total: 0, retro: 0 };
    cur.total++;
    if (c.isRetroactive) cur.retro++;
    checkinSet.set(c.date, cur);
  }
  const attendedByUserDate = new Set(checkinRows.map((c) => `${c.userId}:${c.date}`));

  lines.push("");
  lines.push(
    `# Part 2: how busy the office was, one row per day. Occupancy is a percentage of the ${cfg.desk_count} desks; flex seats are counted separately.`
  );
  lines.push(
    "date,working_day,desks_booked,desks_attended,flex_booked,flex_attended,walk_ins,waitlisted,checkins,retro_checkins,booked_occupancy_pct,attended_occupancy_pct"
  );

  for (let d = from; d <= to; d = addDays(d, 1)) {
    const dayBookings = bookingRows.filter((b) => b.date === d && b.status === "booked");
    const desks = dayBookings.filter((b) => b.seatType === "desk");
    const flex = dayBookings.filter((b) => b.seatType === "flex");
    const desksAttended = desks.filter((b) => attendedByUserDate.has(`${b.userId}:${b.date}`));
    const flexAttended = flex.filter((b) => attendedByUserDate.has(`${b.userId}:${b.date}`));
    const walkins = dayBookings.filter((b) => b.source === "walkin");
    const waitlisted = bookingRows.filter((b) => b.date === d && b.status === "waitlisted");
    const ci = checkinSet.get(d) ?? { total: 0, retro: 0 };
    lines.push(
      [
        d,
        isWorkingDay(d) ? "1" : "0",
        desks.length,
        desksAttended.length,
        flex.length,
        flexAttended.length,
        walkins.length,
        waitlisted.length,
        ci.total,
        ci.retro,
        ((desks.length / cfg.desk_count) * 100).toFixed(1),
        ((desksAttended.length / cfg.desk_count) * 100).toFixed(1),
      ].join(",")
    );
  }

  return new Response(lines.join("\n"), {
    headers: {
      "Content-Type": "text/csv; charset=utf-8",
      "Content-Disposition": `attachment; filename="ean-office-funder-report-${from}-to-${to}.csv"`,
    },
  });
}

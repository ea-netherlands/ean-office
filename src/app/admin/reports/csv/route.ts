import { NextRequest } from "next/server";
import { getCurrentUser } from "@/lib/auth";
import { db, bookings, checkins, ensureMigrated } from "@/db";
import { and, gte, lte, inArray } from "drizzle-orm";
import { addDays, isWorkingDay, todayAms } from "@/lib/dates";
import { getReport, methodologyNote } from "@/lib/reports";
import { getSettings } from "@/lib/settings";

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
  const report = await getReport(from, to);

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

  const lines: string[] = [];
  lines.push(`# EA Netherlands office — underlying daily data, ${from} to ${to}`);
  lines.push(`# ${methodologyNote(report)}`);
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
      "Content-Disposition": `attachment; filename="ean-office-${from}-to-${to}.csv"`,
    },
  });
}

import { NextRequest } from "next/server";
import { getCurrentUser } from "@/lib/auth";
import { db, bookings, checkins, users, ensureMigrated } from "@/db";
import { and, gte, lte } from "drizzle-orm";
import { addDays, amsDate, isoWeekday, todayAms, WEEKDAY_NAMES } from "@/lib/dates";
import { personRef } from "@/lib/tokens";
import { getSettings } from "@/lib/settings";

// Every booking and check-in in the range, one row each, with the person's
// profile alongside — the file to hand to a spreadsheet or an LLM when the
// canned reports don't ask the right question.
//
// It leaves the app, so people are codes rather than names unless the admin
// asks for names. Gender and email are never included: neither is needed to
// study usage, and both are more than a pasted file should carry.
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
  const withNames = sp.get("names") === "1";
  const cfg = await getSettings();

  const bookingRows = await db
    .select()
    .from(bookings)
    .where(and(gte(bookings.date, from), lte(bookings.date, to)));
  const checkinRows = await db
    .select()
    .from(checkins)
    .where(and(gte(checkins.date, from), lte(checkins.date, to)));
  const allUsers = await db.select().from(users);
  const userById = new Map(allUsers.map((u) => [u.id, u]));

  const checkinByUserDate = new Map(checkinRows.map((c) => [`${c.userId}:${c.date}`, c]));
  const bookedUserDates = new Set(
    bookingRows.filter((b) => b.status === "booked").map((b) => `${b.userId}:${b.date}`)
  );

  const daysBetween = (a: string, b: string) =>
    Math.round((Date.parse(b) - Date.parse(a)) / 86400000);
  const esc = (v: string) => (/[",\n]/.test(v) ? `"${v.replace(/"/g, '""')}"` : v);
  const yn = (v: boolean) => (v ? "1" : "0");

  type Row = { date: string; cells: (string | number)[] };
  const rows: Row[] = [];

  const personCells = (userId: string) => {
    const u = userById.get(userId);
    return [
      personRef(userId),
      ...(withNames ? [u?.name ?? ""] : []),
      u?.status ?? "",
      u?.role ?? "",
      u?.approvedAt ? amsDate(u.approvedAt) : "",
      u?.causeArea === "Other" && u.causeAreaOther ? `Other: ${u.causeAreaOther}` : u?.causeArea ?? "",
      u?.roleCategory ?? "",
      u?.experienceLevel ?? "",
      u?.eaFunding ?? "",
    ];
  };

  for (const b of bookingRows) {
    const c = checkinByUserDate.get(`${b.userId}:${b.date}`);
    const bookedOn = amsDate(b.createdAt);
    const cancelledOn = b.cancelledAt ? amsDate(b.cancelledAt) : "";
    rows.push({
      date: b.date,
      cells: [
        b.date,
        WEEKDAY_NAMES[isoWeekday(b.date) - 1],
        ...personCells(b.userId),
        "booking",
        b.status,
        b.slot,
        b.seatType,
        b.deskNumber ?? "",
        b.source,
        yn(!!b.seriesId),
        bookedOn,
        daysBetween(bookedOn, b.date),
        cancelledOn,
        cancelledOn ? daysBetween(cancelledOn, b.date) : "",
        yn(b.noShow),
        // A check-in belongs to the live booking, not a cancelled one that day.
        yn(b.status === "booked" && !!c),
        b.status === "booked" && c ? yn(c.isRetroactive) : "",
        yn(b.date >= today),
      ],
    });
  }

  // Check-ins with no live booking that day, so nothing attended goes missing.
  for (const c of checkinRows) {
    if (bookedUserDates.has(`${c.userId}:${c.date}`)) continue;
    rows.push({
      date: c.date,
      cells: [
        c.date,
        WEEKDAY_NAMES[isoWeekday(c.date) - 1],
        ...personCells(c.userId),
        "checkin_only",
        "", "", "", "", "", "", "", "", "", "", "",
        "1",
        yn(c.isRetroactive),
        "0",
      ],
    });
  }

  rows.sort((a, b) => a.date.localeCompare(b.date));

  const header = [
    "date",
    "weekday",
    "person",
    ...(withNames ? ["name"] : []),
    "member_status",
    "member_role",
    "member_since",
    "cause_area",
    "role_category",
    "experience_level",
    "ea_funding",
    "record",
    "booking_status",
    "slot",
    "seat_type",
    "desk",
    "booking_source",
    "repeat_booking",
    "booked_on",
    "days_booked_ahead",
    "cancelled_on",
    "days_cancelled_ahead",
    "no_show",
    "checked_in",
    "checkin_retroactive",
    "in_future",
  ];

  const notes = [
    `EA Netherlands office: every booking and check-in from ${from} to ${to}, exported ${today}.`,
    `The office has ${cfg.desk_count} desks plus ${cfg.flex_count} flex seats at the lunch table. It is open on working days (no weekends or Dutch public holidays).`,
    "One row per booking. A check-in with no live booking that day gets its own row with record=checkin_only.",
    `person: a stable code for one person, the same in every export.${withNames ? " name: their name." : " Names are left out on purpose."}`,
    "member_status: pending, trial, active, inactive, declined, imported or event_guest, as of today. member_role: visitor, member or admin (admins are EAN staff).",
    "member_since: the date they were admitted. cause_area, role_category, experience_level, ea_funding: from their self-reported profile, as of today, blank if never filled in. ea_funding: direct, employer, none or undisclosed.",
    "booking_status: booked, cancelled or waitlisted. slot: day, am (morning) or pm (afternoon); two half-day rows on one date are one visit.",
    "seat_type: desk or flex. booking_source: self, block (part of a repeat series), walkin or admin. repeat_booking: 1 if it came from a repeating series.",
    "days_booked_ahead: days between making the booking and the date. days_cancelled_ahead: days between cancelling and the date (0 = same day).",
    "no_show: 1 if marked as a no-show. checked_in: 1 if the person checked in that day (QR at the door; not everyone does, so it undercounts). checkin_retroactive: 1 if they checked in afterwards from an email link.",
    "in_future: 1 for dates from today onward, which haven't happened yet.",
  ];

  const lines = [
    ...notes.map((n) => `# ${n}`),
    header.join(","),
    ...rows.map((r) => r.cells.map((v) => esc(String(v))).join(",")),
  ];

  return new Response(lines.join("\n"), {
    headers: {
      "Content-Type": "text/csv; charset=utf-8",
      "Content-Disposition": `attachment; filename="ean-office-raw-${from}-to-${to}.csv"`,
    },
  });
}

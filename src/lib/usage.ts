import { db, bookings, checkins, users } from "@/db";
import { and, gte, lte, eq } from "drizzle-orm";
import { addDays, isoWeekday, isWorkingDay, todayAms } from "./dates";
import { asSlot } from "./slots";

// Per-person usage: who came in, how often, and how steadily. Built for
// setting pricing thresholds ("more than N days a week pays"), so it answers
// in days per week and shows where the line would fall before anyone draws it.
//
// A visit is one person on one day, as in reports.ts — a morning and an
// afternoon booked separately are still one visit. Two bases, because the
// check-in rate is well under 100%:
//   booked   — past days with a live booking not marked as a no-show
//   attended — days with a check-in
// "Per week" divides by working days / 5, so holidays and a range that starts
// mid-week don't drag everyone's average down.

export type Basis = "booked" | "attended";

export type PersonUsage = {
  userId: string;
  name: string;
  email: string;
  status: string;
  role: string;
  causeArea: string | null;
  visits: number;
  halfDays: number; // visits that were only a morning or an afternoon
  perWeek: number;
  perMonth: number;
  activeWeeks: number; // weeks with at least one visit
  perActiveWeek: number;
  busiestWeek: number;
  firstVisit: string;
  lastVisit: string;
  byWeek: Map<string, number>; // week-start Monday → visits
};

export type Band = {
  label: string;
  min: number; // days per week, inclusive
  people: number;
  peoplePct: number;
  visitsPct: number;
  atOrAbove: number; // people in this band or any busier one
};

export type UsageReport = {
  from: string;
  to: string;
  pastTo: string;
  basis: Basis;
  workingDays: number;
  weeks: number; // working-week equivalents
  weekStarts: string[];
  totalVisits: number;
  people: PersonUsage[];
  bands: Band[];
};

const BANDS: { label: string; min: number }[] = [
  { label: "Less than twice a month", min: 0 },
  { label: "Twice a month to once a week", min: 0.5 },
  { label: "1 to 2 days a week", min: 1 },
  { label: "2 to 3 days a week", min: 2 },
  { label: "3 or more days a week", min: 3 },
];

export function weekStart(day: string): string {
  return addDays(day, 1 - isoWeekday(day));
}

export function parseBasis(v: string | null | undefined): Basis {
  return v === "attended" ? "attended" : "booked";
}

export async function getUsage(
  from: string,
  to: string,
  basis: Basis
): Promise<UsageReport> {
  const today = todayAms();
  const pastTo = to < today ? to : addDays(today, -1);

  let workingDays = 0;
  const weekStarts: string[] = [];
  for (let d = from; d <= pastTo; d = addDays(d, 1)) {
    if (isWorkingDay(d)) workingDays++;
    const w = weekStart(d);
    if (weekStarts[weekStarts.length - 1] !== w) weekStarts.push(w);
  }
  const weeks = workingDays / 5;
  const months = Math.max(
    1 / 30,
    (Date.parse(pastTo) - Date.parse(from) + 86400000) / (1000 * 60 * 60 * 24 * 30.44)
  );

  // userId → date → full day?
  const days = new Map<string, Map<string, boolean>>();
  const mark = (userId: string, date: string, full: boolean) => {
    if (!days.has(userId)) days.set(userId, new Map());
    const m = days.get(userId)!;
    m.set(date, (m.get(date) ?? false) || full);
  };

  if (basis === "attended") {
    const rows = await db
      .select()
      .from(checkins)
      .where(and(gte(checkins.date, from), lte(checkins.date, pastTo)));
    const bookedRows = await db
      .select()
      .from(bookings)
      .where(
        and(gte(bookings.date, from), lte(bookings.date, pastTo), eq(bookings.status, "booked"))
      );
    // A check-in carries no slot, so take it from that day's bookings; a
    // check-in with no booking counts as a full day.
    const slotsByUserDate = new Map<string, Set<string>>();
    for (const b of bookedRows) {
      const k = `${b.userId}:${b.date}`;
      if (!slotsByUserDate.has(k)) slotsByUserDate.set(k, new Set());
      slotsByUserDate.get(k)!.add(asSlot(b.slot));
    }
    for (const c of rows) {
      const s = slotsByUserDate.get(`${c.userId}:${c.date}`);
      mark(c.userId, c.date, !s || s.has("day") || (s.has("am") && s.has("pm")));
    }
  } else {
    const rows = await db
      .select()
      .from(bookings)
      .where(
        and(gte(bookings.date, from), lte(bookings.date, pastTo), eq(bookings.status, "booked"))
      );
    const halves = new Map<string, Set<string>>();
    for (const b of rows) {
      if (b.noShow) continue;
      const slot = asSlot(b.slot);
      const k = `${b.userId}:${b.date}`;
      if (!halves.has(k)) halves.set(k, new Set());
      const set = halves.get(k)!;
      if (slot === "day") {
        set.add("am");
        set.add("pm");
      } else set.add(slot);
      mark(b.userId, b.date, set.size === 2);
    }
  }

  const allUsers = await db.select().from(users);
  const userById = new Map(allUsers.map((u) => [u.id, u]));

  const people: PersonUsage[] = [];
  for (const [userId, dates] of days) {
    const u = userById.get(userId);
    if (!u) continue;
    const sorted = [...dates.keys()].sort();
    const byWeek = new Map<string, number>();
    for (const d of sorted) {
      const w = weekStart(d);
      byWeek.set(w, (byWeek.get(w) ?? 0) + 1);
    }
    const visits = sorted.length;
    people.push({
      userId,
      name: u.name,
      email: u.email,
      status: u.status,
      role: u.role,
      causeArea: u.causeArea,
      visits,
      halfDays: [...dates.values()].filter((full) => !full).length,
      perWeek: weeks > 0 ? visits / weeks : 0,
      perMonth: visits / months,
      activeWeeks: byWeek.size,
      perActiveWeek: visits / byWeek.size,
      busiestWeek: Math.max(...byWeek.values()),
      firstVisit: sorted[0],
      lastVisit: sorted[sorted.length - 1],
      byWeek,
    });
  }
  people.sort((a, b) => b.visits - a.visits || a.name.localeCompare(b.name));

  const totalVisits = people.reduce((s, p) => s + p.visits, 0);
  const bands: Band[] = BANDS.map((band, i) => {
    const max = BANDS[i + 1]?.min ?? Infinity;
    const inBand = people.filter((p) => p.perWeek >= band.min && p.perWeek < max);
    return {
      ...band,
      people: inBand.length,
      peoplePct: people.length ? inBand.length / people.length : 0,
      visitsPct: totalVisits ? inBand.reduce((s, p) => s + p.visits, 0) / totalVisits : 0,
      atOrAbove: people.filter((p) => p.perWeek >= band.min).length,
    };
  });

  return { from, to, pastTo, basis, workingDays, weeks, weekStarts, totalVisits, people, bands };
}

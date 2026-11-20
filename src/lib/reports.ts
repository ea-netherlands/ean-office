import { db, bookings, checkins, users, events, eventAttendance } from "@/db";
import { and, eq, gte, lte, inArray } from "drizzle-orm";
import { getSettings } from "./settings";
import { addDays, isoWeekday, isWorkingDay, todayAms } from "./dates";
import { asSlot, slotWeight } from "./slots";
import { genderReportLabel } from "./profile-options";

// Every figure here is one EAN has reported to EAIF or set as a target.
// Occupancy is always a percentage of desks (8), never of total seats.
//
// Half days are counted as half a desk-day rather than by splitting the
// denominator into half-days, so the occupancy series stays comparable with
// every period reported before half-day booking existed. Visit counts and
// the check-in rate are per person per day, so someone who books a morning
// and an afternoon separately is still one visit.

export type DemographicRow = {
  label: string;
  people: number; // distinct attendees
  peoplePct: number;
  deskDays: number; // attendance-weighted
  deskDaysPct: number;
};

// One row per weekday (Mon–Fri), averaged over the working days in the
// period that fall on it. Same desk-only, half-day-weighted counting as the
// headline occupancy, so the five bars average out to it.
export type WeekdayRow = {
  weekday: number; // 1=Mon … 5=Fri
  days: number; // working days in the period on this weekday
  occupancyBooked: number; // 0..1 of desks
  occupancyAttended: number;
  flexPerDay: number; // lunch-table spots used per day, overflow
};

// One row per week (or per month on long ranges). Visits are per person per
// day, the same counting as the headline "Visits" rows, and are compared per
// working day so a short week or a week with a holiday isn't read as a dip.
export type PeriodRow = {
  start: string; // first day of the bucket that falls inside the range
  end: string; // last day, likewise
  days: number; // working days in the bucket, past days only
  complete: boolean; // false when the range or today cuts the bucket short
  visitsBooked: number;
  visitsAttended: number;
};

export type TrendDirection = "up" | "down" | "steady" | "unknown";

export type Trend = {
  direction: TrendDirection;
  from: number; // fitted visits per working day at the start of the range
  to: number; // and at the end
  average: number;
};

export type Report = {
  from: string;
  to: string;
  months: number;
  workingDays: number;
  // usage
  visitsBooked: number;
  visitsAttended: number;
  visitsPerMonth: number;
  uniqueVisitors: number;
  uniqueVisitorsPerMonth: number;
  occupancyBooked: number; // 0..1, desks only
  occupancyAttended: number;
  flexDaysUsed: number; // overflow, reported separately
  byWeekday: WeekdayRow[];
  overTime: {
    unit: "week" | "month";
    rows: PeriodRow[];
    booked: Trend;
    attended: Trend;
  };
  walkIns: number;
  waitlistedDays: number;
  halfDayBookings: number; // count of morning/afternoon bookings
  halfDayShare: number; // 0..1 of all bookings
  // membership
  newMembers: number;
  trialsEnded: number;
  trialsConverted: number;
  // events
  eventCount: number;
  eventParticipants: number;
  avgPerEvent: number;
  eventsByType: { type: string; count: number; participants: number }[];
  themedDays: number;
  themedParticipants: number;
  // demographics (people vs desk-days)
  causeAreas: DemographicRow[];
  funding: DemographicRow[];
  // Which EA funders, among the EA-funded. People can name several, so rows
  // overlap and don't sum to 100%; percentages are of all attendees.
  funders: DemographicRow[];
  roleCategories: DemographicRow[];
  experience: DemographicRow[];
  gender: DemographicRow[];
  pctXRisk: { people: number; deskDays: number };
  pctEaFunded: { people: number; deskDays: number };
  pctEaAligned: { people: number; deskDays: number };
  // data quality
  checkinRate: number; // attended / booked, past days only
  retroCheckins: number;
  profileCoveragePeople: number; // % of attendees with a fresh profile
  profileCoverageDeskDays: number;
  checkinRateTarget: number;
};

function pct(n: number, d: number): number {
  return d === 0 ? 0 : n / d;
}

// Weekly up to about nine months, monthly beyond that: more than ~40 bars
// stops being readable, and a month smooths out the holiday weeks.
const WEEKLY_MAX_DAYS = 280;

function mondayOf(day: string): string {
  return addDays(day, 1 - isoWeekday(day));
}

export function bucketVisits(
  from: string,
  pastTo: string,
  bookedUserDays: Iterable<string>, // "userId:date"
  attendedDates: Iterable<string>
): { unit: "week" | "month"; rows: PeriodRow[] } {
  if (pastTo < from) return { unit: "week", rows: [] };
  const span = (Date.parse(pastTo) - Date.parse(from)) / 86_400_000;
  const unit = span <= WEEKLY_MAX_DAYS ? "week" : "month";
  const keyOf = (d: string) => (unit === "week" ? mondayOf(d) : d.slice(0, 7));

  const rows = new Map<string, PeriodRow>();
  for (let d = from; d <= pastTo; d = addDays(d, 1)) {
    const k = keyOf(d);
    const row = rows.get(k);
    if (row) {
      row.end = d;
      if (isWorkingDay(d)) row.days++;
    } else {
      rows.set(k, {
        start: d,
        end: d,
        days: isWorkingDay(d) ? 1 : 0,
        // Complete unless the range starts after the bucket's first working
        // day; whether it also runs to its last one is checked below.
        complete: !hasWorkingDayBefore(d, k, keyOf),
        visitsBooked: 0,
        visitsAttended: 0,
      });
    }
  }
  for (const [k, row] of rows) {
    if (hasWorkingDayAfter(row.end, k, keyOf)) row.complete = false;
  }
  for (const ud of bookedUserDays) {
    const row = rows.get(keyOf(ud.slice(ud.indexOf(":") + 1)));
    if (row) row.visitsBooked++;
  }
  for (const d of attendedDates) {
    const row = rows.get(keyOf(d));
    if (row) row.visitsAttended++;
  }
  // Weeks before the first recorded visit are before the app was in use, not
  // empty weeks at the office: counting them as zeros would read as growth.
  const all = [...rows.values()].filter((r) => r.days > 0);
  const firstUsed = all.findIndex((r) => r.visitsBooked + r.visitsAttended > 0);
  return { unit, rows: firstUsed === -1 ? [] : all.slice(firstUsed) };
}

function hasWorkingDayBefore(
  day: string,
  key: string,
  keyOf: (d: string) => string
): boolean {
  for (let d = addDays(day, -1); keyOf(d) === key; d = addDays(d, -1)) {
    if (isWorkingDay(d)) return true;
  }
  return false;
}

function hasWorkingDayAfter(
  day: string,
  key: string,
  keyOf: (d: string) => string
): boolean {
  for (let d = addDays(day, 1); keyOf(d) === key; d = addDays(d, 1)) {
    if (isWorkingDay(d)) return true;
  }
  return false;
}

// Is the series going up, down, or holding? A straight line through the
// complete buckets, and it only counts as a trend when the line moves by
// more than a tenth of the average across the range AND the slope stands
// clear of the week-to-week noise (|t| > 2). Office weeks swing a lot, so
// comparing two months by eye calls a trend most times there isn't one.
const MIN_BUCKETS = { week: 8, month: 4 };

export function trendOf(
  rows: PeriodRow[],
  unit: "week" | "month",
  value: (r: PeriodRow) => number
): Trend {
  const ys = rows.filter((r) => r.complete).map((r) => value(r) / r.days);
  const n = ys.length;
  const average = n === 0 ? 0 : ys.reduce((s, y) => s + y, 0) / n;
  if (n < MIN_BUCKETS[unit] || average === 0) {
    return { direction: "unknown", from: average, to: average, average };
  }
  const xMean = (n - 1) / 2;
  let sxx = 0;
  let sxy = 0;
  ys.forEach((y, x) => {
    sxx += (x - xMean) ** 2;
    sxy += (x - xMean) * (y - average);
  });
  const slope = sxy / sxx;
  const intercept = average - slope * xMean;
  const sse = ys.reduce((s, y, x) => s + (y - (intercept + slope * x)) ** 2, 0);
  const se = Math.sqrt(sse / (n - 2) / sxx);
  const t = se === 0 ? Infinity : Math.abs(slope) / se;
  const change = slope * (n - 1);
  const real = Math.abs(change) > 0.1 * average && t > 2;
  return {
    direction: !real ? "steady" : slope > 0 ? "up" : "down",
    from: intercept,
    to: intercept + change,
    average,
  };
}

export async function getReport(from: string, to: string): Promise<Report> {
  const cfg = await getSettings();
  const today = todayAms();
  const pastTo = to < today ? to : addDays(today, -1); // attendance facts only exist for past days

  let workingDays = 0;
  const daysByWeekday = new Map<number, number>();
  for (let d = from; d <= pastTo; d = addDays(d, 1)) {
    if (isWorkingDay(d)) {
      workingDays++;
      const wd = isoWeekday(d);
      daysByWeekday.set(wd, (daysByWeekday.get(wd) ?? 0) + 1);
    }
  }
  const months = Math.max(
    1 / 30,
    (Date.parse(to) - Date.parse(from)) / (1000 * 60 * 60 * 24 * 30.44)
  );

  const bookingRows = await db
    .select()
    .from(bookings)
    .where(
      and(
        gte(bookings.date, from),
        lte(bookings.date, pastTo),
        inArray(bookings.status, ["booked", "waitlisted"])
      )
    );
  const checkinRows = await db
    .select()
    .from(checkins)
    .where(and(gte(checkins.date, from), lte(checkins.date, pastTo)));
  const allUsers = await db.select().from(users);
  const userById = new Map(allUsers.map((u) => [u.id, u]));

  const booked = bookingRows.filter((b) => b.status === "booked");
  const deskBooked = booked.filter((b) => b.seatType === "desk");
  const checkinByUserDate = new Map(
    checkinRows.map((c) => [`${c.userId}:${c.date}`, c])
  );
  const attendedBookings = booked.filter((b) =>
    checkinByUserDate.has(`${b.userId}:${b.date}`)
  );
  const deskAttended = attendedBookings.filter((b) => b.seatType === "desk");

  // Desk-days: a morning or an afternoon is half of one.
  const deskDays = (rows: typeof booked) =>
    rows.reduce((s, b) => s + slotWeight(asSlot(b.slot)), 0);
  // Person-days: two half bookings on one day are one visit, not two.
  const userDays = (rows: typeof booked) =>
    new Set(rows.map((b) => `${b.userId}:${b.date}`));
  const bookedUserDays = userDays(booked);
  const attendedUserDays = userDays(attendedBookings);
  const halfDayBookings = booked.filter((b) => asSlot(b.slot) !== "day").length;

  const denom = workingDays * cfg.desk_count;

  const byWeekday: WeekdayRow[] = [1, 2, 3, 4, 5].map((weekday) => {
    const days = daysByWeekday.get(weekday) ?? 0;
    const on = (rows: typeof booked) =>
      rows.filter((b) => isoWeekday(b.date) === weekday);
    return {
      weekday,
      days,
      occupancyBooked: pct(deskDays(on(deskBooked)), days * cfg.desk_count),
      occupancyAttended: pct(deskDays(on(deskAttended)), days * cfg.desk_count),
      flexPerDay: pct(
        deskDays(on(booked.filter((b) => b.seatType === "flex"))),
        days
      ),
    };
  });
  const uniqueVisitorIds = new Set(checkinRows.map((c) => c.userId));

  const buckets = bucketVisits(
    from,
    pastTo,
    bookedUserDays,
    checkinRows.map((c) => c.date)
  );
  const overTime = {
    ...buckets,
    booked: trendOf(buckets.rows, buckets.unit, (r) => r.visitsBooked),
    attended: trendOf(buckets.rows, buckets.unit, (r) => r.visitsAttended),
  };

  // unique visitors per calendar month, averaged
  const byMonth = new Map<string, Set<string>>();
  for (const c of checkinRows) {
    const m = c.date.slice(0, 7);
    if (!byMonth.has(m)) byMonth.set(m, new Set());
    byMonth.get(m)!.add(c.userId);
  }
  const uniquePerMonth =
    byMonth.size === 0
      ? 0
      : [...byMonth.values()].reduce((s, set) => s + set.size, 0) / byMonth.size;

  // membership — bulk-imported rows are excluded until claimed (source flips
  // to "import" only at insert time and never changes), so a spreadsheet
  // import never reads as a spike in new members.
  const newMembers = allUsers.filter(
    (u) =>
      u.source !== "import" &&
      u.approvedAt &&
      u.approvedAt.toISOString().slice(0, 10) >= from &&
      u.approvedAt.toISOString().slice(0, 10) <= to
  ).length;
  const trialsEndedUsers = allUsers.filter(
    (u) => u.trialDate && u.trialDate >= from && u.trialDate <= pastTo
  );
  const trialsConverted = trialsEndedUsers.filter(
    (u) => u.status === "active"
  ).length;

  // events
  const eventRows = await db
    .select()
    .from(events)
    .where(
      and(
        gte(events.date, from),
        lte(events.date, to),
        eq(events.status, "confirmed")
      )
    );
  const attendanceRows =
    eventRows.length > 0
      ? await db
          .select()
          .from(eventAttendance)
          .where(
            inArray(
              eventAttendance.eventId,
              eventRows.map((e) => e.id)
            )
          )
      : [];
  const participantsFor = (eventId: string, headcount: number | null) => {
    // Never report RSVPs as attendance.
    const real = attendanceRows.filter(
      (a) => a.eventId === eventId && a.source !== "rsvp"
    ).length;
    return Math.max(real, headcount ?? 0);
  };
  const eventParticipants = eventRows.reduce(
    (s, e) => s + participantsFor(e.id, e.headcount),
    0
  );
  const typeMap = new Map<string, { count: number; participants: number }>();
  for (const e of eventRows) {
    const t = typeMap.get(e.type) ?? { count: 0, participants: 0 };
    t.count++;
    t.participants += participantsFor(e.id, e.headcount);
    typeMap.set(e.type, t);
  }
  const themed = eventRows.filter((e) => e.type === "themed_coworking");

  // demographics — % of people AND % of desk-days. They diverge, and the
  // divergence is itself interesting.
  const attendeeDeskDays = new Map<string, number>();
  for (const c of checkinRows) {
    attendeeDeskDays.set(c.userId, (attendeeDeskDays.get(c.userId) ?? 0) + 1);
  }
  const totalDeskDays = checkinRows.length;
  const totalPeople = attendeeDeskDays.size;

  function breakdown(
    field: (u: (typeof allUsers)[number]) => string | null
  ): DemographicRow[] {
    const acc = new Map<string, { people: number; deskDays: number }>();
    for (const [userId, days] of attendeeDeskDays) {
      const u = userById.get(userId);
      const label = (u && field(u)) || "Not stated";
      const row = acc.get(label) ?? { people: 0, deskDays: 0 };
      row.people++;
      row.deskDays += days;
      acc.set(label, row);
    }
    return [...acc.entries()]
      .map(([label, v]) => ({
        label,
        people: v.people,
        peoplePct: pct(v.people, totalPeople),
        deskDays: v.deskDays,
        deskDaysPct: pct(v.deskDays, totalDeskDays),
      }))
      .sort((a, b) => b.deskDays - a.deskDays);
  }

  // Like breakdown, but for a multi-select answer: each person counts once
  // under every label they picked, and people with no labels are left out.
  function multiBreakdown(
    field: (u: (typeof allUsers)[number]) => string[] | null
  ): DemographicRow[] {
    const acc = new Map<string, { people: number; deskDays: number }>();
    for (const [userId, days] of attendeeDeskDays) {
      const u = userById.get(userId);
      for (const label of new Set((u && field(u)) || [])) {
        const row = acc.get(label) ?? { people: 0, deskDays: 0 };
        row.people++;
        row.deskDays += days;
        acc.set(label, row);
      }
    }
    return [...acc.entries()]
      .map(([label, v]) => ({
        label,
        people: v.people,
        peoplePct: pct(v.people, totalPeople),
        deskDays: v.deskDays,
        deskDaysPct: pct(v.deskDays, totalDeskDays),
      }))
      .sort((a, b) => b.deskDays - a.deskDays);
  }

  function share(match: (u: (typeof allUsers)[number]) => boolean) {
    let people = 0;
    let deskDays = 0;
    for (const [userId, days] of attendeeDeskDays) {
      const u = userById.get(userId);
      if (u && match(u)) {
        people++;
        deskDays += days;
      }
    }
    return { people: pct(people, totalPeople), deskDays: pct(deskDays, totalDeskDays) };
  }

  const EA_CAUSES = [
    "Existential Risk Reduction",
    "Global Health and Development",
    "Animal Welfare",
    "Effective Giving",
    "Community Building",
  ];

  // profile freshness (12 months)
  const freshCutoff = Date.now() - 365 * 24 * 60 * 60 * 1000;
  const hasFreshProfile = (u: (typeof allUsers)[number]) =>
    !!u.causeArea && !!u.profileUpdatedAt && u.profileUpdatedAt.getTime() >= freshCutoff;
  const fresh = share(hasFreshProfile);

  return {
    from,
    to,
    months,
    workingDays,
    visitsBooked: bookedUserDays.size,
    visitsAttended: checkinRows.length,
    visitsPerMonth: checkinRows.length / months,
    uniqueVisitors: uniqueVisitorIds.size,
    uniqueVisitorsPerMonth: uniquePerMonth,
    occupancyBooked: pct(deskDays(deskBooked), denom),
    occupancyAttended: pct(deskDays(deskAttended), denom),
    flexDaysUsed: deskDays(booked.filter((b) => b.seatType === "flex")),
    byWeekday,
    overTime,
    walkIns: booked.filter((b) => b.source === "walkin").length,
    waitlistedDays: new Set(
      bookingRows.filter((b) => b.status === "waitlisted").map((b) => b.date)
    ).size,
    halfDayBookings,
    halfDayShare: pct(halfDayBookings, booked.length),
    newMembers,
    trialsEnded: trialsEndedUsers.length,
    trialsConverted,
    eventCount: eventRows.length,
    eventParticipants,
    avgPerEvent: pct(eventParticipants, eventRows.length),
    eventsByType: [...typeMap.entries()].map(([type, v]) => ({ type, ...v })),
    themedDays: themed.length,
    themedParticipants: themed.reduce(
      (s, e) => s + participantsFor(e.id, e.headcount),
      0
    ),
    causeAreas: breakdown((u) => u.causeArea),
    funding: breakdown((u) =>
      u.eaFunding === "direct"
        ? "Yes, directly"
        : u.eaFunding === "employer"
          ? "Yes, via employer"
          : u.eaFunding === "none"
            ? "No"
            : u.eaFunding === "undisclosed"
              ? "Prefer not to say"
              : null
    ),
    funders: multiBreakdown((u) =>
      u.eaFunding === "direct" || u.eaFunding === "employer"
        ? u.funders?.length
          ? u.funders
          : ["Funder not named"]
        : null
    ),
    roleCategories: breakdown((u) => u.roleCategory),
    experience: breakdown((u) => u.experienceLevel),
    gender: breakdown((u) => genderReportLabel(u.gender)),
    pctXRisk: share((u) => u.causeArea === "Existential Risk Reduction"),
    pctEaFunded: share(
      (u) => u.eaFunding === "direct" || u.eaFunding === "employer"
    ),
    pctEaAligned: share((u) => !!u.causeArea && EA_CAUSES.includes(u.causeArea)),
    checkinRate: pct(attendedUserDays.size, bookedUserDays.size),
    retroCheckins: checkinRows.filter((c) => c.isRetroactive).length,
    profileCoveragePeople: fresh.people,
    profileCoverageDeskDays: fresh.deskDays,
    checkinRateTarget: cfg.checkin_rate_target,
  };
}

export function methodologyNote(r: Report): string {
  const halfDays =
    r.halfDayBookings > 0
      ? ` Occupancy is measured in desk-days against ${r.workingDays} working days × 8 desks; a morning or afternoon booking counts as half a desk-day, so figures stay comparable with earlier periods (${Math.round(
          r.halfDayShare * 100
        )}% of bookings in this period were half days).`
      : "";
  return `Attendance is self-recorded via QR check-in; the check-in rate for this period was ${Math.round(
    r.checkinRate * 100
  )}%, so actual usage is likely somewhat higher.${halfDays} Demographic figures come from self-reported member profiles covering ${Math.round(
    r.profileCoverageDeskDays * 100
  )}% of desk-days in this period.`;
}

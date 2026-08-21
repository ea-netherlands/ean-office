// All storage is UTC; everything user-facing is Europe/Amsterdam.
// Booking "dates" are Amsterdam calendar dates as YYYY-MM-DD strings.

export const TZ = "Europe/Amsterdam";

const dateFmt = new Intl.DateTimeFormat("en-CA", {
  timeZone: TZ,
  year: "numeric",
  month: "2-digit",
  day: "2-digit",
});

/** Amsterdam calendar date (YYYY-MM-DD) for a given instant. */
export function amsDate(d: Date = new Date()): string {
  return dateFmt.format(d);
}

export function todayAms(): string {
  return amsDate(new Date());
}

const clockFmt = new Intl.DateTimeFormat("en-GB", {
  timeZone: TZ,
  hour: "2-digit",
  minute: "2-digit",
  hourCycle: "h23",
});

/** Minutes since midnight on the Amsterdam wall clock. */
export function minutesOfDayAms(d: Date = new Date()): number {
  const parts = clockFmt.formatToParts(d);
  const at = (type: string) =>
    Number(parts.find((p) => p.type === type)?.value ?? 0);
  return at("hour") * 60 + at("minute");
}

/** Parse YYYY-MM-DD as a UTC-noon Date — safe for date arithmetic across DST. */
export function parseDay(day: string): Date {
  return new Date(`${day}T12:00:00Z`);
}

export function addDays(day: string, n: number): string {
  const d = parseDay(day);
  d.setUTCDate(d.getUTCDate() + n);
  return d.toISOString().slice(0, 10);
}

/** ISO weekday: 1=Mon … 7=Sun */
export function isoWeekday(day: string): number {
  const wd = parseDay(day).getUTCDay();
  return wd === 0 ? 7 : wd;
}

export function isWeekend(day: string): boolean {
  return isoWeekday(day) >= 6;
}

const MONTHS = [
  "January", "February", "March", "April", "May", "June",
  "July", "August", "September", "October", "November", "December",
];
const WEEKDAYS = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];
export const WEEKDAY_NAMES = ["Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday", "Sunday"];

/**
 * "Tue 4 Aug", with the year appended when it isn't the current one: bookings
 * and co-working days now reach months ahead, and "Mon 15 Feb" in an admin
 * queue shouldn't be a guess about which February.
 */
export function formatDay(day: string): string {
  const d = parseDay(day);
  const year = d.getUTCFullYear();
  const suffix = year === parseInt(todayAms().slice(0, 4), 10) ? "" : ` ${year}`;
  return `${WEEKDAYS[isoWeekday(day) - 1]} ${d.getUTCDate()} ${MONTHS[d.getUTCMonth()].slice(0, 3)}${suffix}`;
}

/** "Tuesday 4 August 2026" */
export function formatDayLong(day: string): string {
  const d = parseDay(day);
  return `${WEEKDAY_NAMES[isoWeekday(day) - 1]} ${d.getUTCDate()} ${MONTHS[d.getUTCMonth()]} ${d.getUTCFullYear()}`;
}

export function monthName(year: number, month: number): string {
  return `${MONTHS[month - 1]} ${year}`;
}

/** Format an instant as Amsterdam local date+time. */
export function formatInstant(d: Date): string {
  return new Intl.DateTimeFormat("en-GB", {
    timeZone: TZ,
    day: "numeric",
    month: "short",
    hour: "2-digit",
    minute: "2-digit",
  }).format(d);
}

// ---------- Dutch public holidays ----------

function easterSunday(year: number): string {
  // Anonymous Gregorian computus
  const a = year % 19;
  const b = Math.floor(year / 100);
  const c = year % 100;
  const d = Math.floor(b / 4);
  const e = b % 4;
  const f = Math.floor((b + 8) / 25);
  const g = Math.floor((b - f + 1) / 3);
  const h = (19 * a + b - d - g + 15) % 30;
  const i = Math.floor(c / 4);
  const k = c % 4;
  const l = (32 + 2 * e + 2 * i - h - k) % 7;
  const m = Math.floor((a + 11 * h + 22 * l) / 451);
  const month = Math.floor((h + l - 7 * m + 114) / 31);
  const day = ((h + l - 7 * m + 114) % 31) + 1;
  return `${year}-${String(month).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
}

const holidayCache = new Map<number, Set<string>>();

export function nlHolidays(year: number): Set<string> {
  const cached = holidayCache.get(year);
  if (cached) return cached;
  const easter = easterSunday(year);
  const set = new Set<string>([
    `${year}-01-01`, // Nieuwjaarsdag
    addDays(easter, -2), // Goede Vrijdag
    addDays(easter, 1), // Tweede Paasdag
    `${year}-04-27`, // Koningsdag
    `${year}-05-05`, // Bevrijdingsdag
    addDays(easter, 39), // Hemelvaart
    addDays(easter, 50), // Tweede Pinksterdag
    `${year}-12-25`,
    `${year}-12-26`,
  ]);
  // Koningsdag moves to the 26th when the 27th is a Sunday
  if (isoWeekday(`${year}-04-27`) === 7) {
    set.delete(`${year}-04-27`);
    set.add(`${year}-04-26`);
  }
  holidayCache.set(year, set);
  return set;
}

export function isHoliday(day: string): boolean {
  return nlHolidays(parseInt(day.slice(0, 4), 10)).has(day);
}

export function isWorkingDay(day: string): boolean {
  return !isWeekend(day) && !isHoliday(day);
}

export function addWorkingDays(day: string, n: number): string {
  let d = day;
  let left = n;
  while (left > 0) {
    d = addDays(d, 1);
    if (isWorkingDay(d)) left--;
  }
  return d;
}

/** Working days elapsed between two dates (exclusive of `from`, inclusive of `to`). */
export function workingDaysBetween(from: string, to: string): number {
  let count = 0;
  let d = from;
  while (d < to) {
    d = addDays(d, 1);
    if (isWorkingDay(d)) count++;
  }
  return count;
}

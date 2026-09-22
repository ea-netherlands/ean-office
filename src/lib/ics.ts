/**
 * Calendar invites.
 *
 * The app runs on a server with no access to anyone's Google account, so
 * rather than an OAuth integration we send a standard iCalendar file. Gmail,
 * Outlook and Apple Calendar all understand it, which lands the thing in
 * someone's calendar with one tap and works for whoever gets the email
 * without any per-person setup.
 *
 * Two shapes go out of here:
 *
 *  - **Hosting duties** — one timed VEVENT with METHOD:REQUEST and an
 *    ATTENDEE, so it arrives as an invitation you accept.
 *  - **Your own desk bookings** — METHOD:PUBLISH, no attendee. Nobody invited
 *    you to your own booking, and a REQUEST for it makes mail clients ask you
 *    to RSVP to yourself. A block booking is many VEVENTs in one file (not an
 *    RRULE: the series skips full days and days at the repeat-booking cap, and
 *    a recurrence rule would quietly put those days back).
 */

function stamp(d: Date): string {
  return d.toISOString().replace(/[-:]/g, "").replace(/\.\d{3}/, "");
}

function escapeText(s: string): string {
  return s
    .replace(/\\/g, "\\\\")
    .replace(/;/g, "\;")
    .replace(/,/g, "\\,")
    .replace(/\r?\n/g, "\\n");
}

/** Fold lines at 75 octets as iCalendar requires. */
function fold(line: string): string {
  if (line.length <= 75) return line;
  const parts: string[] = [line.slice(0, 75)];
  let rest = line.slice(75);
  while (rest.length > 74) {
    parts.push(` ${rest.slice(0, 74)}`);
    rest = rest.slice(74);
  }
  if (rest) parts.push(` ${rest}`);
  return parts.join("\r\n");
}

const compact = (day: string) => day.replace(/-/g, "");

export type IcsEvent = {
  uid: string;
  title: string;
  description?: string;
  location?: string;
  url?: string;
  /** Amsterdam calendar date, YYYY-MM-DD */
  date: string;
  /**
   * "11:00" — Amsterdam local. Omit for an all-day entry, which is what a
   * whole day at the office should be: a ten-hour block from 9:00 buries
   * every other thing on that day's calendar.
   */
  startTime?: string;
  /** Required alongside `startTime`. */
  durationMinutes?: number;
  organiserEmail: string;
  attendeeEmails?: string[];
  /** Minutes before the start. Skipped on all-day entries, where a 30-minute
   *  trigger fires at half past eleven the night before. */
  alarmMinutesBefore?: number;
};

/** Back-compat alias — this used to be the only shape here. */
export type IcsInvite = IcsEvent;

const TIMEZONE = [
  // Amsterdam rules, so the time is right whatever the reader's timezone.
  "BEGIN:VTIMEZONE",
  "TZID:Europe/Amsterdam",
  "BEGIN:DAYLIGHT",
  "TZOFFSETFROM:+0100",
  "TZOFFSETTO:+0200",
  "TZNAME:CEST",
  "DTSTART:19700329T020000",
  "RRULE:FREQ=YEARLY;BYMONTH=3;BYDAY=-1SU",
  "END:DAYLIGHT",
  "BEGIN:STANDARD",
  "TZOFFSETFROM:+0200",
  "TZOFFSETTO:+0100",
  "TZNAME:CET",
  "DTSTART:19701025T030000",
  "RRULE:FREQ=YEARLY;BYMONTH=10;BYDAY=-1SU",
  "END:STANDARD",
  "END:VTIMEZONE",
];

function vevent(e: IcsEvent, now: Date): string[] {
  const allDay = !e.startTime;
  const lines: string[] = [
    "BEGIN:VEVENT",
    `UID:${e.uid}`,
    `DTSTAMP:${stamp(now)}`,
  ];
  if (allDay) {
    // DTEND is exclusive for a DATE value — the day after.
    const end = new Date(`${e.date}T00:00:00Z`);
    end.setUTCDate(end.getUTCDate() + 1);
    lines.push(
      `DTSTART;VALUE=DATE:${compact(e.date)}`,
      `DTEND;VALUE=DATE:${compact(end.toISOString().slice(0, 10))}`,
      "TRANSP:TRANSPARENT" // a day at the office doesn't make you unbookable
    );
  } else {
    lines.push(
      `DTSTART;TZID=Europe/Amsterdam:${compact(e.date)}T${e.startTime!.replace(":", "")}00`,
      `DURATION:PT${e.durationMinutes ?? 60}M`,
      "TRANSP:OPAQUE"
    );
  }
  lines.push(
    `SUMMARY:${escapeText(e.title)}`,
    "SEQUENCE:0",
    "STATUS:CONFIRMED",
    `ORGANIZER;CN=EA Netherlands Office:MAILTO:${e.organiserEmail}`
  );
  if (e.description) lines.push(`DESCRIPTION:${escapeText(e.description)}`);
  if (e.location) lines.push(`LOCATION:${escapeText(e.location)}`);
  if (e.url) lines.push(`URL:${e.url}`);
  for (const email of e.attendeeEmails ?? []) {
    lines.push(
      `ATTENDEE;ROLE=REQ-PARTICIPANT;PARTSTAT=NEEDS-ACTION;RSVP=TRUE:MAILTO:${email}`
    );
  }
  if (!allDay && e.alarmMinutesBefore) {
    lines.push(
      "BEGIN:VALARM",
      `TRIGGER:-PT${e.alarmMinutesBefore}M`,
      "ACTION:DISPLAY",
      "DESCRIPTION:Reminder",
      "END:VALARM"
    );
  }
  lines.push("END:VEVENT");
  return lines;
}

export function buildIcsCalendar(
  events: IcsEvent[],
  method: "REQUEST" | "PUBLISH" = "PUBLISH",
  calendarName?: string
): string {
  const now = new Date();
  const lines: string[] = [
    "BEGIN:VCALENDAR",
    "VERSION:2.0",
    "PRODID:-//EA Netherlands//Office//EN",
    "CALSCALE:GREGORIAN",
    `METHOD:${method}`,
  ];
  if (calendarName) {
    lines.push(`X-WR-CALNAME:${escapeText(calendarName)}`);
  }
  lines.push(...TIMEZONE);
  for (const e of events) lines.push(...vevent(e, now));
  lines.push("END:VCALENDAR");
  return lines.map(fold).join("\r\n");
}

/** One invitation, the hosting-duty shape. */
export function buildIcs(invite: IcsEvent): string {
  return buildIcsCalendar(
    [{ alarmMinutesBefore: 30, ...invite }],
    "REQUEST"
  );
}

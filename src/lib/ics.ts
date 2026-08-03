/**
 * Calendar invites for hosting duties.
 *
 * The app runs on a server with no access to anyone's Google account, so
 * rather than an OAuth integration we send a standard iCalendar invite.
 * Gmail, Outlook and Apple Calendar all show it as an event you can accept,
 * which lands it in the host's calendar with one tap and works for whoever
 * approved the request without any per-person setup.
 */

function stamp(d: Date): string {
  return d.toISOString().replace(/[-:]/g, "").replace(/\.\d{3}/, "");
}

function escapeText(s: string): string {
  return s
    .replace(/\\/g, "\\\\")
    .replace(/;/g, "\\;")
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

export type IcsInvite = {
  uid: string;
  title: string;
  description?: string;
  location?: string;
  /** Amsterdam calendar date, YYYY-MM-DD */
  date: string;
  /** "11:00" — Amsterdam local */
  startTime: string;
  durationMinutes: number;
  organiserEmail: string;
  attendeeEmails?: string[];
};

export function buildIcs(invite: IcsInvite): string {
  const lines: string[] = [
    "BEGIN:VCALENDAR",
    "VERSION:2.0",
    "PRODID:-//EA Netherlands//Office//EN",
    "CALSCALE:GREGORIAN",
    "METHOD:REQUEST",
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
    "BEGIN:VEVENT",
    `UID:${invite.uid}`,
    `DTSTAMP:${stamp(new Date())}`,
    `DTSTART;TZID=Europe/Amsterdam:${invite.date.replace(/-/g, "")}T${invite.startTime.replace(":", "")}00`,
    `DURATION:PT${invite.durationMinutes}M`,
    `SUMMARY:${escapeText(invite.title)}`,
    "SEQUENCE:0",
    "STATUS:CONFIRMED",
    "TRANSP:OPAQUE",
    `ORGANIZER;CN=EA Netherlands Office:MAILTO:${invite.organiserEmail}`,
  ];
  if (invite.description) lines.push(`DESCRIPTION:${escapeText(invite.description)}`);
  if (invite.location) lines.push(`LOCATION:${escapeText(invite.location)}`);
  for (const email of invite.attendeeEmails ?? []) {
    lines.push(
      `ATTENDEE;ROLE=REQ-PARTICIPANT;PARTSTAT=NEEDS-ACTION;RSVP=TRUE:MAILTO:${email}`
    );
  }
  lines.push("BEGIN:VALARM", "TRIGGER:-PT30M", "ACTION:DISPLAY", "DESCRIPTION:Reminder", "END:VALARM");
  lines.push("END:VEVENT", "END:VCALENDAR");
  return lines.map(fold).join("\r\n");
}

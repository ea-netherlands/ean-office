import { TZ } from "./dates";

// Reading the Luma ICS feed: parsing it, and deciding which of its events are
// in our room. Kept apart from the sync in ./luma so it can be reasoned about
// and exercised without a database, an inbox or a request behind it — this is
// the part that has to be right.

/** Mirrors the events table's `type` enum without importing the schema. */
export type EventType =
  | "talk"
  | "social"
  | "reading_group"
  | "workshop"
  | "unconference"
  | "themed_coworking"
  | "other";

export type IcsEvent = {
  uid: string;
  title: string;
  start: Date;
  end: Date | null;
  allDay: boolean;
  url: string | null;
  location: string | null;
};

function unescapeIcs(s: string): string {
  return s
    .replace(/\\n/g, " ")
    .replace(/\\,/g, ",")
    .replace(/\\;/g, ";")
    .replace(/\\\\/g, "\\")
    .trim();
}

function parseIcsDate(value: string): { date: Date; allDay: boolean } | null {
  // 20240622T090000Z (UTC), 20240622T090000 (floating), or 20240622 (all-day)
  let m = value.match(/^(\d{4})(\d{2})(\d{2})T(\d{2})(\d{2})(\d{2})(Z?)$/);
  if (m) {
    const [, y, mo, d, h, mi, s, z] = m;
    const iso = `${y}-${mo}-${d}T${h}:${mi}:${s}${z ? "Z" : "+02:00"}`;
    return { date: new Date(iso), allDay: false };
  }
  m = value.match(/^(\d{4})(\d{2})(\d{2})$/);
  if (m) {
    const [, y, mo, d] = m;
    return { date: new Date(`${y}-${mo}-${d}T12:00:00Z`), allDay: true };
  }
  return null;
}

export function parseIcs(ics: string): IcsEvent[] {
  // Unfold continuation lines, then walk VEVENT blocks.
  const unfolded = ics.replace(/\r?\n[ \t]/g, "");
  const blocks = unfolded.split("BEGIN:VEVENT").slice(1);
  const out: IcsEvent[] = [];
  for (const block of blocks) {
    const body = block.split("END:VEVENT")[0];
    const prop = (name: string): string | null => {
      const m = body.match(new RegExp(`^${name}(?:;[^:\\r\\n]*)?:(.*)$`, "m"));
      return m ? m[1].trim() : null;
    };
    const uid = prop("UID");
    const summary = prop("SUMMARY");
    const dtstart = prop("DTSTART");
    if (!uid || !summary || !dtstart) continue;
    const start = parseIcsDate(dtstart);
    if (!start) continue;
    const dtend = prop("DTEND");
    const end = dtend ? parseIcsDate(dtend) : null;
    const location = prop("LOCATION");
    const description = prop("DESCRIPTION") ?? "";
    const urlMatch = description.match(/https:\/\/(?:lu\.ma|luma\.com)\/[A-Za-z0-9-]+/);
    const url =
      urlMatch && !urlMatch[0].endsWith("/eanetherlands") ? urlMatch[0] : null;
    out.push({
      uid,
      title: unescapeIcs(summary),
      start: start.date,
      end: end?.date ?? null,
      allDay: start.allDay,
      url,
      location: location ? unescapeIcs(location) : null,
    });
  }
  return out;
}

export const amsDateFmt = new Intl.DateTimeFormat("en-CA", {
  timeZone: TZ,
  year: "numeric",
  month: "2-digit",
  day: "2-digit",
});
export const amsTimeFmt = new Intl.DateTimeFormat("en-GB", {
  timeZone: TZ,
  hour: "2-digit",
  minute: "2-digit",
  hour12: false,
});

/** The office-matching needles, one per line, blanks dropped. */
export function officeNeedles(configured: string): string[] {
  return configured
    .split(/\r?\n/)
    .map((l) => l.trim().toLowerCase())
    .filter(Boolean);
}

/** Does the stated location name the office? */
export function isAtOffice(location: string | null, needles: string[]): boolean {
  if (!location || needles.length === 0) return false;
  const l = location.toLowerCase();
  return needles.some((n) => l.includes(n));
}

/**
 * What the feed's location tells us about whether an event is in our room.
 *
 *   office    — it names the office. Ours.
 *   elsewhere — it names a real street address that isn't ours. Not ours.
 *   unknown   — it names nothing you could stand in: a registration URL, a
 *               bare city, "Online". Could be either.
 *
 * The third case is the one that matters, and it isn't rare — the monthly
 * Amsterdam drinks carry a meetup.com link every time, and they're held at a
 * café most months and at the office some months. Nothing in the feed can
 * tell those apart, so the app doesn't try: an unknown becomes a proposal for
 * an admin to settle, and until they do it counts for nothing and shows to
 * nobody. Guessing "here" is the bug this whole check exists to prevent;
 * guessing "elsewhere" would quietly lose a real office event.
 *
 * A URL is deliberately *not* read for hints. `https://…/office/` looks
 * promising and would work until the day somebody's page moves.
 */
export function locationVerdict(
  location: string | null,
  needles: string[]
): "office" | "elsewhere" | "unknown" {
  if (isAtOffice(location, needles)) return "office";
  if (!location) return "unknown";
  const l = location.trim();
  if (/^https?:\/\//i.test(l)) return "unknown";
  // A street number or a postcode is what makes a string somewhere you can
  // actually go. "Amsterdam, Netherlands" and "Online" are not addresses.
  if (!/\d/.test(l)) return "unknown";
  return "elsewhere";
}

/** Best-effort event type from the title; admins can correct it. */
export function guessType(title: string): EventType {
  const t = title.toLowerCase();
  if (/co-?working/.test(t)) return "themed_coworking";
  if (/(borrel|social|drinks|dinner|poker|party|picnic|bbq)/.test(t)) return "social";
  if (/reading group|book club/.test(t)) return "reading_group";
  if (/workshop|hackathon/.test(t)) return "workshop";
  if (/unconference/.test(t)) return "unconference";
  if (/(talk|lecture|presentation|q&a|panel)/.test(t)) return "talk";
  return "other";
}

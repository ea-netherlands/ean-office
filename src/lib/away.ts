import { formatDayLong, todayAms } from "@/lib/dates";

/**
 * "The admins are on holiday" — one date, set at /admin/settings, that turns
 * itself off.
 *
 * `admin_back_on` is the first day somebody is reading the queue again, not
 * the last day away, because that is the only date anyone actually wants to
 * be told ("we're back on the 7th"). Storing the return date also means the
 * setting expires on its own: once today reaches it the notice disappears
 * with nobody having to remember to clear it, which matters for a setting
 * whose whole purpose is to be switched on immediately before a fortnight of
 * not looking at this app.
 *
 * Nothing here blocks a submission. People plan trips around a first visit,
 * and a form that refuses to take a request is far worse than one that takes
 * it and is honest about the wait.
 */
export type Away = {
  /** ISO date of the first day back. */
  date: string;
  /** "Monday 7 September 2026" */
  back: string;
};

export function adminsAway(backOn: string, today: string = todayAms()): Away | null {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(backOn)) return null;
  // ISO dates compare lexicographically, as everywhere else in this app.
  // `<=` so the return date itself already counts as back at work.
  if (backOn <= today) return null;
  return { date: backOn, back: formatDayLong(backOn) };
}

/** Shown next to a form someone is about to send. */
export function awayBefore(away: Away): string {
  return `Nobody is reviewing requests at the moment — we're back on ${away.back}. You can still send this, it just probably won't be looked at until then.`;
}

/** Shown once they have sent it, and in the acknowledgement email. */
export function awayAfter(away: Away): string {
  return `We're back on ${away.back}, so this probably won't be reviewed before then.`;
}

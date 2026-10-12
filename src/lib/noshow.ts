import { db, bookings, checkins, noShowEvents, users } from "@/db";
import { and, eq, gte, isNull, sql, inArray, desc } from "drizzle-orm";
import { newId } from "./ids";
import { getSettings } from "./settings";
import { addDays, formatDayLong, todayAms } from "./dates";
import { sendEmail, btn, link } from "./email";
import { makeToken } from "./tokens";
import { appUrl } from "./auth";
import { checkInUser } from "./booking";

/** Mark yesterday's (or any past day's) unattended bookings as no-shows. */
export async function markNoShowsForDate(date: string): Promise<number> {
  const rows = await db
    .select({
      booking: bookings,
      checkinId: checkins.id,
    })
    .from(bookings)
    .leftJoin(
      checkins,
      and(eq(checkins.userId, bookings.userId), eq(checkins.date, bookings.date))
    )
    .where(
      and(
        eq(bookings.date, date),
        eq(bookings.status, "booked"),
        eq(bookings.noShow, false)
      )
    );

  let marked = 0;
  for (const row of rows) {
    if (row.checkinId) continue;
    await db
      .update(bookings)
      .set({ noShow: true })
      .where(eq(bookings.id, row.booking.id));
    await db.insert(noShowEvents).values({
      id: newId("ns"),
      userId: row.booking.userId,
      bookingId: row.booking.id,
      date,
    });
    marked++;
  }
  return marked;
}

// Check-in email links stay valid this long: the email may sit unread a while.
const LINK_DAYS = 30;

/**
 * Missed days still waiting on an answer — not checked in after the fact, not
 * confirmed absent — newest first. One row per booking, so a morning and an
 * afternoon on the same date come back as two.
 *
 * Looks back the ladder window plus the life of an email link, so any day an
 * email named is still answerable for as long as its link works.
 */
export async function openMissedDays(userId: string) {
  const cfg = await getSettings();
  const since = addDays(todayAms(), -(cfg.noshow_window_days + LINK_DAYS));
  return db
    .select()
    .from(noShowEvents)
    .where(
      and(
        eq(noShowEvents.userId, userId),
        isNull(noShowEvents.clearedAt),
        isNull(noShowEvents.absentConfirmedAt),
        gte(noShowEvents.date, since)
      )
    )
    .orderBy(desc(noShowEvents.date));
}

/**
 * A member's answers for a batch of missed days: a retroactive check-in for
 * each day they were in, "wasn't in" for the rest. Either way the day is
 * settled and nothing asks about it again. Only acts on days that are this
 * member's and still open, whatever the form sent.
 */
export async function answerMissedDays(
  userId: string,
  attended: string[],
  absent: string[]
): Promise<{ attended: number; absent: number }> {
  const open = new Set((await openMissedDays(userId)).map((e) => e.date));
  // Straight from a client, so keep only dates we'd have shown them.
  const pick = (v: string[]) =>
    [...new Set(Array.isArray(v) ? v : [])].filter((d) => open.has(d));
  const wasIn = pick(attended);
  const wasOut = pick(absent).filter((d) => !wasIn.includes(d));

  let checkedIn = 0;
  for (const date of wasIn) {
    const res = await checkInUser(userId, date, { retroactive: true });
    if (!res.ok) continue;
    await clearNoShow(userId, date, "retro_checkin");
    checkedIn++;
  }
  if (wasOut.length > 0) {
    await db
      .update(noShowEvents)
      .set({ absentConfirmedAt: new Date() })
      .where(
        and(
          eq(noShowEvents.userId, userId),
          inArray(noShowEvents.date, wasOut),
          isNull(noShowEvents.clearedAt),
          isNull(noShowEvents.absentConfirmedAt)
        )
      );
  }
  return { attended: checkedIn, absent: wasOut.length };
}

/** Clear a user's no-show for a date (retroactive check-in or admin). */
export async function clearNoShow(
  userId: string,
  date: string,
  clearedBy: string
): Promise<void> {
  const events = await db
    .select()
    .from(noShowEvents)
    .where(
      and(
        eq(noShowEvents.userId, userId),
        eq(noShowEvents.date, date),
        isNull(noShowEvents.clearedAt)
      )
    );
  for (const ev of events) {
    await db
      .update(noShowEvents)
      .set({ clearedAt: new Date(), clearedBy })
      .where(eq(noShowEvents.id, ev.id));
    await db
      .update(bookings)
      .set({ noShow: false })
      .where(eq(bookings.id, ev.bookingId));
  }
}

export async function clearAllNoShows(userId: string, adminId: string): Promise<number> {
  const events = await db
    .select()
    .from(noShowEvents)
    .where(and(eq(noShowEvents.userId, userId), isNull(noShowEvents.clearedAt)));
  for (const ev of events) {
    await db
      .update(noShowEvents)
      .set({ clearedAt: new Date(), clearedBy: adminId })
      .where(eq(noShowEvents.id, ev.id));
    await db
      .update(bookings)
      .set({ noShow: false })
      .where(eq(bookings.id, ev.bookingId));
  }
  return events.length;
}

/**
 * The escalation ladder. Runs daily (after markNoShowsForDate).
 * 1st/2nd no-show: nothing. At threshold: one ask-don't-accuse email linking
 * to a page where they tick the days they were in. After that: flag to
 * admins, no more emails. Never more than one email per person per cooldown
 * window.
 *
 * Only days no email has named yet count toward the threshold, and only
 * those go in the email. A member who rightly left a day alone was asked
 * about it again the next month, and reasonably read that as nobody having
 * looked at their answer.
 */
export async function runNoShowLadder(): Promise<{
  emailed: string[];
  flagged: string[];
}> {
  const cfg = await getSettings();
  const since = addDays(todayAms(), -cfg.noshow_window_days);
  const unasked = and(
    isNull(noShowEvents.clearedAt),
    isNull(noShowEvents.absentConfirmedAt),
    isNull(noShowEvents.askedAt),
    gte(noShowEvents.date, since)
  );

  const counts = await db
    .select({
      userId: noShowEvents.userId,
      // Days, not bookings: a morning and an afternoon missed is one day.
      n: sql<number>`count(distinct ${noShowEvents.date})::int`,
    })
    .from(noShowEvents)
    .where(unasked)
    .groupBy(noShowEvents.userId);

  const emailed: string[] = [];
  const flagged: string[] = [];

  for (const { userId, n } of counts) {
    if (n < cfg.noshow_threshold) continue;
    const [user] = await db.select().from(users).where(eq(users.id, userId));
    if (!user || user.status === "inactive") continue;

    const cooldownMs = cfg.noshow_email_cooldown_days * 24 * 60 * 60 * 1000;
    const recentlyEmailed =
      user.lastNoshowEmailAt &&
      Date.now() - user.lastNoshowEmailAt.getTime() < cooldownMs;

    if (recentlyEmailed || user.noshowEmailOptOut) {
      // Continues past the email (or opted out): a human conversation, not a retry.
      flagged.push(userId);
      continue;
    }

    const events = await db
      .select()
      .from(noShowEvents)
      .where(and(eq(noShowEvents.userId, userId), unasked))
      .orderBy(desc(noShowEvents.date));
    const dates = [...new Set(events.map((e) => e.date))];
    if (user.lastNoshowEmailAt) {
      // They've had the "were you there?" email already, so asking it again
      // reads as if nobody read their answer. Someone still booking week
      // after week is almost always coming in and not scanning.
      await sendRepeatNoShowEmail(user.id, user.email, user.name, dates);
    } else {
      await sendNoShowEmail(user.id, user.email, user.name, dates);
    }
    const now = new Date();
    await db
      .update(noShowEvents)
      .set({ askedAt: now })
      .where(inArray(noShowEvents.id, events.map((e) => e.id)));
    await db
      .update(users)
      .set({ lastNoshowEmailAt: now })
      .where(eq(users.id, userId));
    emailed.push(userId);
  }
  return { emailed, flagged };
}

/** The one page both emails lead to: every open day, one save. */
export function missedPath(userId: string): string {
  const exp = new Date(Date.now() + LINK_DAYS * 24 * 60 * 60 * 1000);
  return `/missed/${makeToken("missed", userId, exp)}`;
}

function missedUrl(userId: string): string {
  return `${appUrl()}${missedPath(userId)}`;
}

function optoutUrl(userId: string): string {
  const exp = new Date(Date.now() + LINK_DAYS * 24 * 60 * 60 * 1000);
  return `${appUrl()}/optout/${makeToken("optout", userId, exp)}`;
}

/** The days as a list, cut short before the email turns into a calendar. */
function dayList(dates: string[]): string {
  const shown = dates.slice(0, 10);
  const more = dates.length - shown.length;
  return `<ul>${shown.map((d) => `<li>${formatDayLong(d)}</li>`).join("")}${
    more > 0 ? `<li>and ${more} earlier day${more === 1 ? "" : "s"}</li>` : ""
  }</ul>`;
}

async function sendNoShowEmail(
  userId: string,
  email: string,
  name: string,
  dates: string[]
): Promise<void> {
  await sendEmail({
    to: email,
    subject: "Were you at the office on these days?",
    kind: "noshow_question",
    html: `<p>Hi ${name},</p>
<p>Our records show desks booked in your name on these days, but no check-in on any of them:</p>
${dayList(dates)}
<p>That's very possibly our system rather than you. <strong>Were you actually there?</strong> Tick the days you came, all on one page, and we'll fix the record:</p>
<p>${btn(missedUrl(userId), "Choose the days you were in")}</p>
<p style="font-size:13px;color:#888;">Any day you leave unticked we'll take as one you weren't in, and we won't ask about it again.</p>
<p><strong>Plans changed?</strong> Totally fine, and no need to explain. If you could cancel next time, it frees the desk for someone else — there's a cancel link in every booking email, and it takes one tap. With only eight desks it makes a real difference.</p>
<p>Thanks,<br>The EA Netherlands team</p>
<p style="font-size:13px;color:#888;">${link(optoutUrl(userId), "Don't email me about check-ins again")}</p>`,
  });
}

/** Second and later emails: only days since the last one, and about the scan, not the visit. */
async function sendRepeatNoShowEmail(
  userId: string,
  email: string,
  name: string,
  dates: string[]
): Promise<void> {
  await sendEmail({
    to: email,
    subject: "A quick one about checking in",
    kind: "noshow_repeat",
    html: `<p>Hi ${name},</p>
<p>Since we last wrote there are <strong>${dates.length} more days</strong> with a desk booked in your name and no check-in:</p>
${dayList(dates)}
<p>You keep booking, so our guess is you're here and the scan just isn't happening — which is easy to forget, and not a problem.</p>
<p><strong>Were you in?</strong> Tick the days you came, all on one page, and we'll fix the record:</p>
<p>${btn(missedUrl(userId), "Choose the days you were in")}</p>
<p style="font-size:13px;color:#888;">Any day you leave unticked we'll take as one you weren't in, and we won't ask about it again.</p>
<p><strong>Why it matters:</strong> check-ins are how we show our funders the office gets used. A visit without one doesn't count, so the scan genuinely helps keep the desks funded. It's the QR code by the door — two taps once you're logged in. If something gets in the way (it logs you out, the code won't scan), tell us and we'll fix that instead of emailing you about it.</p>
<p><strong>Not coming on a day?</strong> Cancel from the booking email or ${link(`${appUrl()}/me`, "your bookings")} so someone else can have the desk.</p>
<p>Thanks,<br>The EA Netherlands team</p>
<p style="font-size:13px;color:#888;">${link(optoutUrl(userId), "Don't email me about check-ins again")}</p>`,
  });
}

/** Users currently past the threshold, for the admin flag list. */
export async function flaggedUsers(): Promise<
  { userId: string; name: string; email: string; count: number; emailedAt: Date | null; optedOut: boolean }[]
> {
  const cfg = await getSettings();
  const since = addDays(todayAms(), -cfg.noshow_window_days);
  const rows = await db
    .select({
      userId: noShowEvents.userId,
      name: users.name,
      email: users.email,
      n: sql<number>`count(*)::int`,
      emailedAt: users.lastNoshowEmailAt,
      optedOut: users.noshowEmailOptOut,
    })
    .from(noShowEvents)
    .innerJoin(users, eq(users.id, noShowEvents.userId))
    .where(and(isNull(noShowEvents.clearedAt), gte(noShowEvents.date, since)))
    .groupBy(
      noShowEvents.userId,
      users.name,
      users.email,
      users.lastNoshowEmailAt,
      users.noshowEmailOptOut
    );
  return rows
    .filter((r) => r.n >= cfg.noshow_threshold)
    .map((r) => ({
      userId: r.userId,
      name: r.name,
      email: r.email,
      count: r.n,
      emailedAt: r.emailedAt,
      optedOut: r.optedOut,
    }));
}

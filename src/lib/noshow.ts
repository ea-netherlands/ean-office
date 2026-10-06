import { db, bookings, checkins, noShowEvents, users } from "@/db";
import { and, eq, gte, isNull, sql, inArray, desc } from "drizzle-orm";
import { newId } from "./ids";
import { getSettings } from "./settings";
import { addDays, formatDay, formatDayLong, todayAms } from "./dates";
import { sendEmail, btn, link } from "./email";
import { makeToken } from "./tokens";
import { appUrl } from "./auth";

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

/** Uncleared no-shows within the rolling window, per user. */
export async function unclearedNoShows(userId: string, windowDays: number) {
  const since = addDays(todayAms(), -windowDays);
  return db
    .select()
    .from(noShowEvents)
    .where(
      and(
        eq(noShowEvents.userId, userId),
        isNull(noShowEvents.clearedAt),
        gte(noShowEvents.date, since)
      )
    )
    .orderBy(desc(noShowEvents.date));
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
 * 1st/2nd no-show: nothing. At threshold: one ask-don't-accuse email with
 * retroactive check-in links. After that: flag to admins, no more emails.
 * Never more than one email per person per cooldown window.
 */
export async function runNoShowLadder(): Promise<{
  emailed: string[];
  flagged: string[];
}> {
  const cfg = await getSettings();
  const since = addDays(todayAms(), -cfg.noshow_window_days);

  const counts = await db
    .select({
      userId: noShowEvents.userId,
      n: sql<number>`count(*)::int`,
    })
    .from(noShowEvents)
    .where(and(isNull(noShowEvents.clearedAt), gte(noShowEvents.date, since)))
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

    const events = await unclearedNoShows(userId, cfg.noshow_window_days);
    if (user.lastNoshowEmailAt) {
      // They've had the "were you there?" email already, so asking it again
      // reads as if nobody read their answer. Someone still booking week
      // after week is almost always coming in and not scanning.
      await sendRepeatNoShowEmail(
        user.id,
        user.email,
        user.name,
        events.map((e) => e.date),
        cfg.noshow_window_days
      );
    } else {
      const dates = events.slice(0, 3).map((e) => e.date);
      await sendNoShowEmail(user.id, user.email, user.name, dates);
    }
    await db
      .update(users)
      .set({ lastNoshowEmailAt: new Date() })
      .where(eq(users.id, userId));
    emailed.push(userId);
  }
  return { emailed, flagged };
}

async function sendNoShowEmail(
  userId: string,
  email: string,
  name: string,
  dates: string[]
): Promise<void> {
  // Retro links stay valid for 30 days — the email may sit unread for a while.
  const exp = new Date(Date.now() + 30 * 24 * 60 * 60 * 1000);
  const dayButtons = dates
    .map((d) =>
      btn(`${appUrl()}/retro/${makeToken("retro", `${userId}:${d}`, exp)}`, formatDay(d))
    )
    .join(" ");
  const optoutUrl = `${appUrl()}/optout/${makeToken("optout", userId, exp)}`;
  const datesText = dates.map(formatDayLong).join(", ");

  await sendEmail({
    to: email,
    subject: "Were you at the office on these days?",
    kind: "noshow_question",
    html: `<p>Hi ${name},</p>
<p>Our records show desks booked in your name on ${datesText}, but no check-in on any of them. That's very possibly our system rather than you —</p>
<p><strong>Were you actually there?</strong> Tap the days you came and we'll fix the record:</p>
<p>${dayButtons}</p>
<p><strong>Plans changed?</strong> Totally fine, and no need to explain. If you could cancel next time, it frees the desk for someone else — there's a cancel link in every booking email, and it takes one tap. With only eight desks it makes a real difference.</p>
<p>Thanks,<br>The EA Netherlands team</p>
<p style="font-size:13px;color:#888;">${link(optoutUrl, "Don't email me about check-ins again")}</p>`,
  });
}

/** Second and later emails: same retro links, but about the scan, not the visit. */
async function sendRepeatNoShowEmail(
  userId: string,
  email: string,
  name: string,
  dates: string[],
  windowDays: number
): Promise<void> {
  const exp = new Date(Date.now() + 30 * 24 * 60 * 60 * 1000);
  // Enough buttons to clear a regular's backlog in one go, not so many the
  // email turns into a calendar.
  const shown = dates.slice(0, 10);
  const dayButtons = shown
    .map((d) =>
      btn(`${appUrl()}/retro/${makeToken("retro", `${userId}:${d}`, exp)}`, formatDay(d))
    )
    .join(" ");
  const more =
    dates.length > shown.length
      ? `<p style="font-size:13px;color:#888;">Plus ${dates.length - shown.length} earlier day${dates.length - shown.length === 1 ? "" : "s"} — mention them to any of us and we'll sort it.</p>`
      : "";
  const optoutUrl = `${appUrl()}/optout/${makeToken("optout", userId, exp)}`;
  const weeks = Math.round(windowDays / 7);

  await sendEmail({
    to: email,
    subject: "A quick one about checking in",
    kind: "noshow_repeat",
    html: `<p>Hi ${name},</p>
<p>In the last ${weeks} weeks there are <strong>${dates.length} days</strong> with a desk booked in your name and no check-in. You keep booking, so our guess is you're here and the scan just isn't happening — which is easy to forget, and not a problem.</p>
<p><strong>Were you in?</strong> Tap the days you came and we'll fix the record:</p>
<p>${dayButtons}</p>
${more}
<p><strong>Why it matters:</strong> check-ins are how we show our funders the office gets used. A visit without one doesn't count, so the scan genuinely helps keep the desks funded. It's the QR code by the door — two taps once you're logged in. If something gets in the way (it logs you out, the code won't scan), tell us and we'll fix that instead of emailing you about it.</p>
<p><strong>Not coming on a day?</strong> Cancel from the booking email or ${link(`${appUrl()}/me`, "your bookings")} so someone else can have the desk.</p>
<p>Thanks,<br>The EA Netherlands team</p>
<p style="font-size:13px;color:#888;">${link(optoutUrl, "Don't email me about check-ins again")}</p>`,
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

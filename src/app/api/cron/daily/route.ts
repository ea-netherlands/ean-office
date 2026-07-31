import { NextRequest } from "next/server";
import {
  db,
  bookings,
  users,
  visitRequests,
  checkins,
  ensureMigrated,
} from "@/db";
import { and, eq, lt, inArray, isNull } from "drizzle-orm";
import {
  addDays,
  amsDate,
  formatDayLong,
  isWorkingDay,
  isoWeekday,
  todayAms,
  workingDaysBetween,
} from "@/lib/dates";
import { markNoShowsForDate, runNoShowLadder, flaggedUsers } from "@/lib/noshow";
import { getSettings } from "@/lib/settings";
import { getReport } from "@/lib/reports";
import { sendEmail, link } from "@/lib/email";
import { cancelUrl } from "@/lib/booking";
import { appUrl } from "@/lib/auth";

// The one daily job. Schedule for 08:00 Europe/Amsterdam (06:00 UTC in
// summer). Idempotent — safe to run twice.
export async function GET(request: NextRequest) {
  await ensureMigrated();
  const secret = process.env.CRON_SECRET;
  if (secret) {
    const auth = request.headers.get("authorization");
    if (auth !== `Bearer ${secret}`) {
      return new Response("Unauthorized", { status: 401 });
    }
  }

  const today = todayAms();
  const result: Record<string, unknown> = { today };

  // 1. Mark no-shows for the last few days (covers a missed run).
  let marked = 0;
  for (let i = 1; i <= 3; i++) {
    marked += await markNoShowsForDate(addDays(today, -i));
  }
  result.noShowsMarked = marked;

  // 2. The escalation ladder — only on working days (email lands ~09:00 next
  //    working day after the threshold no-show).
  if (isWorkingDay(today)) {
    result.ladder = await runNoShowLadder();
  }

  // 3. Morning reminders for today's bookings.
  const todays = await db
    .select({ b: bookings, u: users })
    .from(bookings)
    .innerJoin(users, eq(users.id, bookings.userId))
    .where(and(eq(bookings.date, today), eq(bookings.status, "booked")));
  let reminders = 0;
  for (const { b, u } of todays) {
    if (b.reminderSentAt) continue;
    await sendEmail({
      to: u.email,
      subject: `You're booked at the office today`,
      kind: "morning_reminder",
      html: `<p>Hi ${u.name},</p>
<p>You're booked for <strong>today, ${formatDayLong(today)}</strong>${b.seatType === "flex" ? " (lunch table)" : ""}. Scan the QR code by the door when you arrive — two taps, and it keeps the office's funding numbers honest.</p>
<p>Can't make it? ${link(cancelUrl(b), "Cancel in one tap")} — no login needed, and it frees the desk for someone else.</p>`,
    });
    await db
      .update(bookings)
      .set({ reminderSentAt: new Date() })
      .where(eq(bookings.id, b.id));
    reminders++;
  }
  result.reminders = reminders;

  // 4. Expire "awaiting reply" requests past the expiry window.
  const cfg = await getSettings();
  const awaiting = await db
    .select()
    .from(visitRequests)
    .where(eq(visitRequests.status, "awaiting_reply"));
  let expired = 0;
  for (const req of awaiting) {
    const asked = req.questionAskedAt ?? req.createdAt;
    if (Date.now() - asked.getTime() > cfg.request_expiry_days * 24 * 60 * 60 * 1000) {
      await db
        .update(visitRequests)
        .set({ status: "expired" })
        .where(eq(visitRequests.id, req.id));
      expired++;
    }
  }
  result.expired = expired;

  // 5. Stale-request reminder to all admins (pending ≥ 2 working days).
  const admins = await db.select().from(users).where(eq(users.role, "admin"));
  const pending = await db
    .select({ req: visitRequests, u: users })
    .from(visitRequests)
    .innerJoin(users, eq(users.id, visitRequests.userId))
    .where(eq(visitRequests.status, "pending"));
  const stale = pending.filter(
    (p) =>
      workingDaysBetween(amsDate(p.req.createdAt), today) >= 2 &&
      (!p.req.staleReminderSentAt ||
        Date.now() - p.req.staleReminderSentAt.getTime() > 24 * 60 * 60 * 1000)
  );
  if (stale.length > 0 && isWorkingDay(today)) {
    const list = stale
      .map((s) => `<li><strong>${s.u.name}</strong> — asked for ${formatDayLong(s.req.requestedDate)}, waiting since ${formatDayLong(amsDate(s.req.createdAt))}</li>`)
      .join("");
    for (const admin of admins) {
      await sendEmail({
        to: admin.email,
        subject: `${stale.length} visit request${stale.length === 1 ? "" : "s"} waiting over two working days`,
        kind: "admin_stale_requests",
        html: `<p>These requests have been waiting longer than the one-working-day promise:</p>
<ul>${list}</ul>
<p>${link(`${appUrl()}/admin/requests`, "Open the queue")} — any admin can decide.</p>`,
      });
    }
    for (const s of stale) {
      await db
        .update(visitRequests)
        .set({ staleReminderSentAt: new Date() })
        .where(eq(visitRequests.id, s.req.id));
    }
  }
  result.staleReminded = stale.length;

  // 6. Weekly admin digest on Mondays.
  if (isoWeekday(today) === 1) {
    const weekReport = await getReport(addDays(today, -7), addDays(today, -1));
    const flagged = await flaggedUsers();
    const trialsEnding = await db.select().from(users).where(eq(users.status, "trial"));
    const endingSoon = trialsEnding.filter(
      (u) => u.trialEndsAt && u.trialEndsAt <= addDays(today, 14)
    );
    for (const admin of admins) {
      await sendEmail({
        to: admin.email,
        subject: `Office week in review — ${Math.round(weekReport.occupancyAttended * 100)}% attended occupancy`,
        kind: "admin_weekly_digest",
        html: `<p>Last week at the office:</p>
<ul>
<li><strong>${weekReport.visitsAttended}</strong> visits (${weekReport.visitsBooked} booked)</li>
<li>Occupancy: <strong>${Math.round(weekReport.occupancyBooked * 100)}%</strong> booked, <strong>${Math.round(weekReport.occupancyAttended * 100)}%</strong> attended (of 8 desks)</li>
<li>Check-in rate: <strong>${Math.round(weekReport.checkinRate * 100)}%</strong> (target ${Math.round(cfg.checkin_rate_target * 100)}%${weekReport.checkinRate < cfg.checkin_rate_target ? " — below target, fix it in the room: a reminder at lunch, a bigger sticker" : ""})</li>
<li>Open visit requests: <strong>${pending.length}</strong>${stale.length > 0 ? ` (${stale.length} stale)` : ""}</li>
${flagged.length > 0 ? `<li>No-show flags needing a human conversation: <strong>${flagged.map((f) => f.name).join(", ")}</strong></li>` : ""}
${endingSoon.length > 0 ? `<li>Trials ending within two weeks: <strong>${endingSoon.map((u) => u.name).join(", ")}</strong></li>` : ""}
</ul>
<p>${link(`${appUrl()}/admin/reports`, "Full reports")}</p>`,
      });
    }
    result.weeklyDigest = true;
  }

  // 7. GDPR: purge check-in records past the retention window.
  const purgeBefore = addDays(today, -Math.round(cfg.checkin_retention_months * 30.44));
  const purged = await db
    .delete(checkins)
    .where(lt(checkins.date, purgeBefore))
    .returning();
  result.purgedCheckins = purged.length;

  return Response.json(result);
}

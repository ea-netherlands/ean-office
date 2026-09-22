import { NextRequest } from "next/server";
import {
  db,
  bookings,
  users,
  visitRequests,
  checkins,
  events,
  eventGuests,
  ensureMigrated,
} from "@/db";
import { and, asc, count, eq, lt, inArray, isNull } from "drizzle-orm";
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
import { cancelUrl, describeSeat, deskWhere, releaseUrl } from "@/lib/booking";
import { asSlot, SLOT_LABEL, slotSuffix, slotWindow } from "@/lib/slots";
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
  const cfg = await getSettings();
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
    const slot = asSlot(b.slot);
    // A day only half-used is the commonest quiet waste of a desk, so give
    // full-day bookers a one-tap way to hand back the afternoon.
    const releaseNote =
      slot === "day"
        ? `<p><strong>Only here this morning?</strong> ${link(releaseUrl(b), "Free up your afternoon")} — you keep the desk until lunch and someone else can use it after.</p>`
        : "";
    const seat = `${describeSeat(b)}${deskWhere(b, cfg)}`;
    await sendEmail({
      to: u.email,
      subject: `Today at the office${slotSuffix(slot)} — ${describeSeat(b)}`,
      kind: "morning_reminder",
      html: `<p>Hi ${u.name},</p>
<p>You're booked for <strong>today, ${formatDayLong(today)}</strong>${slot === "day" ? "" : ` (${SLOT_LABEL[slot]}, ${slotWindow(slot, cfg)})`}, and you have <strong>${seat}</strong>. Scan the QR code by the door when you arrive — two taps, and it keeps the office's funding numbers honest.</p>
${releaseNote}
<p>Can't make it? ${link(cancelUrl(b), "Cancel in one tap")} — no login needed, and it frees the desk for someone else.</p>
<p><strong>Something else to change?</strong> ${link(`${appUrl()}/me`, "Open your bookings")} — free up a morning or an afternoon, switch desks, and see every other day you've booked.</p>`,
    });
    await db
      .update(bookings)
      .set({ reminderSentAt: new Date() })
      .where(eq(bookings.id, b.id));
    reminders++;
  }
  result.reminders = reminders;

  // 4. Expire "awaiting reply" requests past the expiry window.
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

  // 5b. Trial visits whose day has passed but nobody's admitted or declined
  // them yet — same daily-nag cadence as stale requests, since a trial
  // member can't book anything further until this is resolved.
  const trialMembers = await db.select().from(users).where(eq(users.status, "trial"));
  const trialsToDecide = trialMembers.filter(
    (u) =>
      u.trialDate &&
      u.trialDate <= today &&
      (!u.trialReminderSentAt || Date.now() - u.trialReminderSentAt.getTime() > 24 * 60 * 60 * 1000)
  );
  if (trialsToDecide.length > 0 && isWorkingDay(today)) {
    const list = trialsToDecide
      .map((u) => `<li><strong>${u.name}</strong> — visited ${formatDayLong(u.trialDate!)}</li>`)
      .join("");
    for (const admin of admins) {
      await sendEmail({
        to: admin.email,
        subject: `${trialsToDecide.length} trial visit${trialsToDecide.length === 1 ? "" : "s"} waiting on a decision`,
        kind: "admin_trial_decisions",
        html: `<p>These trial visits have happened — admit or decline them at ${link(`${appUrl()}/admin/members`, "/admin/members")}:</p>
<ul>${list}</ul>`,
      });
    }
    for (const u of trialsToDecide) {
      await db.update(users).set({ trialReminderSentAt: new Date() }).where(eq(users.id, u.id));
    }
  }
  result.trialsToDecide = trialsToDecide.length;

  // 6. Weekly admin digest on Mondays.
  if (isoWeekday(today) === 1) {
    const weekReport = await getReport(addDays(today, -7), addDays(today, -1));
    const flagged = await flaggedUsers();
    const awaitingDecision = trialMembers.filter((u) => u.trialDate && u.trialDate <= today);
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
${awaitingDecision.length > 0 ? `<li>Trial visits awaiting a decision: <strong>${awaitingDecision.map((u) => u.name).join(", ")}</strong></li>` : ""}
</ul>
<p>${link(`${appUrl()}/admin/reports`, "Full reports")}</p>`,
      });
    }
    result.weeklyDigest = true;
  }

  // 7. Mirror the Luma calendar so events don't need manual entry.
  try {
    const { syncLuma } = await import("@/lib/luma");
    result.luma = await syncLuma();
  } catch (err) {
    result.luma = { ok: false, error: String(err) };
  }

  // 8. GDPR: purge check-in records past the retention window.
  const purgeBefore = addDays(today, -Math.round(cfg.checkin_retention_months * 30.44));
  const purged = await db
    .delete(checkins)
    .where(lt(checkins.date, purgeBefore))
    .returning();
  result.purgedCheckins = purged.length;

  // 9. GDPR: bulk-imported rows nobody ever claimed don't earn indefinite
  // retention just for sitting on an old spreadsheet.
  const importPurgeBefore = new Date();
  importPurgeBefore.setFullYear(importPurgeBefore.getFullYear() - 1);
  const purgedImports = await db
    .delete(users)
    .where(
      and(
        eq(users.status, "imported"),
        isNull(users.claimedAt),
        lt(users.createdAt, importPurgeBefore)
      )
    )
    .returning();
  result.purgedUnclaimedImports = purgedImports.length;

  // 10. Nudge yesterday's approved event guests to apply as a regular.
  const yesterday = addDays(today, -1);
  const dueGuests = await db
    .select({ g: eventGuests, u: users, e: events })
    .from(eventGuests)
    .innerJoin(users, eq(users.id, eventGuests.userId))
    .innerJoin(events, eq(events.id, eventGuests.eventId))
    .where(
      and(
        eq(eventGuests.status, "approved"),
        eq(events.date, yesterday),
        isNull(eventGuests.nudgeSentAt)
      )
    );
  let eventGuestNudges = 0;
  for (const { g, u, e } of dueGuests) {
    if (u.status === "trial" || u.status === "active") {
      // Already a regular by the time the event happened — nothing to nudge.
      await db.update(eventGuests).set({ nudgeSentAt: new Date() }).where(eq(eventGuests.id, g.id));
      continue;
    }
    await sendEmail({
      to: u.email,
      subject: "Come back any time — join as a regular",
      kind: "event_guest_nudge",
      html: `<p>Hi ${u.name},</p>
<p>Hope you enjoyed <strong>${e.title}</strong>! If you'd like to work from the office more regularly — any weekday, not just event days — you can ${link(`${appUrl()}/join`, "apply for a desk")}.</p>`,
    });
    await db.update(eventGuests).set({ nudgeSentAt: new Date() }).where(eq(eventGuests.id, g.id));
    eventGuestNudges++;
  }
  result.eventGuestNudges = eventGuestNudges;

  // 10b. The one-off "your profile is bare" nudge.
  //
  // One per person, ever — `profile_nudge_sent_at` is the opt-out, and it's
  // set whether or not they act on it. Only people who've actually been here
  // get it: nudging someone about a who's-in profile before they've met
  // anyone is asking a stranger to introduce themselves to a room they
  // haven't walked into. Capped per run so a first deploy against an
  // established membership doesn't send two hundred emails in one go.
  const NUDGE_PER_RUN = 20;
  let profileNudges = 0;
  if (isWorkingDay(today)) {
    // Oldest members first, so the queue drains in a stable order rather
    // than whatever Postgres hands back.
    const candidates = await db
      .select()
      .from(users)
      .where(and(eq(users.status, "active"), isNull(users.profileNudgeSentAt)))
      .orderBy(asc(users.createdAt))
      .limit(200);

    // Two visits is the bar: enough that faces in the who's-in list mean
    // something to them, and that this doesn't reach someone who joined last
    // week and hasn't been in yet. One grouped read rather than one per
    // candidate — in production each of those is a hop to Neon.
    const visitCounts = new Map<string, number>();
    if (candidates.length > 0) {
      for (const row of await db
        .select({ userId: checkins.userId, n: count() })
        .from(checkins)
        .where(
          inArray(
            checkins.userId,
            candidates.map((u) => u.id)
          )
        )
        .groupBy(checkins.userId)) {
        visitCounts.set(row.userId, Number(row.n));
      }
    }

    for (const u of candidates) {
      if (profileNudges >= NUDGE_PER_RUN) break;
      const hasPhoto = !!u.avatarUpdatedAt;
      const gaps = [
        !hasPhoto ? "a photo" : "",
        !u.bio ? "what you're working on" : "",
        !u.expertise ? "what to ask you about" : "",
      ].filter(Boolean);
      if (gaps.length === 0) {
        // Nothing to nudge about — mark it so they're never considered again.
        await db
          .update(users)
          .set({ profileNudgeSentAt: new Date() })
          .where(eq(users.id, u.id));
        continue;
      }
      if ((visitCounts.get(u.id) ?? 0) < 2) continue;

      await sendEmail({
        to: u.email,
        subject: "Put a face to your name at the office",
        kind: "profile_nudge",
        html: `<p>Hi ${u.name},</p>
<p>When you book a desk, the booking page shows who else is in that day. It works much better when people have filled theirs in — it's how you spot that the person two desks over works on the thing you've been stuck on.</p>
<p>Yours is missing ${gaps.length > 1 ? `${gaps.slice(0, -1).join(", ")} and ${gaps[gaps.length - 1]}` : gaps[0]}. It takes about a minute: ${link(`${appUrl()}/me`, "add yours")}.</p>
<p>Entirely optional, and it's visible to other members only — never on the public web, and never to funders. This is the only email we'll send you about it.</p>`,
      });
      await db
        .update(users)
        .set({ profileNudgeSentAt: new Date() })
        .where(eq(users.id, u.id));
      profileNudges++;
    }
  }
  result.profileNudges = profileNudges;

  // 11. GDPR: one-off event guests who never came back don't earn
  // indefinite retention either — same one-year window as unclaimed imports.
  const guestPurgeBefore = new Date();
  guestPurgeBefore.setFullYear(guestPurgeBefore.getFullYear() - 1);
  const purgedGuests = await db
    .delete(users)
    .where(and(eq(users.status, "event_guest"), lt(users.createdAt, guestPurgeBefore)))
    .returning();
  result.purgedEventGuests = purgedGuests.length;

  return Response.json(result);
}

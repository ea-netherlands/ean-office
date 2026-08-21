// Members asking for a desk for someone who has no account.
//
// Two flavours, and the difference is the whole design:
//   one_off      — "my colleague is joining me on Tuesday". The guest is the
//                  host's party for the day. They get an account only so the
//                  desk map, check-in and reports work, and nothing follows.
//   first_visit  — "I'm bringing someone who might join". This IS a trial
//                  visit, so approving it lands the guest in exactly the same
//                  trial → admit/decline flow as a /join request, and the
//                  co-working-day exclusivity rule applies just as it does
//                  there. A one-off is exempt: the host already has the day.

import { db, users, bookings, guestRequests } from "@/db";
import { and, eq, inArray } from "drizzle-orm";
import { newId } from "./ids";
import { getSettings } from "./settings";
import { bookDay, coworkingDayOn } from "./booking";
import { findUserByEmail } from "./users";
import { sendEmail, link } from "./email";
import { appUrl } from "./auth";
import { formatDayLong, todayAms, addDays, isWorkingDay } from "./dates";
import { SLOT_LABEL, type Slot } from "./slots";

export type GuestRequestInput = {
  guestName: string;
  guestEmail: string;
  date: string;
  /** Omit for a single day; set to span every working day up to it. */
  endDate?: string;
  slot: Slot;
  visitType: "one_off" | "first_visit";
  reason: string;
};

export type GuestRequestResult =
  | { ok: true; id: string }
  | { ok: false; error: string; field?: string };

/** How far ahead a member may request a guest — same horizon as a block. */
function horizonFor(blockHorizonWeeks: number): string {
  return addDays(todayAms(), blockHorizonWeeks * 7);
}

function whenLabel(date: string, slot: Slot, endDate?: string | null): string {
  const range = endDate
    ? `${formatDayLong(date)} to ${formatDayLong(endDate)}`
    : formatDayLong(date);
  return slot === "day" ? range : `${range} (${SLOT_LABEL[slot]})`;
}

/** Every working day in an inclusive range — the days a guest block covers. */
function workingDaysIn(from: string, to: string): string[] {
  const out: string[] = [];
  for (let d = from; d <= to; d = addDays(d, 1)) {
    if (isWorkingDay(d)) out.push(d);
  }
  return out;
}

// ---------- member side ----------

export async function createGuestRequest(
  host: { id: string; name: string; email: string },
  input: GuestRequestInput
): Promise<GuestRequestResult> {
  const cfg = await getSettings();
  const today = todayAms();
  const guestName = input.guestName.trim();
  const guestEmail = input.guestEmail.trim().toLowerCase();
  const reason = input.reason.trim();

  if (!guestName) return { ok: false, error: "Who are you bringing?", field: "guestName" };
  if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(guestEmail)) {
    return { ok: false, error: "That doesn't look like an email address.", field: "guestEmail" };
  }
  if (!reason) {
    return {
      ok: false,
      error: "Please say why you're bringing them — it's what the team reads.",
      field: "reason",
    };
  }
  if (!/^\d{4}-\d{2}-\d{2}$/.test(input.date) || input.date <= today) {
    return { ok: false, error: "Please pick a day in the future.", field: "date" };
  }
  if (!isWorkingDay(input.date)) {
    return { ok: false, error: "The office is open on weekdays only.", field: "date" };
  }
  if (input.date > horizonFor(cfg.block_horizon_weeks)) {
    return {
      ok: false,
      error: `That's further ahead than we take bookings — pick a day before ${formatDayLong(horizonFor(cfg.block_horizon_weeks))}.`,
      field: "date",
    };
  }

  // A stretch of days is for one-off guests only — a first visit is a trial,
  // and a trial is a single day by definition.
  const endDate = input.endDate?.trim() || undefined;
  if (endDate) {
    if (input.visitType === "first_visit") {
      return {
        ok: false,
        error:
          "A first visit is a single trial day. Ask for one day, or mark this as a one-off visit if they're coming for a stretch.",
        field: "endDate",
      };
    }
    if (!/^\d{4}-\d{2}-\d{2}$/.test(endDate) || endDate < input.date) {
      return { ok: false, error: "The last day is before the first.", field: "endDate" };
    }
    if (endDate > horizonFor(cfg.block_horizon_weeks)) {
      return {
        ok: false,
        error: `That runs past how far ahead we take bookings — end it before ${formatDayLong(horizonFor(cfg.block_horizon_weeks))}.`,
        field: "endDate",
      };
    }
    if (workingDaysIn(input.date, endDate).length === 0) {
      return {
        ok: false,
        error: "There are no working days in that range.",
        field: "endDate",
      };
    }
  }

  // A first visit is a trial, so it inherits /join's co-working rule. A one-off
  // guest is the host's own party and may come along to whatever's on.
  if (input.visitType === "first_visit") {
    const coworking = await coworkingDayOn(input.date);
    if (coworking) {
      return {
        ok: false,
        error: `${formatDayLong(input.date)} has the whole office out for "${coworking.title}" — a first visit needs an ordinary day, so please pick another.`,
        field: "date",
      };
    }
  }

  // Alias-aware: someone who can already book shouldn't be requested for.
  const existing = await findUserByEmail(guestEmail);
  if (existing && (existing.status === "trial" || existing.status === "active")) {
    return {
      ok: false,
      error: `${existing.name} is already a member — they can book their own desk.`,
      field: "guestEmail",
    };
  }

  const open = await db
    .select()
    .from(guestRequests)
    .where(
      and(
        eq(guestRequests.guestEmail, guestEmail),
        eq(guestRequests.date, input.date),
        eq(guestRequests.status, "pending")
      )
    );

  if (open.length > 0) {
    return {
      ok: false,
      error: "There's already a request in for that person on that day.",
      field: "guestEmail",
    };
  }

  const id = newId("gr");
  await db.insert(guestRequests).values({
    id,
    hostUserId: host.id,
    guestName,
    guestEmail,
    date: input.date,
    endDate: endDate ?? null,
    slot: input.slot,
    visitType: input.visitType,
    reason,
    status: "pending",
  });

  await sendEmail({
    to: host.email,
    subject: `We got your request to bring ${guestName}`,
    kind: "guest_request_ack",
    html: `<p>Hi ${host.name},</p>
<p>Thanks — we've got your request to bring <strong>${guestName}</strong> on <strong>${whenLabel(input.date, input.slot, endDate)}</strong>.</p>
<p>A real person reads every one of these. Someone from the team will look at it within one working day, and you'll hear either way. We won't contact ${guestName} until it's approved.</p>`,
  });

  const admins = await db.select().from(users).where(eq(users.role, "admin"));
  const pending = await db
    .select()
    .from(guestRequests)
    .where(eq(guestRequests.status, "pending"));
  for (const admin of admins) {
    await sendEmail({
      to: admin.email,
      subject: `${host.name} wants to bring ${guestName} (${pending.length} open)`,
      kind: "admin_guest_request",
      html: `<p><strong>${host.name}</strong> has asked to bring <strong>${guestName}</strong> (${guestEmail}) on <strong>${whenLabel(input.date, input.slot, endDate)}</strong>${endDate ? ` — ${workingDaysIn(input.date, endDate).length} working days` : ""}.</p>
<p>Kind of visit: <strong>${input.visitType === "first_visit" ? "first visit — would become a trial member" : "one-off guest"}</strong></p>
<p>Why:</p><blockquote>${reason}</blockquote>
<p>${link(`${appUrl()}/admin/requests`, "Open the approval queue")}</p>`,
    });
  }

  return { ok: true, id };
}

// ---------- admin side ----------

export async function approveGuestRequest(
  requestId: string,
  admin: { id: string }
): Promise<{ ok: boolean; error?: string; note?: string }> {
  const cfg = await getSettings();
  const [req] = await db
    .select()
    .from(guestRequests)
    .where(eq(guestRequests.id, requestId));
  if (!req) return { ok: false, error: "Request not found." };
  if (req.status !== "pending") return { ok: false, error: "That request is already decided." };
  if (req.date < todayAms()) return { ok: false, error: "That day has passed." };

  const [host] = await db.select().from(users).where(eq(users.id, req.hostUserId));
  if (!host) return { ok: false, error: "Host not found." };

  // Re-check at decision time — the day may have become a co-working day
  // since the request went in. Same rule as approveRequestAction.
  if (req.visitType === "first_visit") {
    const coworking = await coworkingDayOn(req.date);
    if (coworking) {
      return {
        ok: false,
        error: `${formatDayLong(req.date)} is now a co-working day ("${coworking.title}") — a first visit needs an ordinary day. Decline and ask ${host.name} for another date.`,
      };
    }
  }

  // Reuse an existing dormant account (imported, event_guest, declined…) so we
  // don't create a duplicate for someone already on the mailing list.
  const existing = await findUserByEmail(req.guestEmail);
  if (existing && (existing.status === "trial" || existing.status === "active")) {
    return {
      ok: false,
      error: `${existing.name} is already a member — they can book their own desk.`,
    };
  }

  const guestId = existing?.id ?? newId("usr");
  const firstVisit = req.visitType === "first_visit";
  const values = {
    email: req.guestEmail,
    name: req.guestName,
    role: firstVisit ? ("member" as const) : ("visitor" as const),
    status: firstVisit ? ("trial" as const) : ("event_guest" as const),
    ...(firstVisit
      ? { trialDate: req.date, approvedAt: new Date(), approvedBy: admin.id }
      : {}),
    guidelinesAcceptedAt: new Date(),
  };
  if (existing) {
    await db.update(users).set(values).where(eq(users.id, guestId));
  } else {
    await db.insert(users).values({ id: guestId, ...values });
  }

  // One day, or every working day across the range. Days that can't be taken
  // — full, a holiday, a co-working takeover — are skipped rather than failing
  // the lot, and both emails say exactly which days came back.
  const wanted = req.endDate
    ? workingDaysIn(req.date, req.endDate)
    : [req.date];
  const booked: string[] = [];
  const skipped: string[] = [];
  for (const d of wanted) {
    const res = await bookDay(guestId, d, {
      source: "admin",
      sendConfirmation: false,
      allowWaitlist: false,
      slot: req.slot,
      cfg,
    });
    if (res.ok && !("waitlisted" in res)) booked.push(d);
    else skipped.push(d);
  }
  if (booked.length === 0) {
    return {
      ok: false,
      error:
        wanted.length === 1
          ? "Couldn't seat them — the office is full that day."
          : "Couldn't seat them on any day in that range.",
    };
  }

  await db
    .update(guestRequests)
    .set({
      status: "approved",
      guestUserId: guestId,
      decidedBy: admin.id,
      decidedAt: new Date(),
    })
    .where(eq(guestRequests.id, requestId));

  const when = whenLabel(req.date, req.slot, req.endDate);
  const multi = booked.length > 1;
  const dayList = multi
    ? `<p>${booked.map(formatDayLong).join(" · ")}</p>`
    : "";
  const skippedNote =
    skipped.length > 0
      ? `<p>We couldn't fit ${skipped.length === 1 ? "one day" : `${skipped.length} days`} (${skipped.map(formatDayLong).join(", ")}) — the office was full or given over to a co-working day.</p>`
      : "";

  await sendEmail({
    to: host.email,
    subject: multi
      ? `${req.guestName} is booked in for ${booked.length} days`
      : `${req.guestName} is booked in for ${formatDayLong(booked[0])}`,
    kind: "guest_request_approved_host",
    html: `<p>Hi ${host.name},</p>
<p><strong>${req.guestName}</strong> has a desk for <strong>${when}</strong>. We've emailed them the practical details directly, so you don't need to forward anything.</p>
${dayList}
${skippedNote}
${firstVisit ? `<p>Because you flagged this as a first visit, it counts as their trial day — the team will follow up afterwards about making them a member.</p>` : ""}
<p>${link(`${appUrl()}/book`, "See who else is in")}</p>`,
  });

  await sendEmail({
    to: req.guestEmail,
    subject: multi
      ? `You've got a desk at the EA Netherlands office — ${booked.length} days from ${formatDayLong(booked[0])}`
      : `You've got a desk at the EA Netherlands office — ${formatDayLong(booked[0])}`,
    kind: "guest_request_approved_guest",
    html: `<p>Hi ${req.guestName},</p>
<p>${host.name} has booked you a desk at the EA Netherlands office for <strong>${when}</strong>, and you're all set — there's nothing you need to do in advance.</p>
${dayList}
${skippedNote}
<p>We're at <strong>${cfg.office_address}</strong></p>
${firstVisit ? `<p>This works as a trial day: come and see whether the space is a good fit. Afterwards someone from the team will be in touch about joining properly.</p>` : `<p>You're coming along as ${host.name}'s guest for the day.</p>`}
<p>Practical bits — getting in, lunch, wifi: ${link(`${appUrl()}/info`, "office info page")}.</p>
<p>See you there!<br>The EA Netherlands team</p>`,
  });

  return {
    ok: true,
    note: firstVisit
      ? `${req.guestName} is booked and now on trial — admit or decline them after ${formatDayLong(req.date)}.`
      : `${req.guestName} is booked in as a one-off guest for ${booked.length} day${booked.length === 1 ? "" : "s"}${skipped.length > 0 ? ` (${skipped.length} couldn't be fitted)` : ""}.`,
  };
}

export async function declineGuestRequest(
  requestId: string,
  admin: { id: string },
  reason: string
): Promise<{ ok: boolean; error?: string; note?: string }> {
  const [req] = await db
    .select()
    .from(guestRequests)
    .where(eq(guestRequests.id, requestId));
  if (!req) return { ok: false, error: "Request not found." };
  if (req.status !== "pending") return { ok: false, error: "That request is already decided." };

  const [host] = await db.select().from(users).where(eq(users.id, req.hostUserId));

  await db
    .update(guestRequests)
    .set({
      status: "declined",
      decidedBy: admin.id,
      decidedAt: new Date(),
      declineReason: reason.trim() || null,
    })
    .where(eq(guestRequests.id, requestId));

  // Only the host hears about it — the guest was never contacted, and being
  // told you were turned down for something you didn't ask for is no fun.
  if (host) {
    await sendEmail({
      to: host.email,
      subject: `About bringing ${req.guestName} on ${formatDayLong(req.date)}`,
      kind: "guest_request_declined",
      html: `<p>Hi ${host.name},</p>
<p>We're not able to host <strong>${req.guestName}</strong> on <strong>${whenLabel(req.date, req.slot, req.endDate)}</strong>.</p>
${reason.trim() ? `<p>${reason.trim()}</p>` : ""}
<p>We haven't contacted them, so there's nothing awkward to undo on your side. Do get in touch if another day would work.</p>`,
    });
  }

  return { ok: true, note: `Declined — ${host?.name ?? "the host"} has been told.` };
}

/** Pending requests with their host, newest last — for the admin queue. */
export async function openGuestRequests() {
  return db
    .select({ req: guestRequests, host: users })
    .from(guestRequests)
    .innerJoin(users, eq(users.id, guestRequests.hostUserId))
    .where(inArray(guestRequests.status, ["pending"]))
    .orderBy(guestRequests.createdAt);
}

/** A member's own requests, so /me can show what they've asked for. */
export async function guestRequestsByHost(hostId: string) {
  return db
    .select()
    .from(guestRequests)
    .where(eq(guestRequests.hostUserId, hostId))
    .orderBy(guestRequests.date);
}

/** Desks already spoken for on a day, so the form can warn before submitting. */
export async function seatsLeftOn(date: string): Promise<number> {
  const cfg = await getSettings();
  const taken = await db
    .select({ id: bookings.id })
    .from(bookings)
    .where(
      and(
        eq(bookings.date, date),
        eq(bookings.seatType, "desk"),
        inArray(bookings.status, ["booked"])
      )
    );
  return Math.max(0, cfg.desk_count - taken.length);
}

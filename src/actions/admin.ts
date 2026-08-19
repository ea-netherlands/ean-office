"use server";

import { revalidatePath } from "next/cache";
import {
  db,
  users,
  visitRequests,
  bookings,
  checkins,
  noShowEvents,
  sessions,
  events,
  eventAttendance,
} from "@/db";
import { eq } from "drizzle-orm";
import { getCurrentUser, appUrl } from "@/lib/auth";
import { newId } from "@/lib/ids";
import { sendEmail, link } from "@/lib/email";
import { formatDayLong, todayAms } from "@/lib/dates";
import { getSettings, setSetting, Settings } from "@/lib/settings";
import { clearAllNoShows } from "@/lib/noshow";
import { buildIcs } from "@/lib/ics";
import { bookDay, coworkingDayOn } from "@/lib/booking";
import { validateEventHours } from "@/lib/event-hours";
import { isCoworkingDay, validateCoworkingDay } from "@/lib/coworking";
import {
  absorbExistingBookings,
  clearDayForCoworking,
} from "@/lib/coworking-guests";

async function requireAdmin() {
  const user = await getCurrentUser();
  if (!user || user.role !== "admin") throw new Error("Admin only");
  return user;
}

export type AdminActionState = {
  ok?: boolean;
  error?: string;
  /** Something worth telling the admin about what the action just did. */
  note?: string;
};

// ---------- approval queue ----------

export async function approveRequestAction(requestId: string): Promise<AdminActionState> {
  const admin = await requireAdmin();
  const cfg = await getSettings();
  const [req] = await db.select().from(visitRequests).where(eq(visitRequests.id, requestId));
  if (!req) return { error: "Request not found." };
  const [user] = await db.select().from(users).where(eq(users.id, req.userId));
  if (!user) return { error: "User not found." };

  if (req.requestedDate >= todayAms()) {
    const coworking = await coworkingDayOn(req.requestedDate);
    if (coworking) {
      return {
        error: `${formatDayLong(req.requestedDate)} is already booked as a co-working day ("${coworking.title}") — ask ${user.name} to pick a different date before approving.`,
      };
    }
  }

  await db
    .update(visitRequests)
    .set({ status: "approved", decidedBy: admin.id, decidedAt: new Date() })
    .where(eq(visitRequests.id, requestId));
  await db
    .update(users)
    .set({
      role: "member",
      status: "trial",
      trialDate: req.requestedDate,
      approvedAt: new Date(),
      approvedBy: admin.id,
    })
    .where(eq(users.id, user.id));

  // Book their first-visit desk if the day is still ahead.
  if (req.requestedDate >= todayAms()) {
    await bookDay(user.id, req.requestedDate, {
      source: "admin",
      sendConfirmation: false,
      allowWaitlist: false,
    });
  }

  await sendEmail({
    to: user.email,
    subject: `Your trial visit is confirmed — see you ${formatDayLong(req.requestedDate)}`,
    kind: "request_approved",
    html: `<p>Hi ${user.name},</p>
<p>Great news — you're invited for a trial visit at the office on <strong>${formatDayLong(req.requestedDate)}</strong>. Come at <strong>${req.requestedArrival}</strong> and someone will be there to show you around.</p>
<p>Practical bits — address, getting in, lunch, wifi: ${link(`${appUrl()}/info`, "office info page")}. The wifi password is on posters up in the office.</p>
<p>This one day is on us to see if the space is a good fit. Afterwards, someone from the team will follow up to confirm you as a full member — until then you won't be able to book any further days.</p>
<p>See you soon!<br>The EA Netherlands team</p>`,
  });

  // Calendar invite for the host, so welcoming someone is in their day rather
  // than only in the app. Sent to the admin who approved plus the visitor.
  const invite = buildIcs({
    uid: `visit-${req.id}@office.effectiefaltruisme.nl`,
    title: `Welcome ${user.name} to the office`,
    description: `${user.name}'s first visit. They arrive at ${req.requestedArrival}.\n\n${user.about ?? ""}\n\nProfile: ${user.profileUrl ?? "—"}\nWho's in that day: ${appUrl()}/book`,
    location: cfg.office_address,
    date: req.requestedDate,
    startTime: req.requestedArrival,
    durationMinutes: 60,
    organiserEmail: adminEmailFrom(),
    attendeeEmails: [admin.email],
  });
  await sendEmail({
    to: admin.email,
    subject: `Hosting ${user.name} — ${formatDayLong(req.requestedDate)} at ${req.requestedArrival}`,
    kind: "host_calendar_invite",
    html: `<p>You approved <strong>${user.name}</strong>'s first visit, so here's a calendar invite for the welcome.</p>
<p><strong>${formatDayLong(req.requestedDate)} at ${req.requestedArrival}</strong> — accept the attached invite and it'll be in your calendar.</p>
<p>${user.about ? `What they're working on: ${user.about}<br>` : ""}${user.profileUrl ? link(user.profileUrl, "Their profile") : ""}</p>
<p>${link(`${appUrl()}/admin/today`, "Who else is in that day")}</p>`,
    icsAttachment: { filename: "office-visit.ics", content: invite },
  });

  revalidatePath("/admin/requests");
  return { ok: true };
}

/** Bare address for the iCalendar ORGANIZER field. */
function adminEmailFrom(): string {
  const from = process.env.EMAIL_FROM || "office@effectiefaltruisme.nl";
  const match = from.match(/<([^>]+)>/);
  return match ? match[1] : from;
}

export async function declineRequestAction(
  requestId: string,
  reason: string
): Promise<AdminActionState> {
  const admin = await requireAdmin();
  const [req] = await db.select().from(visitRequests).where(eq(visitRequests.id, requestId));
  if (!req) return { error: "Request not found." };
  const [user] = await db.select().from(users).where(eq(users.id, req.userId));
  if (!user) return { error: "User not found." };

  await db
    .update(visitRequests)
    .set({
      status: "declined",
      decidedBy: admin.id,
      decidedAt: new Date(),
      declineReason: reason, // stored, never shown to the requester
    })
    .where(eq(visitRequests.id, requestId));
  await db.update(users).set({ status: "declined" }).where(eq(users.id, user.id));

  await sendEmail({
    to: user.email,
    subject: "About your office visit request",
    kind: "request_declined",
    html: `<p>Hi ${user.name},</p>
<p>Thanks so much for your interest in the EA Netherlands office. We're not able to offer you a spot right now — the space is small and we have to be selective about capacity.</p>
<p>This isn't a judgement on your work, and we'd encourage you to stay involved: EA Netherlands runs regular public events, and the ${link("https://effectiefaltruisme.nl", "community")} is very much open to you.</p>
<p>Warm regards,<br>The EA Netherlands team</p>`,
  });

  revalidatePath("/admin/requests");
  return { ok: true };
}

export async function askQuestionAction(
  requestId: string,
  question: string
): Promise<AdminActionState> {
  await requireAdmin();
  if (!question.trim()) return { error: "Write a question first." };
  const [req] = await db.select().from(visitRequests).where(eq(visitRequests.id, requestId));
  if (!req) return { error: "Request not found." };
  const [user] = await db.select().from(users).where(eq(users.id, req.userId));
  if (!user) return { error: "User not found." };

  await db
    .update(visitRequests)
    .set({ status: "awaiting_reply", questionAskedAt: new Date() })
    .where(eq(visitRequests.id, requestId));

  await sendEmail({
    to: user.email,
    subject: "Quick question about your office visit request",
    kind: "request_question",
    html: `<p>Hi ${user.name},</p>
<p>Thanks for your request to visit the office. Before we confirm, one quick question:</p>
<blockquote style="border-left:3px solid #16879c;padding-left:12px;color:#333;">${question.replace(/</g, "&lt;")}</blockquote>
<p>Just reply to this email and we'll take it from there.</p>
<p>The EA Netherlands team</p>`,
  });

  revalidatePath("/admin/requests");
  return { ok: true };
}

// ---------- members ----------

export async function setMemberStatusAction(
  userId: string,
  status: "trial" | "active" | "inactive"
): Promise<AdminActionState> {
  await requireAdmin();
  const [user] = await db.select().from(users).where(eq(users.id, userId));
  if (!user) return { error: "User not found." };

  await db.update(users).set({ status }).where(eq(users.id, userId));

  // Promoting someone mid-trial is the same decision as "Admit" in the queue,
  // and it's the only route available for a trial whose day hasn't passed —
  // so it tells them too. Reactivating an inactive or previously declined
  // member is a different decision, and stays quiet.
  if (status === "active" && user.status === "trial") {
    await sendAdmittedEmail(user);
  }

  revalidatePath("/admin/members");
  return { ok: true };
}

export async function setMemberRoleAction(
  userId: string,
  role: "member" | "admin"
): Promise<AdminActionState> {
  const admin = await requireAdmin();
  if (role === "member") {
    const admins = await db.select().from(users).where(eq(users.role, "admin"));
    if (admins.length <= 3 && admins.some((a) => a.id === userId)) {
      return {
        error:
          "That would leave fewer than three admins. Promote someone else first — single-admin is the failure mode this app exists to fix.",
      };
    }
    if (userId === admin.id) {
      return { error: "Ask another admin to demote you — you can't do it to yourself." };
    }
  }
  await db.update(users).set({ role, status: role === "admin" ? "active" : undefined }).where(eq(users.id, userId));
  revalidatePath("/admin/members");
  return { ok: true };
}

/**
 * The "you're a member now" note. Shared by both routes an admin can take —
 * "Admit" in the trial queue and "Mark active" on the member row — so it
 * can't matter which button they reach for.
 */
async function sendAdmittedEmail(user: { name: string; email: string }): Promise<void> {
  await sendEmail({
    to: user.email,
    subject: "You're in — the office is yours to book",
    kind: "trial_admitted",
    html: `<p>Hi ${user.name},</p>
<p>Thanks for coming by. We'd love to have you as a member, so you can book desks from now on — ${link(`${appUrl()}/book`, "the booking page")} is open to you. Log in with this address; there's no password.</p>
<p>Worth knowing: book the days you mean to come, and cancel if plans change — the space is small and a held desk nobody uses is a desk someone else needed. Check in with the QR code by the door when you arrive.</p>
<p>See you soon!<br>The EA Netherlands team</p>`,
  });
}

/**
 * After a trial day, an admin admits (full member) or declines them. Both the
 * acknowledgement and the approval email promise a follow-up, so both
 * outcomes send one — being declined by silence is the worst version of this.
 */
export async function resolveTrialAction(
  userId: string,
  outcome: "admit" | "decline"
): Promise<AdminActionState> {
  await requireAdmin();
  const [user] = await db.select().from(users).where(eq(users.id, userId));
  if (!user) return { error: "User not found." };

  await db
    .update(users)
    .set({ status: outcome === "admit" ? "active" : "declined" })
    .where(eq(users.id, userId));

  if (outcome === "admit") {
    await sendAdmittedEmail(user);
  } else {
    await sendEmail({
      to: user.email,
      subject: "About your visit to the office",
      kind: "trial_declined",
      html: `<p>Hi ${user.name},</p>
<p>Thanks for coming to try the office, and for the time you gave it. We're not able to offer you a spot as a member right now — the space is small and we have to be selective about capacity.</p>
<p>This isn't a judgement on your work, and we'd encourage you to stay involved: EA Netherlands runs regular public events, and the ${link("https://effectiefaltruisme.nl", "community")} is very much open to you.</p>
<p>Warm regards,<br>The EA Netherlands team</p>`,
    });
  }

  revalidatePath("/admin/members");
  return { ok: true };
}

export async function clearNoShowsAction(userId: string): Promise<AdminActionState> {
  const admin = await requireAdmin();
  await clearAllNoShows(userId, admin.id);
  revalidatePath("/admin/members");
  return { ok: true };
}

export async function addMemberAction(
  _prev: AdminActionState,
  formData: FormData
): Promise<AdminActionState> {
  await requireAdmin();
  const name = String(formData.get("name") || "").trim();
  const email = String(formData.get("email") || "").toLowerCase().trim();
  if (!name || !email.includes("@")) return { error: "Name and a valid email are required." };
  await db.insert(users).values({
    id: newId("usr"),
    name,
    email,
    role: "member",
    status: "active",
    source: "admin",
    approvedAt: new Date(),
  });
  revalidatePath("/admin/members");
  return { ok: true };
}

/** GDPR delete — actually deletes. Cascades wipe bookings, check-ins, sessions. */
export async function deleteUserAction(userId: string): Promise<AdminActionState> {
  const admin = await requireAdmin();
  if (userId === admin.id) return { error: "You can't delete yourself." };
  const [target] = await db.select().from(users).where(eq(users.id, userId));
  if (!target) return { error: "User not found." };
  if (target.role === "admin") return { error: "Demote them from admin first." };
  await db.delete(users).where(eq(users.id, userId));
  revalidatePath("/admin/members");
  return { ok: true };
}

// ---------- settings ----------

export async function saveSettingsAction(
  _prev: AdminActionState,
  formData: FormData
): Promise<AdminActionState> {
  await requireAdmin();
  const num = (k: string) => Number(formData.get(k));
  const numeric: (keyof Settings)[] = [
    "desk_count",
    "flex_count",
    "block_horizon_weeks",
    "join_horizon_days",
    "join_quick_days",
    "max_future_bookings",
    "noshow_threshold",
    "noshow_window_days",
    "noshow_email_cooldown_days",
    "request_expiry_days",
    "profile_skip_limit",
    "checkin_retention_months",
  ];
  for (const key of numeric) {
    const v = num(key);
    if (!Number.isFinite(v) || v < 0) return { error: `Invalid value for ${key}.` };
    await setSetting(key, v as never);
  }
  const share = num("block_max_share_pct");
  if (Number.isFinite(share) && share >= 0 && share <= 100) {
    await setSetting("block_max_share", share / 100);
  }
  const target = num("checkin_rate_target_pct");
  if (Number.isFinite(target) && target >= 0 && target <= 100) {
    await setSetting("checkin_rate_target", target / 100);
  }
  const coverage = formData.getAll("host_coverage_days").map(Number).filter((n) => n >= 1 && n <= 5);
  await setSetting("host_coverage_days", coverage);
  const slots = String(formData.get("arrival_slots") || "")
    .split(",")
    .map((s) => s.trim())
    .filter((s) => /^\d{2}:\d{2}$/.test(s));
  if (slots.length > 0) await setSetting("arrival_slots", slots);
  await setSetting("flex_unavailable_window", String(formData.get("flex_unavailable_window") || "12:00–13:00"));
  await setSetting("am_window", String(formData.get("am_window") || "9:00–13:30"));
  await setSetting("pm_window", String(formData.get("pm_window") || "12:30–19:00"));
  await setSetting("office_address", String(formData.get("office_address") || ""));
  await setSetting("luma_ics_url", String(formData.get("luma_ics_url") || "").trim());

  revalidatePath("/admin/settings");
  return { ok: true };
}

// ---------- events ----------

export async function createEventAction(
  _prev: AdminActionState,
  formData: FormData
): Promise<AdminActionState> {
  const admin = await requireAdmin();
  const title = String(formData.get("title") || "").trim();
  const date = String(formData.get("date") || "");
  const type = String(formData.get("type") || "other");
  const startsAt = String(formData.get("startsAt") || "") || null;
  const endsAt = String(formData.get("endsAt") || "") || null;
  if (!title || !date) return { error: "Title and date are required." };
  const hoursError = validateEventHours(type, startsAt, endsAt);
  if (hoursError) return { error: hoursError };
  const coworking = isCoworkingDay(type);
  if (coworking) {
    const dayError = validateCoworkingDay(date, startsAt, endsAt, todayAms());
    // Past dates are allowed here — admins backfill events that happened.
    if (dayError && !dayError.includes("passed")) return { error: dayError };
  }
  const [event] = await db
    .insert(events)
    .values({
      id: newId("ev"),
      title,
      date,
      startsAt,
      endsAt,
      type: type as typeof events.$inferInsert.type,
      causeArea: String(formData.get("causeArea") || "") || null,
      organiser: (String(formData.get("organiser") || "ean") as "ean" | "hosted"),
      expectedAttendance: Number(formData.get("expectedAttendance")) || null,
      createdBy: admin.id,
    })
    .returning();

  // Created confirmed, so it closes the day right away — same choice about
  // people already booked as when confirming a member's proposal.
  let absorbed = 0;
  let cleared = 0;
  if (coworking && date >= todayAms()) {
    if (formData.get("clearBookings") === "on") {
      ({ cleared } = await clearDayForCoworking(event));
    } else {
      absorbed = await absorbExistingBookings(event);
    }
  }
  revalidatePath("/admin/events");
  revalidatePath("/book");
  revalidatePath("/");
  return {
    ok: true,
    note:
      cleared > 0
        ? `${cleared === 1 ? "1 booking was" : `${cleared} bookings were`} cancelled for that day and those people have had an apology by email.`
        : absorbed > 0
          ? `${absorbed === 1 ? "One person who had" : `${absorbed} people who had`} already booked that day keep their desks and have been emailed.`
          : undefined,
  };
}

export async function setHeadcountAction(
  eventId: string,
  headcount: number
): Promise<AdminActionState> {
  await requireAdmin();
  await db
    .update(events)
    .set({ headcount: Number.isFinite(headcount) ? headcount : null })
    .where(eq(events.id, eventId));
  revalidatePath("/admin/events");
  return { ok: true };
}

export async function deleteEventAction(eventId: string): Promise<AdminActionState> {
  await requireAdmin();
  await db.delete(events).where(eq(events.id, eventId));
  revalidatePath("/admin/events");
  return { ok: true };
}

export async function decideEventAction(
  eventId: string,
  decision: "confirmed" | "declined",
  /**
   * Co-working days only. Confirming closes the day to general booking, and
   * the admin decides what that means for people who already booked it:
   * `keep` leaves their desks alone and brings them along, `clear` cancels
   * their bookings and sends an apology. Never chosen for them.
   */
  existingBookings: "keep" | "clear" = "keep"
): Promise<AdminActionState> {
  await requireAdmin();
  const [event] = await db.select().from(events).where(eq(events.id, eventId));
  if (!event) return { error: "Event not found." };
  await db.update(events).set({ status: decision }).where(eq(events.id, eventId));

  const coworking = isCoworkingDay(event.type);
  let absorbed = 0;
  let cleared = 0;
  if (coworking && decision === "confirmed" && event.date >= todayAms()) {
    if (existingBookings === "clear") {
      ({ cleared } = await clearDayForCoworking(event));
    } else {
      absorbed = await absorbExistingBookings(event);
    }
  }

  if (event.createdBy) {
    const [proposer] = await db.select().from(users).where(eq(users.id, event.createdBy));
    if (proposer) {
      const shareLink = `${appUrl()}/events/${event.id}/rsvp`;
      await sendEmail({
        to: proposer.email,
        subject:
          decision === "confirmed"
            ? coworking
              ? `Your co-working day is confirmed: ${event.title}`
              : `Your event is confirmed: ${event.title}`
            : coworking
              ? `About your co-working day: ${event.title}`
              : `About your event proposal: ${event.title}`,
        kind: decision === "confirmed" ? "event_confirmed" : "event_declined",
        html:
          decision === "confirmed"
            ? coworking
              ? `<p>Hi ${proposer.name},</p>
<p>Your co-working day <strong>${event.title}</strong> on ${formatDayLong(event.date)} is confirmed. The office is closed to general desk booking that day, and the day is on the calendar for everyone to see.</p>
<p><strong>Share this link</strong> with anyone you'd like there — members and people who've never been alike:<br>${link(shareLink, shareLink)}</p>
<p>Requests land in ${link(`${appUrl()}/events/${event.id}/guests`, "your guest list")}, where you approve or decline each one. Approving gives that person a desk straight away.</p>
${absorbed > 0 ? `<p>${absorbed === 1 ? "One person had" : `${absorbed} people had`} already booked that day. They keep their desks, they're on your guest list as approved, and we've emailed them to say what's happening.</p>` : ""}
${cleared > 0 ? `<p>${cleared === 1 ? "One booking that day was" : `${cleared} bookings that day were`} cancelled to free the space, and we've apologised to the people affected and pointed them at your link in case they'd like to come.</p>` : ""}
<p>Thanks for organising it!</p>`
              : `<p>Hi ${proposer.name},</p>
<p>Your event <strong>${event.title}</strong> on ${formatDayLong(event.date)} is confirmed — it's on the office calendar now.</p>
<p>Before the day, run through the ${link("https://tinyurl.com/checklist-office-events", "event checklist")}. Two things people forget: the alarm is active from 22:00, and the connecting doors close at 18:00.</p>
<p>Thanks for organising it!</p>`
            : `<p>Hi ${proposer.name},</p>
<p>Thanks for proposing <strong>${event.title}</strong>. We can't host it on ${formatDayLong(event.date)} — one of the team will follow up to explain and see if another date works.</p>`,
      });
    }
  }
  revalidatePath("/admin/events");
  revalidatePath("/book");
  revalidatePath("/");
  return {
    ok: true,
    note:
      coworking && decision === "confirmed"
        ? cleared > 0
          ? `Confirmed and cleared — ${cleared === 1 ? "1 booking was" : `${cleared} bookings were`} cancelled and those people have had an apology by email.`
          : absorbed > 0
            ? `Confirmed — the day is closed to general booking. ${absorbed === 1 ? "One person who had" : `${absorbed} people who had`} already booked keep their desks and have been emailed.`
            : "Confirmed — the day is closed to general booking."
        : undefined,
  };
}

/**
 * Reach out to whoever proposed an event. Replies go straight to the admin
 * who asked, not the shared office inbox, so it becomes a normal conversation.
 */
export async function askEventQuestionAction(
  eventId: string,
  question: string
): Promise<AdminActionState> {
  const admin = await requireAdmin();
  if (!question.trim()) return { error: "Write something first." };
  const [event] = await db.select().from(events).where(eq(events.id, eventId));
  if (!event) return { error: "Event not found." };
  if (!event.createdBy) return { error: "No proposer on record for this one." };
  const [proposer] = await db.select().from(users).where(eq(users.id, event.createdBy));
  if (!proposer) return { error: "Proposer not found." };

  await db
    .update(events)
    .set({ questionAskedAt: new Date() })
    .where(eq(events.id, eventId));

  await sendEmail({
    to: proposer.email,
    replyTo: admin.email,
    subject: `About your event: ${event.title}`,
    kind: "event_question",
    html: `<p>Hi ${proposer.name},</p>
<p>Thanks for proposing <strong>${event.title}</strong> on ${formatDayLong(event.date)} — ${admin.name} here, I'd like to talk it through a bit:</p>
<blockquote style="border-left:3px solid #16879c;padding-left:12px;color:#333;">${question.replace(/</g, "&lt;").replace(/\n/g, "<br>")}</blockquote>
<p>Just hit reply — this goes straight to me.</p>
<p>${admin.name}</p>`,
  });

  revalidatePath("/admin/events");
  return { ok: true };
}

export async function setEventTypeAction(
  eventId: string,
  type: string
): Promise<AdminActionState> {
  await requireAdmin();
  await db
    .update(events)
    .set({ type: type as typeof events.$inferInsert.type })
    .where(eq(events.id, eventId));
  revalidatePath("/admin/events");
  return { ok: true };
}

export async function saveInfoPageAction(
  _prev: AdminActionState,
  formData: FormData
): Promise<AdminActionState> {
  await requireAdmin();
  await setSetting("info_public_md", String(formData.get("info_public_md") || ""));
  await setSetting("info_members_md", String(formData.get("info_members_md") || ""));
  revalidatePath("/info");
  revalidatePath("/admin/info");
  return { ok: true };
}

export async function syncLumaAction(): Promise<
  AdminActionState & { created?: number; updated?: number; total?: number }
> {
  await requireAdmin();
  const { syncLuma } = await import("@/lib/luma");
  const res = await syncLuma();
  revalidatePath("/admin/events");
  if (!res.ok) return { error: res.error };
  return { ok: true, created: res.created, updated: res.updated, total: res.total };
}

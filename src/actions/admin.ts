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
import { addDays, formatDayLong, todayAms } from "@/lib/dates";
import { getSettings, setSetting, Settings } from "@/lib/settings";
import { clearAllNoShows } from "@/lib/noshow";
import { buildIcs } from "@/lib/ics";
import { bookDay } from "@/lib/booking";

async function requireAdmin() {
  const user = await getCurrentUser();
  if (!user || user.role !== "admin") throw new Error("Admin only");
  return user;
}

export type AdminActionState = { ok?: boolean; error?: string };

// ---------- approval queue ----------

export async function approveRequestAction(requestId: string): Promise<AdminActionState> {
  const admin = await requireAdmin();
  const cfg = await getSettings();
  const [req] = await db.select().from(visitRequests).where(eq(visitRequests.id, requestId));
  if (!req) return { error: "Request not found." };
  const [user] = await db.select().from(users).where(eq(users.id, req.userId));
  if (!user) return { error: "User not found." };

  const trialEnds = new Date();
  trialEnds.setMonth(trialEnds.getMonth() + cfg.trial_months);

  await db
    .update(visitRequests)
    .set({ status: "approved", decidedBy: admin.id, decidedAt: new Date() })
    .where(eq(visitRequests.id, requestId));
  await db
    .update(users)
    .set({
      role: "member",
      status: "trial",
      trialEndsAt: trialEnds.toISOString().slice(0, 10),
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
    subject: `You're in — see you ${formatDayLong(req.requestedDate)}`,
    kind: "request_approved",
    html: `<p>Hi ${user.name},</p>
<p>Great news — you're welcome at the office on <strong>${formatDayLong(req.requestedDate)}</strong>. Come at <strong>${req.requestedArrival}</strong> and someone will be there to show you around.</p>
<p>Practical bits — address, getting in, lunch, wifi: ${link(`${appUrl()}/info`, "office info page")}. The wifi password is on posters up in the office.</p>
<p>After your visit you can book desks any time at ${link(`${appUrl()}/book`, "the booking page")} — just log in with this email address.</p>
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
<blockquote style="border-left:3px solid #0f766e;padding-left:12px;color:#333;">${question.replace(/</g, "&lt;")}</blockquote>
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
  await db.update(users).set({ status }).where(eq(users.id, userId));
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

export async function endTrialAction(
  userId: string,
  outcome: "convert" | "extend" | "end"
): Promise<AdminActionState> {
  await requireAdmin();
  const cfg = await getSettings();
  if (outcome === "convert") {
    await db
      .update(users)
      .set({ status: "active" })
      .where(eq(users.id, userId));
  } else if (outcome === "extend") {
    const [user] = await db.select().from(users).where(eq(users.id, userId));
    const base = user?.trialEndsAt && user.trialEndsAt > todayAms() ? user.trialEndsAt : todayAms();
    await db
      .update(users)
      .set({ trialEndsAt: addDays(base, 30) })
      .where(eq(users.id, userId));
  } else {
    await db.update(users).set({ status: "inactive" }).where(eq(users.id, userId));
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
    "max_future_bookings",
    "noshow_threshold",
    "noshow_window_days",
    "noshow_email_cooldown_days",
    "request_expiry_days",
    "profile_skip_limit",
    "checkin_retention_months",
    "trial_months",
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
  if (!title || !date) return { error: "Title and date are required." };
  await db.insert(events).values({
    id: newId("ev"),
    title,
    date,
    startsAt: String(formData.get("startsAt") || "") || null,
    endsAt: String(formData.get("endsAt") || "") || null,
    type: type as typeof events.$inferInsert.type,
    causeArea: String(formData.get("causeArea") || "") || null,
    organiser: (String(formData.get("organiser") || "ean") as "ean" | "hosted"),
    expectedAttendance: Number(formData.get("expectedAttendance")) || null,
    createdBy: admin.id,
  });
  revalidatePath("/admin/events");
  return { ok: true };
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
  decision: "confirmed" | "declined"
): Promise<AdminActionState> {
  await requireAdmin();
  const [event] = await db.select().from(events).where(eq(events.id, eventId));
  if (!event) return { error: "Event not found." };
  await db.update(events).set({ status: decision }).where(eq(events.id, eventId));

  if (event.createdBy) {
    const [proposer] = await db.select().from(users).where(eq(users.id, event.createdBy));
    if (proposer) {
      await sendEmail({
        to: proposer.email,
        subject:
          decision === "confirmed"
            ? `Your event is confirmed: ${event.title}`
            : `About your event proposal: ${event.title}`,
        kind: decision === "confirmed" ? "event_confirmed" : "event_declined",
        html:
          decision === "confirmed"
            ? `<p>Hi ${proposer.name},</p>
<p>Your event <strong>${event.title}</strong> on ${formatDayLong(event.date)} is confirmed — it's on the office calendar now.</p>
<p>Before the day, run through the ${link("https://tinyurl.com/checklist-office-events", "event checklist")}. Two things people forget: the alarm is active from 22:00, and the connecting doors close at 18:00.</p>
<p>Thanks for organising it!</p>`
            : `<p>Hi ${proposer.name},</p>
<p>Thanks for proposing <strong>${event.title}</strong>. We can't host it on ${formatDayLong(event.date)} — one of the team will follow up to explain and see if another date works.</p>`,
      });
    }
  }
  revalidatePath("/admin/events");
  revalidatePath("/");
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

"use server";

import { cookies } from "next/headers";
import { revalidatePath } from "next/cache";
import { getCurrentUser } from "@/lib/auth";
import { sendEmail, btn } from "@/lib/email";
import { SURVEY, surveyLink, surveyOpen, surveyRecipients } from "@/lib/survey";
import { todayAms } from "@/lib/dates";

export async function dismissSurveyAction(): Promise<void> {
  const jar = await cookies();
  jar.set(SURVEY.cookie, "dismissed", {
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    maxAge: 60 * 24 * 60 * 60,
    path: "/",
  });
  revalidatePath("/");
  revalidatePath("/checkin");
}

export type SurveySendState = {
  ok?: boolean;
  error?: string;
  note?: string;
  /** For a batch: how many went out this time, and how many are still waiting. */
  sent?: number;
  left?: number;
};

// Resend allows a couple of requests a second, and a server action shouldn't
// run for minutes, so each call sends one batch. The admin page keeps calling
// until nobody is left — anyone already emailed is skipped.
const BATCH = 40;
const GAP_MS = 600;

function inviteHtml(name: string): string {
  const first = name.split(" ")[0];
  return `<p>Hi ${first},</p>
<p>We're planning the office for next year and we'd love to hear from you. What works, what doesn't, and what would make the space more useful for your work?</p>
<p>The survey takes about ${SURVEY.minutes} minutes. It's open until <strong>${SURVEY.closesLabel}</strong>.</p>
<p>${btn(surveyLink(true), "Take the survey")}</p>
<p>Every answer gets read, and we'll share what we learned and what we're changing.</p>
<p>Thank you!<br>James</p>`;
}

function reminderHtml(name: string): string {
  const first = name.split(" ")[0];
  return `<p>Hi ${first},</p>
<p>A quick reminder that the office survey closes on <strong>${SURVEY.closesLabel}</strong>. If you've already filled it in, thank you, and you can ignore this.</p>
<p>If not, it takes about ${SURVEY.minutes} minutes, and you can answer anonymously if you prefer.</p>
<p>${btn(surveyLink(true), "Take the survey")}</p>
<p>Thanks!<br>James</p>`;
}

const EMAILS = {
  invite: {
    subject: `Help shape the office: ${SURVEY.minutes}-minute survey, open until ${SURVEY.closesLabel}`,
    kind: SURVEY.emailKind,
    html: inviteHtml,
  },
  reminder: {
    subject: `Reminder: the office survey closes ${SURVEY.closesLabel}`,
    kind: SURVEY.reminderKind,
    html: reminderHtml,
  },
} as const;
type Which = keyof typeof EMAILS;

export async function sendSurveyTestAction(which: Which): Promise<SurveySendState> {
  const admin = await getCurrentUser();
  if (!admin || admin.role !== "admin") return { error: "Admin only." };
  const email = EMAILS[which];
  if (!email) return { error: "Unknown email." };
  await sendEmail({
    to: admin.email,
    subject: `[Test] ${email.subject}`,
    kind: "survey_2026_test",
    html: email.html(admin.name),
    from: SURVEY.from,
    replyTo: SURVEY.replyTo,
  });
  revalidatePath("/admin/survey");
  return { ok: true, note: `Test sent to ${admin.email}.` };
}

async function sendBatch(
  which: Which,
  todo: { email: string; name: string }[]
): Promise<SurveySendState> {
  const email = EMAILS[which];
  const batch = todo.slice(0, BATCH);
  for (const [i, r] of batch.entries()) {
    if (i > 0) await new Promise((res) => setTimeout(res, GAP_MS));
    await sendEmail({
      to: r.email,
      subject: email.subject,
      kind: email.kind,
      html: email.html(r.name),
      from: SURVEY.from,
      replyTo: SURVEY.replyTo,
    });
  }
  revalidatePath("/admin/survey");
  return { ok: true, sent: batch.length, left: todo.length - batch.length };
}

export async function sendSurveyBatchAction(
  includeImported: boolean
): Promise<SurveySendState> {
  const admin = await getCurrentUser();
  if (!admin || admin.role !== "admin") return { error: "Admin only." };
  const todo = (await surveyRecipients(includeImported)).filter((r) => !r.sent);
  return sendBatch("invite", todo);
}

/** Everyone who got the invite and hasn't had the reminder yet. */
export async function sendSurveyReminderAction(): Promise<SurveySendState> {
  const admin = await getCurrentUser();
  if (!admin || admin.role !== "admin") return { error: "Admin only." };
  if (!surveyOpen(todayAms())) return { error: "The survey has closed." };
  const todo = (await surveyRecipients(true)).filter((r) => r.sent && !r.reminded);
  return sendBatch("reminder", todo);
}

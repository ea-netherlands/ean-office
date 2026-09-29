"use server";

import { cookies } from "next/headers";
import { revalidatePath } from "next/cache";
import { getCurrentUser } from "@/lib/auth";
import { sendEmail, btn } from "@/lib/email";
import { SURVEY, surveyLink, surveyRecipients } from "@/lib/survey";

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

export type SurveySendState = { ok?: boolean; error?: string; note?: string };

// Resend allows a couple of requests a second, and a server action shouldn't
// run for minutes, so each press sends one batch. Pressing again carries on
// where it stopped — anyone already emailed is skipped.
const BATCH = 40;
const GAP_MS = 600;

function inviteHtml(name: string, userId: string): string {
  const first = name.split(" ")[0];
  return `<p>Hi ${first},</p>
<p>We're planning the office for next year and we'd love to hear from you. What works, what doesn't, and what would make the space more useful for your work?</p>
<p>The survey takes about ${SURVEY.minutes} minutes. It's open until <strong>${SURVEY.closesLabel}</strong>.</p>
<p>${btn(surveyLink(userId), "Take the survey")}</p>
<p>Every answer gets read, and we'll share what we learned and what we're changing.</p>
<p>Thank you!<br>James</p>`;
}

const SUBJECT = `Help shape the office: ${SURVEY.minutes}-minute survey, open until ${SURVEY.closesLabel}`;

export async function sendSurveyTestAction(): Promise<SurveySendState> {
  const admin = await getCurrentUser();
  if (!admin || admin.role !== "admin") return { error: "Admin only." };
  await sendEmail({
    to: admin.email,
    subject: `[Test] ${SUBJECT}`,
    kind: "survey_2026_test",
    html: inviteHtml(admin.name, admin.id),
    from: SURVEY.from,
    replyTo: SURVEY.replyTo,
  });
  revalidatePath("/admin/survey");
  return { ok: true, note: `Test sent to ${admin.email}.` };
}

export async function sendSurveyBatchAction(
  _prev: SurveySendState,
  form: FormData
): Promise<SurveySendState> {
  const admin = await getCurrentUser();
  if (!admin || admin.role !== "admin") return { error: "Admin only." };
  const includeImported = form.get("includeImported") === "on";

  const todo = (await surveyRecipients(includeImported)).filter((r) => !r.sent);
  const batch = todo.slice(0, BATCH);
  for (const [i, r] of batch.entries()) {
    if (i > 0) await new Promise((res) => setTimeout(res, GAP_MS));
    await sendEmail({
      to: r.email,
      subject: SUBJECT,
      kind: SURVEY.emailKind,
      html: inviteHtml(r.name, r.id),
      from: SURVEY.from,
      replyTo: SURVEY.replyTo,
    });
  }
  revalidatePath("/admin/survey");
  const left = todo.length - batch.length;
  return {
    ok: true,
    note:
      left > 0
        ? `Sent ${batch.length}. ${left} still to go. Press send again to carry on.`
        : `Sent ${batch.length}. Everyone has been emailed.`,
  };
}

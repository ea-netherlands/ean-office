"use server";

import { redirect } from "next/navigation";
import { and, eq, gt } from "drizzle-orm";
import { db, emailLog, ensureMigrated } from "@/db";
import { appUrl, createLoginToken, logout } from "@/lib/auth";
import { findUserByEmail } from "@/lib/users";
import { sendEmail, btn, link as textLink } from "@/lib/email";

export type MagicLinkState = {
  sent?: boolean;
  email?: string; // echoed back so a typo is easy to spot
  error?: string;
  devLink?: string; // dev only: shown on screen when no email provider is configured
};

export async function requestMagicLink(
  _prev: MagicLinkState,
  formData: FormData
): Promise<MagicLinkState> {
  await ensureMigrated();
  const email = String(formData.get("email") || "")
    .toLowerCase()
    .trim();
  const redirectTo = String(formData.get("redirectTo") || "") || undefined;
  if (!email || !email.includes("@")) {
    return { error: "Enter a valid email address." };
  }

  // Alias-aware: someone who signed up with a work address and typed their
  // personal one still gets a link, provided the two have been merged.
  const user = await findUserByEmail(email);

  // Don't reveal on screen whether an address is known. Instead, an unknown
  // address gets an email explaining there's no account, so only the owner
  // of the inbox learns the answer.
  if (!user) {
    await sendNoAccountEmail(email);
    return { sent: true, email };
  }
  if (user.status === "declined") {
    return { sent: true, email };
  }

  const token = await createLoginToken(email, redirectTo);
  const link = `${appUrl()}/auth/${token}`;
  await sendEmail({
    to: email,
    subject: "Your login link",
    kind: "magic_link",
    html: `<p>Hi ${user.name},</p>
<p>Tap to log in to the EA Netherlands office app — the link works for 30 minutes:</p>
<p>${btn(link, "Log in")}</p>
<p style="color:#888;font-size:13px;">If you didn't request this, you can ignore it.</p>`,
  });

  const dev =
    !process.env.RESEND_API_KEY && process.env.NODE_ENV !== "production";
  return { sent: true, email, devLink: dev ? link : undefined };
}

const NO_ACCOUNT_KIND = "login_no_account";

// Anyone can type any address into the login form, so cap these at one per
// address per day to stop the form being used to spam people.
async function sendNoAccountEmail(email: string): Promise<void> {
  const since = new Date(Date.now() - 24 * 60 * 60 * 1000);
  const [recent] = await db
    .select({ id: emailLog.id })
    .from(emailLog)
    .where(
      and(
        eq(emailLog.toEmail, email),
        eq(emailLog.kind, NO_ACCOUNT_KIND),
        gt(emailLog.sentAt, since)
      )
    )
    .limit(1);
  if (recent) return;

  const base = appUrl();
  await sendEmail({
    to: email,
    subject: "No office account for this address",
    kind: NO_ACCOUNT_KIND,
    html: `<p>Hi,</p>
<p>Someone (hopefully you) tried to log in to the EA Netherlands office app with this address, but there's no account linked to it.</p>
<p><strong>Never been to the office, or never signed up?</strong> Then you don't have an account yet — they're created when you request a first visit:</p>
<p>${btn(`${base}/join`, "Request a first visit")}</p>
<p><strong>Already been coming in?</strong> You probably signed up with a different email (a work or personal one, say). ${textLink(`${base}/login`, "Try logging in with that one")}, or reply to this email and we'll sort it out.</p>
<p style="color:#888;font-size:13px;">If this wasn't you, you can ignore this email.</p>`,
  });
}

export async function logoutAction(): Promise<void> {
  await logout();
  redirect("/");
}

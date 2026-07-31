"use server";

import { redirect } from "next/navigation";
import { db, users, ensureMigrated } from "@/db";
import { sql } from "drizzle-orm";
import { appUrl, createLoginToken, logout } from "@/lib/auth";
import { sendEmail, btn } from "@/lib/email";

export type MagicLinkState = {
  sent?: boolean;
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

  const [user] = await db
    .select()
    .from(users)
    .where(sql`lower(${users.email}) = ${email}`);

  // Don't reveal whether an address is known.
  if (!user || user.status === "declined") {
    return { sent: true };
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
  return { sent: true, devLink: dev ? link : undefined };
}

export async function logoutAction(): Promise<void> {
  await logout();
  redirect("/");
}

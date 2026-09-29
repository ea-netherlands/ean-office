import { and, eq, inArray } from "drizzle-orm";
import { db, users, emailLog } from "@/db";
import { appUrl } from "./auth";

// The 2026 office survey. One-off campaign: the card on the home and check-in
// pages and the admin send page all read from here, and everything switches
// itself off once `closesOn` has passed — no code change needed afterwards.

export const SURVEY = {
  url: "https://d5a0gq2daer.typeform.com/to/NIUElKON",
  /** Last day it's open, inclusive, Amsterdam time. */
  closesOn: "2026-10-06",
  closesLabel: "Tuesday 6 October",
  minutes: 7,
  /** Set once someone opens or dismisses the card, so it stops asking. */
  cookie: "ean_survey_2026",
  emailKind: "survey_2026",
  /** Comes from a person, not the office, so it reads as a real ask. */
  from: "James Herbert <james@effectiefaltruisme.nl>",
  replyTo: "james@effectiefaltruisme.nl",
} as const;

export function surveyOpen(today: string): boolean {
  return today <= SURVEY.closesOn;
}

/**
 * Our own redirect, so opening the survey from anywhere hides the card. It
 * deliberately carries nothing about who clicked: the survey promises people
 * they can answer anonymously.
 */
export function surveyLink(absolute = false): string {
  return absolute ? `${appUrl()}/survey` : "/survey";
}

/** Members who should get the invite, and whether each has had it yet. */
export async function surveyRecipients(includeImported: boolean) {
  const statuses = includeImported
    ? (["active", "trial", "imported"] as const)
    : (["active", "trial"] as const);
  const rows = await db
    .select({ id: users.id, email: users.email, name: users.name, status: users.status })
    .from(users)
    .where(and(inArray(users.status, [...statuses]), inArray(users.role, ["member", "admin"])));
  const sent = new Set(
    (
      await db
        .select({ to: emailLog.toEmail })
        .from(emailLog)
        .where(eq(emailLog.kind, SURVEY.emailKind))
    ).map((r) => r.to.toLowerCase())
  );
  return rows.map((r) => ({ ...r, sent: sent.has(r.email.toLowerCase()) }));
}

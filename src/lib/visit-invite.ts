/**
 * The host's calendar entry for someone's first visit.
 *
 * Approving a first visit sends the approving admin an invitation to welcome
 * them. That entry has to stay true: if the visitor cancels, the host gets an
 * email and the event comes out of their calendar, instead of them coming in
 * to meet nobody. Both ends build the event here so they share a UID.
 */

import { db, users, visitRequests } from "@/db";
import { and, eq } from "drizzle-orm";
import { appUrl } from "./auth";
import { formatDayLong, todayAms } from "./dates";
import { link, sendEmail } from "./email";
import { buildIcsCancel, IcsEvent } from "./ics";
import type { Settings } from "./settings";
import { getSettings } from "./settings";

type User = typeof users.$inferSelect;
type VisitRequest = typeof visitRequests.$inferSelect;

/** Bare address for the iCalendar ORGANIZER field. */
function organiserEmail(): string {
  const from = process.env.EMAIL_FROM || "office@effectiefaltruisme.nl";
  const match = from.match(/<([^>]+)>/);
  return match ? match[1] : from;
}

export function welcomeIcsEvent(
  req: VisitRequest,
  visitor: User,
  hostEmail: string,
  cfg: Settings
): IcsEvent {
  return {
    uid: `visit-${req.id}@office.effectiefaltruisme.nl`,
    title: `Welcome ${visitor.name} to the office`,
    description: [
      `${visitor.name}'s first visit. They arrive at ${req.requestedArrival}.`,
      "",
      `Email: ${visitor.email}`,
      `Profile: ${visitor.profileUrl ?? "—"}`,
      "",
      visitor.about ?? "",
      "",
      `Who's in that day: ${appUrl()}/book`,
    ].join("\n"),
    location: cfg.office_address,
    date: req.requestedDate,
    startTime: req.requestedArrival,
    durationMinutes: 60,
    organiserEmail: organiserEmail(),
    attendeeEmails: [hostEmail],
  };
}

/**
 * Call when a booking is cancelled. Does nothing unless it was the desk for
 * someone's upcoming first visit; then it tells whoever approved the visit
 * and withdraws their calendar invite.
 */
export async function notifyHostOfCancelledVisit(booking: {
  userId: string;
  date: string;
}): Promise<void> {
  if (booking.date < todayAms()) return;
  const [visitor] = await db.select().from(users).where(eq(users.id, booking.userId));
  if (!visitor || visitor.status !== "trial" || visitor.trialDate !== booking.date) return;

  const [req] = await db
    .select()
    .from(visitRequests)
    .where(
      and(
        eq(visitRequests.userId, visitor.id),
        eq(visitRequests.requestedDate, booking.date),
        eq(visitRequests.status, "approved")
      )
    );
  if (!req?.decidedBy) return;
  const [host] = await db.select().from(users).where(eq(users.id, req.decidedBy));
  if (!host) return;

  const cfg = await getSettings();
  const cancel = buildIcsCancel(welcomeIcsEvent(req, visitor, host.email, cfg));
  await sendEmail({
    to: host.email,
    subject: `${visitor.name} cancelled their visit on ${formatDayLong(req.requestedDate)}`,
    kind: "host_visit_cancelled",
    replyTo: visitor.email,
    html: `<p>${visitor.name} cancelled their first visit on <strong>${formatDayLong(req.requestedDate)} at ${req.requestedArrival}</strong>, so you don't need to come in to welcome them.</p>
<p>The attached update takes the welcome out of your calendar. If your calendar doesn't remove it on its own, delete it there.</p>
<p>To check whether they want another day, reply to this email. It goes to ${link(`mailto:${visitor.email}`, visitor.email)}.</p>
<p>${link(`${appUrl()}/admin/members`, "See them in members")}</p>`,
    icsAttachment: { filename: "office-visit-cancelled.ics", content: cancel, method: "CANCEL" },
  });
}

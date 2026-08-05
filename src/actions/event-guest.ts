"use server";

import { revalidatePath } from "next/cache";
import { db, users, events, eventGuests } from "@/db";
import { eq, and, sql, inArray } from "drizzle-orm";
import { newId } from "@/lib/ids";
import { sendEmail, link } from "@/lib/email";
import { appUrl, getCurrentUser, isAdmin } from "@/lib/auth";
import { formatDayLong, todayAms } from "@/lib/dates";

export type GuestRequestState = { ok?: boolean; error?: string };

/**
 * A newcomer (or anyone) asking to join a themed coworking day. No login
 * required to submit, same as /join — the account is created here, not via
 * the magic-link flow, which only authenticates rows that already exist.
 */
export async function requestEventGuestAction(
  eventId: string,
  _prev: GuestRequestState,
  formData: FormData
): Promise<GuestRequestState> {
  const [event] = await db.select().from(events).where(eq(events.id, eventId));
  if (!event || event.type !== "themed_coworking" || event.status !== "confirmed") {
    return { error: "This one isn't open for requests." };
  }
  if (event.date < todayAms()) return { error: "This one's already happened." };

  const name = String(formData.get("name") || "").trim();
  const email = String(formData.get("email") || "").toLowerCase().trim();
  const accessibilityNotes = String(formData.get("accessibilityNotes") || "").trim();
  const guidelines = formData.get("guidelines") === "on";

  if (!name) return { error: "Add your name." };
  if (!email.includes("@")) return { error: "Add a valid email address." };
  if (!guidelines) return { error: "Please read and accept the office guidelines." };

  const [existing] = await db
    .select()
    .from(users)
    .where(sql`lower(${users.email}) = ${email}`);

  let userId: string;
  if (existing) {
    if (existing.status === "declined") {
      return { error: "Get in touch with the team directly about this one." };
    }
    userId = existing.id;
    // Never downgrade someone who's already a real member, trial, or admin —
    // this request is additive, not a status change.
  } else {
    userId = newId("usr");
    await db.insert(users).values({
      id: userId,
      email,
      name,
      role: "visitor",
      status: "event_guest",
      guidelinesAcceptedAt: new Date(),
    });
  }

  const [already] = await db
    .select()
    .from(eventGuests)
    .where(and(eq(eventGuests.eventId, eventId), eq(eventGuests.userId, userId)));
  if (already) {
    return {
      error:
        already.status === "pending"
          ? "You've already asked to join — the organiser will get back to you."
          : already.status === "approved"
            ? "You're already confirmed for this one — see you there!"
            : "The organiser wasn't able to fit you in this time.",
    };
  }

  await db.insert(eventGuests).values({
    id: newId("eg"),
    eventId,
    userId,
    accessibilityNotes: accessibilityNotes || null,
    guidelinesAcceptedAt: new Date(),
  });

  await sendEmail({
    to: email,
    subject: `Request received: ${event.title}`,
    kind: "event_guest_request",
    html: `<p>Hi ${name},</p>
<p>Thanks for asking to join <strong>${event.title}</strong> on ${formatDayLong(event.date)}. The organiser curates this one directly, so you'll get an email either way once they've had a look.</p>`,
  });

  const organiserIds = event.createdBy
    ? [event.createdBy]
    : (await db.select({ id: users.id }).from(users).where(eq(users.role, "admin"))).map(
        (a) => a.id
      );
  const organisers = await db.select().from(users).where(inArray(users.id, organiserIds));
  for (const o of organisers) {
    await sendEmail({
      to: o.email,
      subject: `${name} wants to join ${event.title}`,
      kind: "event_guest_request_organiser",
      html: `<p><strong>${name}</strong> (${email}) asked to join <strong>${event.title}</strong> on ${formatDayLong(event.date)}.</p>
${accessibilityNotes ? `<p>${accessibilityNotes.replace(/</g, "&lt;")}</p>` : ""}
<p>${link(`${appUrl()}/events/${eventId}/guests`, "Review guest requests")}</p>`,
    });
  }

  revalidatePath(`/events/${eventId}/guests`);
  return { ok: true };
}

async function requireOrganiserOrAdmin(eventId: string) {
  const user = await getCurrentUser();
  if (!user) throw new Error("Not logged in");
  const [event] = await db.select().from(events).where(eq(events.id, eventId));
  if (!event) throw new Error("Event not found");
  if (!isAdmin(user) && event.createdBy !== user.id) throw new Error("Not allowed");
  return { user, event };
}

export async function decideGuestAction(
  guestId: string,
  decision: "approved" | "declined"
): Promise<GuestRequestState> {
  const [guest] = await db.select().from(eventGuests).where(eq(eventGuests.id, guestId));
  if (!guest) return { error: "Not found." };
  const { user, event } = await requireOrganiserOrAdmin(guest.eventId);

  await db
    .update(eventGuests)
    .set({ status: decision, decidedBy: user.id, decidedAt: new Date() })
    .where(eq(eventGuests.id, guestId));

  const [guestUser] = await db.select().from(users).where(eq(users.id, guest.userId));
  if (guestUser) {
    await sendEmail({
      to: guestUser.email,
      subject: decision === "approved" ? `You're in: ${event.title}` : `About ${event.title}`,
      kind: decision === "approved" ? "event_guest_approved" : "event_guest_declined",
      html:
        decision === "approved"
          ? `<p>Hi ${guestUser.name},</p><p>You're confirmed for <strong>${event.title}</strong> on ${formatDayLong(event.date)} — see you there!</p>`
          : `<p>Hi ${guestUser.name},</p><p>Thanks for asking to join <strong>${event.title}</strong> — we can't fit you in this time. Hope to see you at a future one.</p>`,
    });
  }

  revalidatePath(`/events/${event.id}/guests`);
  return { ok: true };
}

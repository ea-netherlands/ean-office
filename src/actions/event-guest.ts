"use server";

import { revalidatePath } from "next/cache";
import { db, users, events, eventGuests } from "@/db";
import { eq, and, inArray } from "drizzle-orm";
import { findUserByEmail } from "@/lib/users";
import { newId } from "@/lib/ids";
import { sendEmail, link } from "@/lib/email";
import { appUrl, getCurrentUser, isAdmin } from "@/lib/auth";
import { formatDayLong, todayAms } from "@/lib/dates";
import { cancelBooking } from "@/lib/booking";
import {
  bookedThatDay,
  coworkingSpots,
  guestSeatBooking,
  seatGuest,
} from "@/lib/coworking-guests";
import { EchoState, formValues } from "@/lib/form-values";

export type GuestRequestState = EchoState & { ok?: boolean };

const FIELDS = ["name", "email", "accessibilityNotes", "guidelines"] as const;

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
  // Answers come back with any error — see lib/form-values.
  const values = formValues(formData, FIELDS);
  const attempt = (_prev.attempt ?? 0) + 1;
  const fail = (error: string, field?: string): GuestRequestState => ({
    error,
    field,
    values,
    attempt,
  });

  const [event] = await db.select().from(events).where(eq(events.id, eventId));
  if (!event || event.type !== "themed_coworking" || event.status !== "confirmed") {
    return fail("This one isn't open for requests.");
  }
  if (event.date < todayAms()) return fail("This one's already happened.");

  const name = String(formData.get("name") || "").trim();
  const email = String(formData.get("email") || "").toLowerCase().trim();
  const accessibilityNotes = String(formData.get("accessibilityNotes") || "").trim();
  const guidelines = formData.get("guidelines") === "on";

  if (!name) return fail("Add your name.", "name");
  if (!email.includes("@")) return fail("Add a valid email address.", "email");
  if (!guidelines) {
    return fail("Please read and accept the office guidelines.", "guidelines");
  }

  const existing = await findUserByEmail(email);

  let userId: string;
  if (existing) {
    if (existing.status === "declined") {
      return fail("Get in touch with the team directly about this one.", "email");
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
    return fail(
      already.status === "pending"
        ? "You've already asked to join — the organiser will get back to you."
        : already.status === "approved"
          ? "You're already confirmed for this one — see you there!"
          : "The organiser wasn't able to fit you in this time."
    );
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
  const spots = await coworkingSpots(event.date);
  for (const o of organisers) {
    await sendEmail({
      to: o.email,
      subject: `${name} wants to join ${event.title}`,
      kind: "event_guest_request_organiser",
      html: `<p><strong>${name}</strong> (${email}) asked to join <strong>${event.title}</strong> on ${formatDayLong(event.date)}.</p>
${accessibilityNotes ? `<p>${accessibilityNotes.replace(/</g, "&lt;")}</p>` : ""}
<p>${spots.left > 0 ? `${spots.left} of ${spots.total} spots still free.` : `The room is full — all ${spots.total} spots are taken.`}</p>
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
): Promise<GuestRequestState & { seat?: string; note?: string }> {
  const [guest] = await db.select().from(eventGuests).where(eq(eventGuests.id, guestId));
  if (!guest) return { error: "Not found." };
  const { user, event } = await requireOrganiserOrAdmin(guest.eventId);

  // Approving has to mean a seat, not just a row: it's what puts them on the
  // day's list, sends the reminder, and stops thirteen desks being promised
  // to forty people.
  let seat: string | null = null;
  if (decision === "approved" && event.date >= todayAms()) {
    const res = await seatGuest(guest.userId, event.date);
    if (!res.ok) {
      return {
        error: `${res.error} Cancel or decline someone else first, then approve them.`,
      };
    }
    seat = res.seat;
  }

  await db
    .update(eventGuests)
    .set({ status: decision, decidedBy: user.id, decidedAt: new Date() })
    .where(eq(eventGuests.id, guestId));

  // Undoing an approval gives the desk back — but only if we're the ones who
  // handed it out. Somebody who had booked the day themselves keeps theirs,
  // and the organiser is told to talk to them.
  let keptOwnBooking = false;
  if (decision === "declined" && guest.status === "approved") {
    const ours = await guestSeatBooking(guest.userId, event.date);
    if (ours) await cancelBooking(ours.id);
    else keptOwnBooking = !!(await bookedThatDay(event.date)).find(
      (b) => b.user.id === guest.userId
    );
  }

  const [guestUser] = await db.select().from(users).where(eq(users.id, guest.userId));
  if (guestUser) {
    await sendEmail({
      to: guestUser.email,
      subject: decision === "approved" ? `You're in: ${event.title}` : `About ${event.title}`,
      kind: decision === "approved" ? "event_guest_approved" : "event_guest_declined",
      html:
        decision === "approved"
          ? `<p>Hi ${guestUser.name},</p>
<p>You're confirmed for <strong>${event.title}</strong> on ${formatDayLong(event.date)}${event.startsAt ? `, ${event.startsAt}${event.endsAt ? `–${event.endsAt}` : ""}` : ""} — see you there!</p>
${seat ? `<p>You've got <strong>${seat}</strong>. Scan the QR code by the door when you arrive.</p>` : ""}
<p>${link(`${appUrl()}/info`, "Practical info about the office")} — where it is, wifi, lunch.</p>`
          : `<p>Hi ${guestUser.name},</p><p>Thanks for asking to join <strong>${event.title}</strong> — we can't fit you in this time. Hope to see you at a future one.</p>`,
    });
  }

  revalidatePath(`/events/${event.id}/guests`);
  revalidatePath("/book");
  revalidatePath("/");
  return {
    ok: true,
    seat: seat ?? undefined,
    note: keptOwnBooking
      ? "Declined — but they booked that desk themselves before the day was confirmed, so it's still theirs. Worth a word with them."
      : undefined,
  };
}

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
import { isCoworkingDay } from "@/lib/coworking";
import { getSettings } from "@/lib/settings";
import { leaveEvent, leaveEventUrl, SELF_WITHDRAWN } from "@/lib/leave-event";
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
 * A newcomer (or anyone) putting their name down for something at the office.
 * No login required to submit, same as /join — the account is created here,
 * not via the magic-link flow, which only authenticates rows that already
 * exist.
 *
 * A **co-working day** takes the whole office, so this is a request and the
 * organiser decides. An **evening event** has no desks to ration, so the row
 * lands approved and the organiser is simply told who's coming — making an
 * organiser click Approve on everyone who wants to come to their own reading
 * group is admin for its own sake.
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
  if (!event || event.status !== "confirmed") {
    return fail("This one isn't open for sign-ups.");
  }
  if (event.date < todayAms()) return fail("This one's already happened.");
  const coworking = isCoworkingDay(event.type);

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

  // A row already exists. Someone who took their *own* name off is changing
  // their mind, not being turned away — put them back rather than telling
  // them the organiser couldn't fit them in. Undo has to be undoable, or the
  // "can't make it" link is a one-way door people won't risk using.
  let guestId: string;
  if (already && already.decidedBy === SELF_WITHDRAWN && already.status === "declined") {
    guestId = already.id;
    await db
      .update(eventGuests)
      .set({
        status: coworking ? "pending" : "approved",
        decidedAt: coworking ? null : new Date(),
        decidedBy: coworking ? null : "open_signup",
        accessibilityNotes: accessibilityNotes || already.accessibilityNotes,
        guidelinesAcceptedAt: new Date(),
      })
      .where(eq(eventGuests.id, already.id));
  } else if (already) {
    return fail(
      already.status === "pending"
        ? "You've already asked to join — the organiser will get back to you."
        : already.status === "approved"
          ? "You're already on the list for this one — see you there!"
          : "The organiser wasn't able to fit you in this time."
    );
  } else {
    guestId = newId("eg");
    await db.insert(eventGuests).values({
      id: guestId,
      eventId,
      userId,
      // No desks to ration in the evening, so nothing to decide.
      status: coworking ? "pending" : "approved",
      decidedAt: coworking ? null : new Date(),
      decidedBy: coworking ? null : "open_signup",
      accessibilityNotes: accessibilityNotes || null,
      guidelinesAcceptedAt: new Date(),
    });
  }

  const when = `${formatDayLong(event.date)}${event.startsAt ? `, ${event.startsAt}${event.endsAt ? `–${event.endsAt}` : ""}` : ""}`;
  if (coworking) {
    await sendEmail({
      to: email,
      subject: `Request received: ${event.title}`,
      kind: "event_guest_request",
      html: `<p>Hi ${name},</p>
<p>Thanks for asking to join <strong>${event.title}</strong> on ${formatDayLong(event.date)}. The organiser curates this one directly, so you'll get an email either way once they've had a look.</p>
<p>Changed your mind? ${link(leaveEventUrl(guestId, event.date), "Withdraw your request")} — no login needed.</p>`,
    });
  } else {
    // Everything they need to turn up, in the email they'll still have on
    // the night — including the two things people always ask about.
    const cfg = await getSettings();
    await sendEmail({
      to: email,
      subject: `You're on the list: ${event.title}`,
      kind: "event_signup_confirmed",
      html: `<p>Hi ${name},</p>
<p>You're signed up for <strong>${event.title}</strong> — ${when}. No desk booking needed, just come along.</p>
<p><strong>Where:</strong> ${cfg.office_address}</p>
<p>The connecting doors to the main area close at 18:00, so if you arrive after that and the office door is shut, knock or message the organiser.</p>
<p>${link(`${appUrl()}/info`, "Practical info about the office")} — getting here, wifi, the house guidelines.</p>
<p>Can't make it after all? ${link(leaveEventUrl(guestId, event.date), "Take yourself off the list")} — one tap, no login, and it saves the organiser setting out a chair for you.</p>`,
    });
  }

  const organiserIds = event.createdBy
    ? [event.createdBy]
    : (await db.select({ id: users.id }).from(users).where(eq(users.role, "admin"))).map(
        (a) => a.id
      );
  const organisers = await db.select().from(users).where(inArray(users.id, organiserIds));
  const spots = coworking ? await coworkingSpots(event.date) : null;
  const signedUp = coworking
    ? 0
    : (
        await db
          .select({ id: eventGuests.id })
          .from(eventGuests)
          .where(
            and(eq(eventGuests.eventId, eventId), eq(eventGuests.status, "approved"))
          )
      ).length;
  for (const o of organisers) {
    await sendEmail({
      to: o.email,
      subject: coworking
        ? `${name} wants to join ${event.title}`
        : `${name} signed up for ${event.title}`,
      kind: coworking
        ? "event_guest_request_organiser"
        : "event_signup_organiser",
      html: coworking
        ? `<p><strong>${name}</strong> (${email}) asked to join <strong>${event.title}</strong> on ${formatDayLong(event.date)}.</p>
${accessibilityNotes ? `<p>${accessibilityNotes.replace(/</g, "&lt;")}</p>` : ""}
<p>${spots!.left > 0 ? `${spots!.left} of ${spots!.total} spots still free.` : `The room is full — all ${spots!.total} spots are taken.`}</p>
<p>${link(`${appUrl()}/events/${eventId}/guests`, "Review guest requests")}</p>`
        : `<p><strong>${name}</strong> (${email}) signed up for <strong>${event.title}</strong> on ${formatDayLong(event.date)}. That's ${signedUp} ${signedUp === 1 ? "person" : "people"} so far.</p>
${accessibilityNotes ? `<p>${accessibilityNotes.replace(/</g, "&lt;")}</p>` : ""}
<p>${link(`${appUrl()}/events/${eventId}/guests`, "See who's coming")}</p>`,
    });
  }

  revalidatePath(`/events/${eventId}/guests`);
  return { ok: true };
}

/**
 * "Can't make it" for someone who happens to be logged in — the same thing
 * the emailed link does, without needing to find the email. Only ever acts on
 * the caller's own sign-up.
 */
export async function leaveEventAction(
  eventId: string
): Promise<{ ok?: boolean; error?: string }> {
  const user = await getCurrentUser();
  if (!user) return { error: "You need to be logged in." };
  const [guest] = await db
    .select()
    .from(eventGuests)
    .where(and(eq(eventGuests.eventId, eventId), eq(eventGuests.userId, user.id)));
  if (!guest) return { error: "You're not on the list for this one." };
  const res = await leaveEvent(guest.id);
  if (!res.ok) return { error: res.error };
  revalidatePath(`/events/${eventId}/rsvp`);
  revalidatePath(`/events/${eventId}/guests`);
  revalidatePath("/me");
  revalidatePath("/book");
  revalidatePath("/");
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
  if (decision === "approved" && isCoworkingDay(event.type) && event.date >= todayAms()) {
    const res = await seatGuest(guest.userId, event.date);
    if (!res.ok) {
      // Freeing a seat only helps when a full room is what stopped us —
      // pinning that advice to every failure sent organisers declining
      // people over a day they couldn't have fixed by declining anyone.
      return {
        error: res.full
          ? `${res.error} Cancel or decline someone else first, then approve them.`
          : res.error,
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
  if (decision === "declined" && guest.status === "approved" && isCoworkingDay(event.type)) {
    const ours = await guestSeatBooking(guest.userId, event.date);
    if (ours) await cancelBooking(ours.id);
    else keptOwnBooking = !!(await bookedThatDay(event.date)).find(
      (b) => b.user.id === guest.userId
    );
  }

  const [guestUser] = await db.select().from(users).where(eq(users.id, guest.userId));
  if (guestUser) {
    const coworking = isCoworkingDay(event.type);
    await sendEmail({
      to: guestUser.email,
      subject:
        decision === "approved"
          ? `You're in: ${event.title}`
          : `About ${event.title}`,
      kind: decision === "approved" ? "event_guest_approved" : "event_guest_declined",
      html:
        decision === "approved"
          ? `<p>Hi ${guestUser.name},</p>
<p>You're confirmed for <strong>${event.title}</strong> on ${formatDayLong(event.date)}${event.startsAt ? `, ${event.startsAt}${event.endsAt ? `–${event.endsAt}` : ""}` : ""} — see you there!</p>
${seat ? `<p>You've got <strong>${seat}</strong>. Scan the QR code by the door when you arrive.</p>` : ""}
<p>Can't make it after all? ${link(leaveEventUrl(guest.id, event.date), "Let us know in one tap")}${seat ? " — it hands your desk back for someone else that day" : ""}.</p>
<p>${link(`${appUrl()}/info`, "Practical info about the office")} — where it is, wifi, lunch.</p>`
          : coworking
            ? `<p>Hi ${guestUser.name},</p><p>Thanks for asking to join <strong>${event.title}</strong> — we can't fit you in this time. Hope to see you at a future one.</p>`
            : // Nobody was turned away here: an evening event doesn't ration
              // seats, so this is the organiser taking off someone who said
              // they can't come. Saying "we couldn't fit you in" would be a
              // small lie, and an upsetting one.
              `<p>Hi ${guestUser.name},</p><p>You've been taken off the list for <strong>${event.title}</strong> on ${formatDayLong(event.date)}. If that's a mistake, ${link(`${appUrl()}/events/${event.id}/rsvp`, "sign up again")} or let the organiser know.</p>`,
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

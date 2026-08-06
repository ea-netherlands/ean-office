"use server";

import { revalidatePath } from "next/cache";
import { db, events, eventGuests, eventAttendance, users } from "@/db";
import { and, eq, inArray } from "drizzle-orm";
import { getCurrentUser, isAdmin, appUrl } from "@/lib/auth";
import { sendEmail, link } from "@/lib/email";
import { formatDayLong, todayAms } from "@/lib/dates";
import { isCoworkingDay } from "@/lib/coworking";
import { guestSeatBooking } from "@/lib/coworking-guests";
import { cancelBooking } from "@/lib/booking";

export type CancelEventState = { ok?: boolean; error?: string; note?: string };

/**
 * Call off a confirmed event. Open to the organiser as well as admins: the
 * person whose plans changed is usually the one who knows first, and making
 * them email an admin to press a button is how an office ends up closed for a
 * day that nobody is using.
 *
 * The row survives as `cancelled` rather than being deleted — the funder
 * counts only include confirmed events, so a reporting period shouldn't
 * change shape retroactively, and "what happened to that day?" stays
 * answerable.
 */
export async function cancelEventAction(
  eventId: string,
  reason: string
): Promise<CancelEventState> {
  const user = await getCurrentUser();
  if (!user) return { error: "You need to be logged in." };

  const [event] = await db.select().from(events).where(eq(events.id, eventId));
  if (!event) return { error: "Event not found." };
  if (!isAdmin(user) && event.createdBy !== user.id) {
    return { error: "Only an admin or the organiser can cancel this." };
  }
  if (event.status === "cancelled") return { ok: true }; // idempotent
  if (event.status !== "confirmed") {
    return { error: "Only confirmed events can be cancelled." };
  }

  const why = reason.trim().slice(0, 500);
  const coworking = isCoworkingDay(event.type);
  const future = event.date >= todayAms();

  await db
    .update(events)
    .set({
      status: "cancelled",
      cancelledAt: new Date(),
      cancelledBy: user.id,
      cancelReason: why || null,
    })
    .where(eq(events.id, eventId));

  const because = why ? `<p>${why.replace(/</g, "&lt;")}</p>` : "";
  const when = formatDayLong(event.date);
  let released = 0;

  // Everyone who was told they had a place needs telling that they don't.
  const guests = await db
    .select({ g: eventGuests, u: users })
    .from(eventGuests)
    .innerJoin(users, eq(users.id, eventGuests.userId))
    .where(
      and(
        eq(eventGuests.eventId, eventId),
        inArray(eventGuests.status, ["pending", "approved"])
      )
    );

  for (const { g, u } of guests) {
    // Desks we handed out for the day go back to the pool; a booking someone
    // made themselves before the takeover is theirs to keep, and the day is
    // open again anyway.
    if (coworking && future && g.status === "approved") {
      const ours = await guestSeatBooking(u.id, event.date);
      if (ours) {
        await cancelBooking(ours.id, { promote: false });
        released++;
      }
    }
    if (u.id === event.createdBy) continue; // they're the one cancelling
    await sendEmail({
      to: u.email,
      subject: `Cancelled: ${event.title} on ${when}`,
      kind: "event_cancelled_guest",
      html: `<p>Hi ${u.name},</p>
<p><strong>${event.title}</strong> on ${when} has been called off, so there's nothing to come to. Sorry for the change of plan.</p>
${because}
${coworking && future ? `<p>The office is back to normal desk booking that day — ${link(`${appUrl()}/book`, "book a desk if you'd still like to come in")}.</p>` : ""}`,
    });
  }

  // People who lost a booking when this day cleared the office should be the
  // first to hear the space is theirs again.
  if (coworking && future && event.displacedUserIds?.length) {
    const displaced = await db
      .select()
      .from(users)
      .where(inArray(users.id, event.displacedUserIds));
    for (const person of displaced) {
      await sendEmail({
        to: person.email,
        subject: `${when} is free again`,
        kind: "coworking_day_reopened",
        html: `<p>Hi ${person.name},</p>
<p>Good news, and an apology for the back and forth: <strong>${event.title}</strong> isn't happening after all, so ${when} is an ordinary office day again — the day we cancelled your booking for.</p>
${because}
<p>Your old booking couldn't be un-cancelled, so if you'd still like that day: ${link(`${appUrl()}/book`, "book it back")}. It's first come, first served, hence the heads-up.</p>`,
      });
    }
  }

  // Evening events collect RSVPs rather than a guest list.
  if (!coworking) {
    const rsvps = await db
      .select({ u: users })
      .from(eventAttendance)
      .innerJoin(users, eq(users.id, eventAttendance.userId))
      .where(
        and(eq(eventAttendance.eventId, eventId), eq(eventAttendance.source, "rsvp"))
      );
    for (const { u } of rsvps) {
      if (u.id === event.createdBy) continue;
      await sendEmail({
        to: u.email,
        subject: `Cancelled: ${event.title} on ${when}`,
        kind: "event_cancelled_guest",
        html: `<p>Hi ${u.name},</p>
<p>You RSVP'd to <strong>${event.title}</strong> on ${when}, and it's been called off. Sorry for the change of plan.</p>
${because}`,
      });
    }
  }

  // Whoever didn't press the button hears about it: admins when an organiser
  // cancels, the organiser when an admin does.
  const cancelledByOrganiser = event.createdBy === user.id;
  if (cancelledByOrganiser) {
    const admins = await db.select().from(users).where(eq(users.role, "admin"));
    for (const admin of admins) {
      await sendEmail({
        to: admin.email,
        subject: `${user.name} cancelled ${event.title} (${when})`,
        kind: "event_cancelled_admin",
        html: `<p><strong>${user.name}</strong> called off their ${coworking ? "co-working day" : "event"} <strong>${event.title}</strong> on ${when}.</p>
${because}
<p>${guests.length > 0 ? `${guests.length} ${guests.length === 1 ? "person has" : "people have"} been told.` : "Nobody had signed up yet."}${released > 0 ? ` ${released} ${released === 1 ? "desk was" : "desks were"} released.` : ""}${coworking && future ? " The day is open for normal booking again." : ""}</p>
<p>${link(`${appUrl()}/admin/events`, "See it in the events list")}</p>`,
      });
    }
  } else if (event.createdBy) {
    const [organiser] = await db
      .select()
      .from(users)
      .where(eq(users.id, event.createdBy));
    if (organiser) {
      await sendEmail({
        to: organiser.email,
        subject: `Cancelled: ${event.title} on ${when}`,
        kind: "event_cancelled_organiser",
        html: `<p>Hi ${organiser.name},</p>
<p>We've had to call off your ${coworking ? "co-working day" : "event"} <strong>${event.title}</strong> on ${when}. Sorry — we know you'd put work into it.</p>
${because}
<p>${guests.length > 0 ? `Everyone who'd signed up has been told, so there's nothing you need to send.` : "Nobody had signed up yet, so there was nobody to tell."} If another date would work, just propose it and we'll sort it out.</p>`,
      });
    }
  }

  revalidatePath("/admin/events");
  revalidatePath(`/events/${eventId}/guests`);
  revalidatePath("/book");
  revalidatePath("/me");
  revalidatePath("/");

  const told = guests.length + (event.displacedUserIds?.length ?? 0);
  return {
    ok: true,
    note: `Cancelled.${told > 0 ? ` ${told} ${told === 1 ? "person has" : "people have"} been emailed.` : " Nobody had signed up, so no emails went out."}${released > 0 ? ` ${released} ${released === 1 ? "desk is" : "desks are"} back in the pool.` : ""}`,
  };
}

"use server";

import { revalidatePath } from "next/cache";
import { db, events, users } from "@/db";
import { and, eq, inArray } from "drizzle-orm";
import { getCurrentUser, isActiveMember, appUrl } from "@/lib/auth";
import { newId } from "@/lib/ids";
import { sendEmail, link } from "@/lib/email";
import { addDays, formatDayLong, todayAms } from "@/lib/dates";
import { COWORKING_TYPE, validateCoworkingDay } from "@/lib/coworking";
import { getSettings } from "@/lib/settings";
import { bookedThatDay } from "@/lib/coworking-guests";
import { EchoState, formValues } from "@/lib/form-values";

export type CoworkingProposalState = EchoState & {
  ok?: boolean;
  eventId?: string;
};

const FIELDS = [
  "title",
  "date",
  "startsAt",
  "endsAt",
  "expectedAttendance",
  "proposalNote",
] as const;

/**
 * A member proposing to run a co-working day. It lands in the same admin
 * queue as evening events — the difference is what confirming it does, since
 * a co-working day closes the office to general booking for the whole day.
 */
export async function proposeCoworkingDayAction(
  _prev: CoworkingProposalState,
  formData: FormData
): Promise<CoworkingProposalState> {
  const values = formValues(formData, FIELDS);
  const attempt = (_prev.attempt ?? 0) + 1;
  const fail = (error: string, field?: string): CoworkingProposalState => ({
    error,
    field,
    values,
    attempt,
  });

  const user = await getCurrentUser();
  if (!isActiveMember(user)) {
    return fail("You need to be logged in as a member to organise a co-working day.");
  }

  const title = String(formData.get("title") || "").trim();
  const date = String(formData.get("date") || "");
  const startsAt = String(formData.get("startsAt") || "") || null;
  const endsAt = String(formData.get("endsAt") || "") || null;
  const expected = Number(formData.get("expectedAttendance"));
  const note = String(formData.get("proposalNote") || "").trim().slice(0, 1000);

  if (!title) return fail("Give the day a name.", "title");
  const cfg = await getSettings();
  const today = todayAms();
  const dateError = validateCoworkingDay(
    date,
    startsAt,
    endsAt,
    today,
    addDays(today, cfg.coworking_horizon_weeks * 7)
  );
  if (dateError) return fail(dateError, dateError.includes("time") ? "startsAt" : "date");

  // Two co-working days on one date can't both happen — evening events on the
  // same date are fine and left for the admin to eyeball.
  const clashes = await db
    .select({ id: events.id, status: events.status })
    .from(events)
    .where(
      and(
        eq(events.date, date),
        eq(events.type, COWORKING_TYPE),
        inArray(events.status, ["proposed", "confirmed"])
      )
    );
  if (clashes.length > 0) {
    return fail(
      clashes.some((c) => c.status === "confirmed")
        ? "There's already a co-working day booked for that date — pick another day."
        : "Someone has already proposed a co-working day for that date. Talk to the team before adding a second one.",
      "date"
    );
  }

  const [event] = await db
    .insert(events)
    .values({
      id: newId("ev"),
      title,
      date,
      startsAt,
      endsAt,
      type: COWORKING_TYPE,
      organiser: "ean",
      source: "manual",
      status: "proposed",
      expectedAttendance: Number.isFinite(expected) && expected > 0 ? expected : null,
      proposalNote: note || null,
      createdBy: user!.id,
    })
    .returning();

  const alreadyBooked = await bookedThatDay(date);
  const admins = await db.select().from(users).where(eq(users.role, "admin"));
  for (const admin of admins) {
    await sendEmail({
      to: admin.email,
      subject: `Co-working day proposed by ${user!.name}: ${title}`,
      kind: "coworking_day_proposed",
      html: `<p><strong>${user!.name}</strong> would like to run a co-working day at the office.</p>
<p><strong>${title}</strong><br>
${formatDayLong(date)}${startsAt ? ` · ${startsAt}${endsAt ? `–${endsAt}` : ""}` : ""}<br>
${expected ? `Expecting around ${expected} people` : "No attendance estimate given"}</p>
${note ? `<p>${note.replace(/</g, "&lt;")}</p>` : ""}
<p>Confirming closes that day to general desk booking. <strong>${alreadyBooked.length === 0 ? "Nobody has booked that day yet." : `${alreadyBooked.length} ${alreadyBooked.length === 1 ? "person has" : "people have"} already booked that day`}</strong>${alreadyBooked.length > 0 ? ` — they keep their desks and we'll tell them what's happening: ${alreadyBooked.map((b) => b.user.name).join(", ")}.` : ""}</p>
<p>${link(`${appUrl()}/admin/events`, "Confirm or decline it")}</p>`,
    });
  }

  revalidatePath("/admin/events");
  return { ok: true, eventId: event.id };
}

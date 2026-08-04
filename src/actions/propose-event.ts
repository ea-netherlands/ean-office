"use server";

import { revalidatePath } from "next/cache";
import { db, events, users } from "@/db";
import { eq } from "drizzle-orm";
import { getCurrentUser, isActiveMember, appUrl } from "@/lib/auth";
import { newId } from "@/lib/ids";
import { sendEmail, link } from "@/lib/email";
import { formatDayLong, todayAms } from "@/lib/dates";
import { validateEventHours } from "@/lib/event-hours";

export type ProposeState = { ok?: boolean; error?: string };

/**
 * Members can propose an event at the office; it lands in the admin queue
 * rather than going straight onto the calendar. Proposed events are invisible
 * to other members and excluded from the funder-facing counts until confirmed.
 */
export async function proposeEventAction(
  _prev: ProposeState,
  formData: FormData
): Promise<ProposeState> {
  const user = await getCurrentUser();
  if (!isActiveMember(user)) {
    return { error: "You need to be logged in as a member to propose an event." };
  }

  const title = String(formData.get("title") || "").trim();
  const date = String(formData.get("date") || "");
  const startsAt = String(formData.get("startsAt") || "") || null;
  const endsAt = String(formData.get("endsAt") || "") || null;
  const type = String(formData.get("type") || "other");
  const expected = Number(formData.get("expectedAttendance"));
  const note = String(formData.get("proposalNote") || "").trim().slice(0, 1000);

  if (!title) return { error: "Give your event a name." };
  if (!date) return { error: "Pick a date." };
  if (date < todayAms()) return { error: "That date has already passed." };
  const hoursError = validateEventHours(type, startsAt, endsAt);
  if (hoursError) return { error: hoursError };

  await db.insert(events).values({
    id: newId("ev"),
    title,
    date,
    startsAt,
    endsAt,
    type: type as typeof events.$inferInsert.type,
    organiser: "ean",
    source: "manual",
    status: "proposed",
    expectedAttendance: Number.isFinite(expected) && expected > 0 ? expected : null,
    proposalNote: note || null,
    createdBy: user!.id,
  });

  const admins = await db.select().from(users).where(eq(users.role, "admin"));
  for (const admin of admins) {
    await sendEmail({
      to: admin.email,
      subject: `Event proposal from ${user!.name}: ${title}`,
      kind: "event_proposed",
      html: `<p><strong>${user!.name}</strong> would like to host an event at the office.</p>
<p><strong>${title}</strong><br>
${formatDayLong(date)}${startsAt ? ` · ${startsAt}${endsAt ? `–${endsAt}` : ""}` : ""}<br>
${expected ? `Expecting around ${expected} people` : "No attendance estimate given"}</p>
${note ? `<p>${note.replace(/</g, "&lt;")}</p>` : ""}
<p>${link(`${appUrl()}/admin/events`, "Confirm or decline it")}</p>`,
    });
  }

  revalidatePath("/admin/events");
  return { ok: true };
}

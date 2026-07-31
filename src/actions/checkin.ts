"use server";

import { revalidatePath } from "next/cache";
import { db, events, eventAttendance } from "@/db";
import { and, eq } from "drizzle-orm";
import { getCurrentUser } from "@/lib/auth";
import { checkInUser } from "@/lib/booking";
import { newId } from "@/lib/ids";
import { todayAms } from "@/lib/dates";

export type CheckinState = {
  ok?: boolean;
  already?: boolean;
  walkIn?: boolean;
  overCapacity?: boolean;
  error?: string;
};

export async function checkinAction(): Promise<CheckinState> {
  const user = await getCurrentUser();
  if (!user) return { error: "Not logged in." };
  const res = await checkInUser(user.id, todayAms());
  revalidatePath("/");
  revalidatePath("/checkin");
  if (!res.ok) return { error: res.error };
  if (res.kind === "already") return { ok: true, already: true };
  return { ok: true, walkIn: res.walkIn, overCapacity: res.overCapacity };
}

/** "I'm here for [event]" — also records a desk check-in so the day counts. */
export async function eventCheckinAction(eventId: string): Promise<CheckinState> {
  const user = await getCurrentUser();
  if (!user) return { error: "Not logged in." };
  const [event] = await db.select().from(events).where(eq(events.id, eventId));
  if (!event || event.date !== todayAms()) return { error: "No such event today." };

  const existing = await db
    .select()
    .from(eventAttendance)
    .where(
      and(
        eq(eventAttendance.eventId, eventId),
        eq(eventAttendance.userId, user.id),
        eq(eventAttendance.source, "checkin")
      )
    );
  if (existing.length === 0) {
    await db.insert(eventAttendance).values({
      id: newId("ea"),
      eventId,
      userId: user.id,
      source: "checkin",
    });
  }
  await checkInUser(user.id, todayAms());
  revalidatePath("/checkin");
  return { ok: true };
}

export async function rsvpAction(eventId: string): Promise<{ ok: boolean }> {
  const user = await getCurrentUser();
  if (!user) return { ok: false };
  const existing = await db
    .select()
    .from(eventAttendance)
    .where(
      and(
        eq(eventAttendance.eventId, eventId),
        eq(eventAttendance.userId, user.id),
        eq(eventAttendance.source, "rsvp")
      )
    );
  if (existing.length === 0) {
    await db.insert(eventAttendance).values({
      id: newId("ea"),
      eventId,
      userId: user.id,
      source: "rsvp",
    });
  }
  revalidatePath("/");
  return { ok: true };
}

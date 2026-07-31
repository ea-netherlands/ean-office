"use server";

import { db, users, ensureMigrated } from "@/db";
import { eq } from "drizzle-orm";
import { verifyToken } from "@/lib/tokens";
import { cancelBooking, checkInUser } from "@/lib/booking";
import { clearNoShow } from "@/lib/noshow";

// Actions behind signed single-purpose email links. No session required, and
// none of these ever grant one.

export async function cancelByTokenAction(
  token: string
): Promise<{ ok?: boolean; error?: string }> {
  await ensureMigrated();
  const verified = verifyToken(token, "cancel");
  if (!verified) return { error: "This link has expired." };
  const res = await cancelBooking(verified.subject);
  if (!res.ok) return { error: "Booking not found." };
  return { ok: true };
}

export async function retroByTokenAction(
  token: string
): Promise<{ ok?: boolean; error?: string }> {
  await ensureMigrated();
  const verified = verifyToken(token, "retro");
  if (!verified) return { error: "This link has expired." };
  const [userId, date] = verified.subject.split(":");
  if (!userId || !date) return { error: "Invalid link." };

  const res = await checkInUser(userId, date, { retroactive: true });
  if (!res.ok) return { error: res.error };
  // Retroactive check-ins remove the no-show from the count.
  await clearNoShow(userId, date, "retro_checkin");
  return { ok: true };
}

export async function optoutByTokenAction(
  token: string
): Promise<{ ok?: boolean; error?: string }> {
  await ensureMigrated();
  const verified = verifyToken(token, "optout");
  if (!verified) return { error: "This link has expired." };
  await db
    .update(users)
    .set({ noshowEmailOptOut: true })
    .where(eq(users.id, verified.subject));
  return { ok: true };
}

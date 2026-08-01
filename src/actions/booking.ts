"use server";

import { revalidatePath } from "next/cache";
import { db, bookings, users } from "@/db";
import { and, eq, inArray } from "drizzle-orm";
import { getCurrentUser, isActiveMember } from "@/lib/auth";
import {
  bookDay,
  cancelBooking,
  cancelSeries,
  createBlockBooking,
  previewBlockBooking,
  switchDesk,
  BlockPreview,
} from "@/lib/booking";
import { getSettings } from "@/lib/settings";

export type BookActionState = {
  ok?: boolean;
  error?: string;
  waitlisted?: boolean;
  seatType?: "desk" | "flex";
  needsProfile?: boolean;
  date?: string;
  deskNumber?: number;
};

/**
 * Members who haven't completed the M&E profile are asked inline before the
 * booking completes — skippable profile_skip_limit times, then required.
 */
async function profileGate(userId: string): Promise<"ok" | "required" | "askable"> {
  const cfg = await getSettings();
  const [user] = await db.select().from(users).where(eq(users.id, userId));
  if (!user) return "ok";
  if (user.causeArea) return "ok";
  return user.profileSkipCount >= cfg.profile_skip_limit ? "required" : "askable";
}

export async function bookDateAction(
  date: string,
  opts: { skipProfile?: boolean; deskNumber?: number } = {}
): Promise<BookActionState> {
  const user = await getCurrentUser();
  if (!isActiveMember(user)) return { error: "You need to be logged in as a member." };

  const gate = await profileGate(user!.id);
  if (gate !== "ok" && !opts.skipProfile) {
    return { needsProfile: true, date };
  }
  if (gate === "askable" && opts.skipProfile) {
    await db
      .update(users)
      .set({ profileSkipCount: user!.profileSkipCount + 1 })
      .where(eq(users.id, user!.id));
  }
  if (gate === "required" && opts.skipProfile) {
    return { needsProfile: true, date, error: "Please complete your profile first — it takes 30 seconds." };
  }

  const res = await bookDay(user!.id, date, { deskNumber: opts.deskNumber });
  revalidatePath("/book");
  revalidatePath("/");
  if (!res.ok) return { error: res.error };
  if ("waitlisted" in res) return { ok: true, waitlisted: true, date };
  return {
    ok: true,
    seatType: res.seatType,
    date,
    deskNumber: "booking" in res ? res.booking.deskNumber ?? undefined : undefined,
  };
}

export async function switchDeskAction(
  bookingId: string,
  deskNumber: number
): Promise<{ ok: boolean; error?: string }> {
  const user = await getCurrentUser();
  if (!user) return { ok: false, error: "Not logged in." };
  const res = await switchDesk(bookingId, user.id, deskNumber);
  revalidatePath("/book");
  revalidatePath("/");
  return res;
}

export async function joinWaitlistAction(date: string): Promise<BookActionState> {
  const user = await getCurrentUser();
  if (!isActiveMember(user)) return { error: "You need to be logged in as a member." };
  const res = await bookDay(user!.id, date, { allowWaitlist: true });
  revalidatePath("/book");
  if (!res.ok) return { error: res.error };
  return { ok: true, waitlisted: "waitlisted" in res, date };
}

export async function cancelBookingAction(
  bookingId: string
): Promise<{ ok: boolean; error?: string }> {
  const user = await getCurrentUser();
  if (!user) return { ok: false, error: "Not logged in." };
  const [booking] = await db
    .select()
    .from(bookings)
    .where(eq(bookings.id, bookingId));
  if (!booking) return { ok: false, error: "Booking not found." };
  if (booking.userId !== user.id && user.role !== "admin") {
    return { ok: false, error: "Not your booking." };
  }
  await cancelBooking(bookingId);
  revalidatePath("/book");
  revalidatePath("/me");
  revalidatePath("/");
  return { ok: true };
}

export async function cancelSeriesAction(
  seriesId: string
): Promise<{ ok: boolean; cancelled: number }> {
  const user = await getCurrentUser();
  if (!user) return { ok: false, cancelled: 0 };
  const n = await cancelSeries(seriesId, user.id);
  revalidatePath("/book");
  revalidatePath("/me");
  return { ok: true, cancelled: n };
}

export type BlockState = {
  preview?: BlockPreview & { total: number };
  booked?: string[];
  error?: string;
};

export async function blockPreviewAction(
  weekdays: number[],
  until: string
): Promise<BlockState> {
  const user = await getCurrentUser();
  if (!isActiveMember(user)) return { error: "You need to be logged in as a member." };
  if (weekdays.length === 0) return { error: "Pick at least one weekday." };
  if (!until) return { error: "Pick an end date." };
  const preview = await previewBlockBooking(user!.id, weekdays, until);
  return {
    preview: {
      ...preview,
      total:
        preview.eligible.length +
        preview.skippedFull.length +
        preview.skippedBlockCap.length +
        preview.skippedExisting.length,
    },
  };
}

export async function blockCreateAction(
  weekdays: number[],
  until: string
): Promise<BlockState> {
  const user = await getCurrentUser();
  if (!isActiveMember(user)) return { error: "You need to be logged in as a member." };
  const res = await createBlockBooking(user!.id, weekdays, until);
  revalidatePath("/book");
  revalidatePath("/me");
  if (!res.ok) return { error: res.error };
  return { booked: res.booked };
}

"use server";

import { revalidatePath } from "next/cache";
import { db, bookings, users } from "@/db";
import { and, eq, inArray } from "drizzle-orm";
import { getCurrentUser, isActiveMember, SessionUser } from "@/lib/auth";
import {
  bookDay,
  cancelBooking,
  cancelSeries,
  changeSlot,
  createBlockBooking,
  previewBlockBooking,
  switchSeat,
  SeatTarget,
  BlockPreview,
} from "@/lib/booking";
import { Slot } from "@/lib/slots";
import { getSettings, Settings } from "@/lib/settings";

export type BookActionState = {
  ok?: boolean;
  error?: string;
  waitlisted?: boolean;
  seatType?: "desk" | "flex";
  needsProfile?: boolean;
  date?: string;
  deskNumber?: number;
  slot?: Slot;
};

/**
 * Members who haven't completed the M&E profile are asked inline before the
 * booking completes — skippable profile_skip_limit times, then required.
 *
 * Takes the user the caller already has: `getCurrentUser` returns the whole
 * row, so re-selecting it here was a wasted round-trip on every booking.
 */
function profileGate(
  user: SessionUser,
  cfg: Settings
): "ok" | "required" | "askable" {
  if (user.causeArea) return "ok";
  return user.profileSkipCount >= cfg.profile_skip_limit ? "required" : "askable";
}

export async function bookDateAction(
  date: string,
  opts: {
    skipProfile?: boolean;
    deskNumber?: number;
    seatType?: "desk" | "flex";
    slot?: Slot;
  } = {}
): Promise<BookActionState> {
  const user = await getCurrentUser();
  if (!isActiveMember(user)) return { error: "You need to be logged in as a member." };

  const cfg = await getSettings();
  const gate = profileGate(user!, cfg);
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

  const slot = opts.slot ?? "day";
  const res = await bookDay(user!.id, date, {
    deskNumber: opts.deskNumber,
    seatType: opts.seatType,
    slot,
    user: user!,
    cfg,
  });
  revalidatePath("/book");
  revalidatePath("/");
  if (!res.ok) return { error: res.error };
  if ("waitlisted" in res) return { ok: true, waitlisted: true, date, slot };
  return {
    ok: true,
    seatType: res.seatType,
    date,
    slot,
    deskNumber: "booking" in res ? res.booking.deskNumber ?? undefined : undefined,
  };
}

export async function switchSeatAction(
  bookingId: string,
  target: SeatTarget
): Promise<{ ok: boolean; error?: string }> {
  const user = await getCurrentUser();
  if (!user) return { ok: false, error: "Not logged in." };
  const res = await switchSeat(bookingId, user.id, target);
  revalidatePath("/book");
  revalidatePath("/");
  return res;
}

/** Stretch a half day to a full one, trim one, or swap morning for afternoon. */
export async function changeSlotAction(
  bookingId: string,
  slot: Slot
): Promise<{ ok: boolean; error?: string; deskNumber?: number | null }> {
  const user = await getCurrentUser();
  if (!user) return { ok: false, error: "Not logged in." };
  const res = await changeSlot(bookingId, user.id, slot);
  revalidatePath("/book");
  revalidatePath("/me");
  revalidatePath("/");
  if (!res.ok) return { ok: false, error: res.error };
  return { ok: true, deskNumber: res.deskNumber };
}

export async function joinWaitlistAction(
  date: string,
  slot: Slot = "day"
): Promise<BookActionState> {
  const user = await getCurrentUser();
  if (!isActiveMember(user)) return { error: "You need to be logged in as a member." };
  const res = await bookDay(user!.id, date, { allowWaitlist: true, slot });
  revalidatePath("/book");
  if (!res.ok) return { error: res.error };
  return { ok: true, waitlisted: "waitlisted" in res, date, slot };
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
  until: string,
  slot: Slot = "day"
): Promise<BlockState> {
  const user = await getCurrentUser();
  if (!isActiveMember(user)) return { error: "You need to be logged in as a member." };
  if (weekdays.length === 0) return { error: "Pick at least one weekday." };
  if (!until) return { error: "Pick an end date." };
  const preview = await previewBlockBooking(user!.id, weekdays, until, slot);
  return {
    preview: {
      ...preview,
      total:
        preview.eligible.length +
        preview.skippedFull.length +
        preview.skippedBlockCap.length +
        preview.skippedExisting.length +
        preview.skippedCoworking.length,
    },
  };
}

export async function blockCreateAction(
  weekdays: number[],
  until: string,
  slot: Slot = "day"
): Promise<BlockState> {
  const user = await getCurrentUser();
  if (!isActiveMember(user)) return { error: "You need to be logged in as a member." };
  const res = await createBlockBooking(user!.id, weekdays, until, slot);
  revalidatePath("/book");
  revalidatePath("/me");
  if (!res.ok) return { error: res.error };
  return { booked: res.booked };
}

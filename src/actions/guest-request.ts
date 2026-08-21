"use server";

import { revalidatePath } from "next/cache";
import { getCurrentUser, isActiveMember } from "@/lib/auth";
import { asSlot } from "@/lib/slots";
import {
  createGuestRequest,
  approveGuestRequest,
  declineGuestRequest,
} from "@/lib/guest-requests";
import { EchoState, formValues } from "@/lib/form-values";

export type GuestBookingState = EchoState & { ok?: boolean };

const FIELDS = [
  "guestName",
  "guestEmail",
  "date",
  "endDate",
  "slot",
  "visitType",
  "reason",
] as const;

/**
 * A member asking for a desk for someone with no account. Echoes answers back
 * on failure like every other form here — losing a written justification to a
 * validation error is exactly the paper cut `form-values` exists to stop.
 */
export async function requestGuestBookingAction(
  prev: GuestBookingState,
  formData: FormData
): Promise<GuestBookingState> {
  const user = await getCurrentUser();
  if (!isActiveMember(user)) {
    return { error: "You need to be logged in as a member to bring someone." };
  }
  const values = formValues(formData, FIELDS);
  const attempt = (prev.attempt ?? 0) + 1;

  const visitType =
    String(formData.get("visitType")) === "first_visit" ? "first_visit" : "one_off";

  const res = await createGuestRequest(
    { id: user!.id, name: user!.name, email: user!.email },
    {
      guestName: String(formData.get("guestName") ?? ""),
      guestEmail: String(formData.get("guestEmail") ?? ""),
      date: String(formData.get("date") ?? ""),
      endDate: String(formData.get("endDate") ?? "") || undefined,
      slot: asSlot(formData.get("slot")),
      visitType,
      reason: String(formData.get("reason") ?? ""),
    }
  );

  if (!res.ok) return { error: res.error, field: res.field, values, attempt };

  revalidatePath("/me");
  return { ok: true };
}

// ---------- admin decisions ----------

export type GuestDecisionState = { ok?: boolean; error?: string; note?: string };

async function requireAdmin() {
  const user = await getCurrentUser();
  if (!user || user.role !== "admin") throw new Error("Admin only");
  return user;
}

export async function approveGuestRequestAction(
  requestId: string
): Promise<GuestDecisionState> {
  const admin = await requireAdmin();
  const res = await approveGuestRequest(requestId, { id: admin.id });
  revalidatePath("/admin/requests");
  revalidatePath("/book");
  return res.ok ? { ok: true, note: res.note } : { error: res.error };
}

export async function declineGuestRequestAction(
  requestId: string,
  reason: string
): Promise<GuestDecisionState> {
  const admin = await requireAdmin();
  const res = await declineGuestRequest(requestId, { id: admin.id }, reason ?? "");
  revalidatePath("/admin/requests");
  return res.ok ? { ok: true, note: res.note } : { error: res.error };
}

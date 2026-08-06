"use server";

import { revalidatePath } from "next/cache";
import { getCurrentUser } from "@/lib/auth";
import { MergePlan, mergeUsers, planMerge } from "@/lib/users";
import { sendEmail, link } from "@/lib/email";
import { appUrl } from "@/lib/auth";

export type MergeState = {
  ok?: boolean;
  error?: string;
  note?: string;
  plan?: MergePlan;
};

async function requireAdmin() {
  const user = await getCurrentUser();
  if (!user || user.role !== "admin") throw new Error("Admin only");
  return user;
}

export async function previewMergeAction(
  keepId: string,
  mergeId: string
): Promise<MergeState> {
  await requireAdmin();
  const plan = await planMerge(keepId, mergeId);
  if ("error" in plan) return { error: plan.error };
  return { ok: true, plan };
}

/**
 * Fold `mergeId` into `keepId`. Admin-only, and it emails the person
 * afterwards: their history just moved and both their addresses now work,
 * which they'd otherwise discover by accident.
 */
export async function mergeUsersAction(
  keepId: string,
  mergeId: string,
  opts: { notify?: boolean } = {}
): Promise<MergeState> {
  const admin = await requireAdmin();
  if (keepId === admin.id && mergeId === admin.id) {
    return { error: "That's the same account twice." };
  }

  const res = await mergeUsers(keepId, mergeId);
  if (!res.ok) return { error: res.error };

  const { keep, merge, bookings, checkins, clashingBookings, duplicateCheckins } =
    res.moved;

  if (opts.notify !== false) {
    await sendEmail({
      to: keep.email,
      subject: "Your two office accounts are now one",
      kind: "accounts_merged",
      html: `<p>Hi ${keep.name},</p>
<p>You had two accounts for the office — one under <strong>${keep.email}</strong> and one under <strong>${merge.email}</strong> — and we've put them together into a single one.</p>
<p><strong>Both addresses still work.</strong> Log in with either and you'll land in the same place, with all your bookings and check-ins in one history.</p>
<p>${link(`${appUrl()}/me`, "Have a look at your bookings")} — and if anything looks wrong, just reply to this email.</p>`,
    });
  }

  revalidatePath("/admin/members");
  revalidatePath("/admin/today");
  revalidatePath("/book");
  revalidatePath("/");

  const bits = [
    `${bookings} booking${bookings === 1 ? "" : "s"}`,
    `${checkins} check-in${checkins === 1 ? "" : "s"}`,
  ];
  const caveats = [
    clashingBookings > 0
      ? `${clashingBookings} duplicate booking${clashingBookings === 1 ? " was" : "s were"} cancelled (both accounts held the same day)`
      : "",
    duplicateCheckins > 0
      ? `${duplicateCheckins} duplicate check-in${duplicateCheckins === 1 ? "" : "s"} dropped`
      : "",
  ].filter(Boolean);

  return {
    ok: true,
    note: `Merged ${merge.email} into ${keep.email} — ${bits.join(" and ")} moved across.${
      caveats.length > 0 ? ` ${caveats.join("; ")}.` : ""
    } Both addresses now log in to the one account.`,
  };
}

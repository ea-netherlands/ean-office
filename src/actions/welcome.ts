"use server";

import { redirect } from "next/navigation";
import { db, users } from "@/db";
import { eq } from "drizzle-orm";
import { getCurrentUser } from "@/lib/auth";
import { revalidatePath } from "next/cache";

export type WelcomeState = { error?: string };

export async function claimAccountAction(
  _prev: WelcomeState,
  formData: FormData
): Promise<WelcomeState> {
  const user = await getCurrentUser();
  if (!user) redirect("/login?next=/welcome");
  if (user.status !== "imported") redirect("/book");

  const name = String(formData.get("name") || "").trim();
  const expectedFrequency = String(formData.get("expectedFrequency") || "");
  const accessibilityNotes = String(formData.get("accessibilityNotes") || "").trim();
  const guidelines = formData.get("guidelines") === "on";

  if (!name) return { error: "Please enter your name." };
  if (!expectedFrequency) return { error: "Please pick how often you expect to come." };
  if (!guidelines) return { error: "Please read and accept the office guidelines." };

  const now = new Date();
  await db
    .update(users)
    .set({
      name,
      expectedFrequency,
      accessibilityNotes: accessibilityNotes || null,
      guidelinesAcceptedAt: now,
      claimedAt: now,
      approvedAt: now,
      status: "active",
    })
    .where(eq(users.id, user.id));

  revalidatePath("/admin/members");
  redirect("/book");
}

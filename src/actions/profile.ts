"use server";

import { revalidatePath } from "next/cache";
import { db, users } from "@/db";
import { eq } from "drizzle-orm";
import { getCurrentUser } from "@/lib/auth";

export type ProfileState = { ok?: boolean; error?: string };

export async function saveProfileAction(
  _prev: ProfileState,
  formData: FormData
): Promise<ProfileState> {
  const user = await getCurrentUser();
  if (!user) return { error: "Not logged in." };

  const causeArea = String(formData.get("causeArea") || "");
  const roleCategory = String(formData.get("roleCategory") || "");
  const experienceLevel = String(formData.get("experienceLevel") || "");
  const eaFunding = String(formData.get("eaFunding") || "");
  const gender = String(formData.get("gender") || "");
  const funders = formData.getAll("funders").map(String);
  const causeAreaOther = String(formData.get("causeAreaOther") || "");

  if (!causeArea || !roleCategory || !experienceLevel || !eaFunding) {
    return { error: "Please answer the four required questions." };
  }

  await db
    .update(users)
    .set({
      causeArea,
      causeAreaOther: causeArea === "Other" ? causeAreaOther : null,
      roleCategory,
      experienceLevel,
      eaFunding: eaFunding as "direct" | "employer" | "none" | "undisclosed",
      funders: funders.length > 0 ? funders : null,
      gender: gender || null,
      profileUpdatedAt: new Date(),
    })
    .where(eq(users.id, user.id));

  revalidatePath("/me");
  revalidatePath("/book");
  return { ok: true };
}

/**
 * The member-facing community profile — separate from the M&E answers,
 * which are never shown to anyone. Opt-in via profileVisible.
 */
export async function saveCommunityProfileAction(
  _prev: ProfileState,
  formData: FormData
): Promise<ProfileState> {
  const user = await getCurrentUser();
  if (!user) return { error: "Not logged in." };

  const visible = formData.get("profileVisible") === "on";
  const publicCauseAreas = formData.getAll("publicCauseAreas").map(String);
  await db
    .update(users)
    .set({
      profileVisible: visible,
      bio: String(formData.get("bio") || "").slice(0, 500) || null,
      expertise: String(formData.get("expertise") || "").slice(0, 300) || null,
      publicCauseAreas: publicCauseAreas.length > 0 ? publicCauseAreas : null,
      publicLink: String(formData.get("publicLink") || "").slice(0, 300) || null,
    })
    .where(eq(users.id, user.id));

  revalidatePath("/me");
  revalidatePath("/book");
  revalidatePath("/");
  return { ok: true };
}

export async function updatePrefsAction(
  _prev: ProfileState,
  formData: FormData
): Promise<ProfileState> {
  const user = await getCurrentUser();
  if (!user) return { error: "Not logged in." };
  await db
    .update(users)
    .set({
      name: String(formData.get("name") || user.name),
      noshowEmailOptOut: formData.get("noshowEmailOptOut") === "on",
    })
    .where(eq(users.id, user.id));
  revalidatePath("/me");
  return { ok: true };
}

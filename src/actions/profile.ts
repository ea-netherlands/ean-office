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

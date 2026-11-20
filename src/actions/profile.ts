"use server";

import { cookies } from "next/headers";
import { revalidatePath } from "next/cache";
import { db, users } from "@/db";
import { eq } from "drizzle-orm";
import { getCurrentUser } from "@/lib/auth";
import { normaliseUrl } from "@/lib/url";
import { resolveGender, PROFILE_PROMPT_COOKIE } from "@/lib/profile-options";
import { cleanLine } from "@/lib/text";

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
  const gender = resolveGender(formData);
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
      publicLink: normaliseUrl(String(formData.get("publicLink") || "").slice(0, 300)),
    })
    .where(eq(users.id, user.id));

  revalidatePath("/me");
  revalidatePath("/book");
  revalidatePath("/");
  revalidatePath("/welcome");
  return { ok: true };
}

/**
 * The one-tap version: a sentence, a link, and "show me". Leaves "ask me
 * about" and cause areas alone, so using this after the full form never
 * wipes them. Turning visibility on is the whole point of the button, so it
 * isn't a separate tick.
 */
export async function publishCommunityProfileAction(
  _prev: ProfileState,
  formData: FormData
): Promise<ProfileState> {
  const user = await getCurrentUser();
  if (!user) return { error: "Not logged in." };

  const bio = String(formData.get("bio") || "").trim().slice(0, 500);
  if (!bio) {
    return { error: "Add a sentence about what you're working on first." };
  }
  const rawLink = String(formData.get("publicLink") || "").trim().slice(0, 300);
  const publicLink = rawLink ? normaliseUrl(rawLink) : null;
  if (rawLink && !publicLink) {
    return {
      error: "That link doesn't look like a web address — paste the whole thing, like linkedin.com/in/yourname.",
    };
  }

  await db
    .update(users)
    .set({ profileVisible: true, bio, publicLink })
    .where(eq(users.id, user.id));

  // From the check-in prompt, skip revalidation: any revalidatePath in an
  // action re-renders the page it was called from, and the check-in page
  // only shows the prompt to people who aren't visible yet — so the card,
  // and the "you're visible" confirmation in it, would vanish mid-tap. Every
  // other page is force-dynamic and reads fresh on the next visit anyway.
  if (formData.get("from") !== "checkin") {
    revalidatePath("/me");
    revalidatePath("/book");
    revalidatePath("/");
  }
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
      name: cleanLine(formData.get("name")) || user.name,
      noshowEmailOptOut: formData.get("noshowEmailOptOut") === "on",
    })
    .where(eq(users.id, user.id));
  revalidatePath("/me");
  return { ok: true };
}

/**
 * "Not now" on the check-in prompt. Two weeks, not forever: the prompt is
 * the best moment we have to ask, so a wave-away shouldn't end it for good —
 * but asking at the door every single morning would be nagging.
 */
export async function snoozeProfilePromptAction(): Promise<void> {
  const jar = await cookies();
  jar.set(PROFILE_PROMPT_COOKIE, "1", {
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    maxAge: 14 * 24 * 60 * 60,
    path: "/",
  });
  revalidatePath("/checkin");
}

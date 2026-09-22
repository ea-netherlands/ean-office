"use server";

import { revalidatePath } from "next/cache";
import { db, users, userAvatars } from "@/db";
import { eq } from "drizzle-orm";
import { getCurrentUser } from "@/lib/auth";

export type AvatarState = { ok?: boolean; error?: string };

const ALLOWED = ["image/jpeg", "image/png", "image/webp"];
/** Base64 characters. The browser shrinks to 256px before sending, which
 *  lands around 20KB — this is a backstop against a hand-rolled request, not
 *  the working limit. */
const MAX_BASE64 = 400_000;

/**
 * Save a profile photo.
 *
 * The image arrives already squared and shrunk by the browser (see
 * components/avatar-upload.tsx) — the server does not resize, so this checks
 * what it was given rather than trusting it: a declared type we serve safely,
 * and a size a cropped 256px photo cannot exceed.
 */
export async function saveAvatarAction(
  dataUrl: string
): Promise<AvatarState> {
  const user = await getCurrentUser();
  if (!user) return { error: "Not logged in." };

  const match = /^data:([^;,]+);base64,([A-Za-z0-9+/=]+)$/.exec(dataUrl);
  if (!match) return { error: "That file didn't come through — try another one." };
  const [, mime, data] = match;
  if (!ALLOWED.includes(mime)) {
    return { error: "Photos need to be a JPEG, PNG or WebP." };
  }
  if (data.length > MAX_BASE64) {
    return { error: "That image is too big — try a smaller one." };
  }

  await db
    .insert(userAvatars)
    .values({ userId: user.id, mime, data, updatedAt: new Date() })
    .onConflictDoUpdate({
      target: userAvatars.userId,
      set: { mime, data, updatedAt: new Date() },
    });
  // The timestamp on `users` is what pages read to know a photo exists, and
  // what cache-busts /avatar/<id> once it changes.
  await db
    .update(users)
    .set({ avatarUpdatedAt: new Date() })
    .where(eq(users.id, user.id));

  revalidatePath("/me");
  revalidatePath("/welcome");
  revalidatePath("/book");
  revalidatePath("/");
  return { ok: true };
}

export async function removeAvatarAction(): Promise<AvatarState> {
  const user = await getCurrentUser();
  if (!user) return { error: "Not logged in." };
  await db.delete(userAvatars).where(eq(userAvatars.userId, user.id));
  await db.update(users).set({ avatarUpdatedAt: null }).where(eq(users.id, user.id));
  revalidatePath("/me");
  revalidatePath("/welcome");
  revalidatePath("/book");
  revalidatePath("/");
  return { ok: true };
}

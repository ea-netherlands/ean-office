import { db, userAvatars, ensureMigrated } from "@/db";
import { eq } from "drizzle-orm";
import { getCurrentUser } from "@/lib/auth";

export const dynamic = "force-dynamic";

/**
 * Serve a member's profile photo.
 *
 * Members only. A face is a bigger thing to hand out than a name, and the
 * who's-in list these appear on is already behind a login — an open image URL
 * would quietly be the one part of a member's profile anyone could scrape.
 *
 * Immutable caching is safe because the URL carries `?v=<avatarUpdatedAt>`:
 * a new photo is a new URL. Private, so no shared cache holds one member's
 * face for another's request.
 */
export async function GET(
  _request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  await ensureMigrated();
  const viewer = await getCurrentUser();
  if (!viewer) return new Response("Not found", { status: 404 });

  const { id } = await params;
  const [row] = await db
    .select()
    .from(userAvatars)
    .where(eq(userAvatars.userId, id));
  if (!row) return new Response("Not found", { status: 404 });

  return new Response(Buffer.from(row.data, "base64"), {
    headers: {
      "content-type": row.mime,
      "cache-control": "private, max-age=31536000, immutable",
      "content-security-policy": "default-src 'none'; sandbox",
    },
  });
}

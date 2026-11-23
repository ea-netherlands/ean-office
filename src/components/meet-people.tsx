import { cookies } from "next/headers";
import { and, eq, inArray, lt } from "drizzle-orm";
import { db, bookings } from "@/db";
import type { SessionUser } from "@/lib/auth";
import { avatarUrl } from "@/lib/avatars";
import { PROFILE_PROMPT_COOKIE } from "@/lib/profile-options";
import { snoozeProfilePromptAction } from "@/actions/profile";
import { Card, Icon } from "@/components/ui";
import { QuickPublishForm } from "@/components/community-profile-card";
import { AvatarUpload } from "@/components/avatar-upload";

/*
 * The "meet people" nudges, shared by the Today page and /checkin. Most
 * members check in from the Today page's button, not the door QR code, so
 * anything that lives only on /checkin is something most people never see.
 */

/**
 * How many of `others` the person has never been booked in with, before
 * today. Booked rows only: a cancellation or a waitlist place means they
 * were never actually in the room together.
 */
export async function countNewFaces(
  userId: string,
  others: string[],
  today: string
): Promise<number> {
  if (others.length === 0) return 0;
  const myDays = db
    .select({ date: bookings.date })
    .from(bookings)
    .where(
      and(
        eq(bookings.userId, userId),
        eq(bookings.status, "booked"),
        lt(bookings.date, today)
      )
    );
  const met = await db
    .selectDistinct({ userId: bookings.userId })
    .from(bookings)
    .where(
      and(
        inArray(bookings.userId, others),
        eq(bookings.status, "booked"),
        inArray(bookings.date, myDays)
      )
    );
  const metIds = new Set(met.map((r) => r.userId));
  return others.filter((id) => !metIds.has(id)).length;
}

/**
 * A count, not a name: pointing at one person ("go talk to Sanne")
 * volunteers someone who never agreed to be volunteered.
 */
export function NewFacesNote({ newFaces, total }: { newFaces: number; total: number }) {
  if (newFaces === 0) return null;
  const lead =
    newFaces === total
      ? total === 1
        ? "You haven't shared a day with them before."
        : "You haven't shared a day with any of them before."
      : newFaces === 1
        ? "1 of them you haven't shared a day with before."
        : `${newFaces} of them you haven't shared a day with before.`;
  return (
    <div className="mt-4 pt-3 border-t border-dashed border-slate-200 flex items-start gap-2 text-sm text-slate-700">
      <Icon name="users-plus" className="text-lg text-teal-700 mt-0.5 shrink-0" />
      <p>
        {lead} New connections are one of the best things about the office: a
        lot of jobs, collaborations and good ideas start with a chat over
        coffee. Say hi at lunch?
      </p>
    </div>
  );
}

/**
 * "Let them find you too" — shown to people in the office today whose
 * profile isn't visible yet, until they share it or press "Not now".
 */
export async function ProfilePrompt({
  user,
  othersCount,
  className = "",
}: {
  user: SessionUser;
  othersCount: number;
  className?: string;
}) {
  if (user.profileVisible && user.bio?.trim()) return null;
  if ((await cookies()).get(PROFILE_PROMPT_COOKIE)) return null;
  const hasPhoto = !!avatarUrl(user.id, user.avatarUpdatedAt);

  return (
    <Card className={`text-left ${className}`}>
      <h2>{othersCount > 0 ? "Let them find you too" : "Let people find you"}</h2>
      <p className="text-sm text-slate-600 mt-1">
        One sentence about what you&apos;re working on, and other members can
        tap your name to see it.
      </p>
      {!hasPhoto && (
        <div className="mt-3">
          <AvatarUpload name={user.name} src={null} />
        </div>
      )}
      <QuickPublishForm
        bio={user.bio || user.about}
        link={user.publicLink || user.profileUrl}
        fromApplication={!user.bio && !!user.about}
        snoozeAction={snoozeProfilePromptAction}
      />
    </Card>
  );
}

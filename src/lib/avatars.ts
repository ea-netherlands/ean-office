/**
 * Where a member's photo lives.
 *
 * The timestamp in the query string is the point: /avatar/<id> is served
 * `immutable`, so a changed photo has to be a changed URL or people would
 * keep seeing the old one for a year. Returns null when there's no photo,
 * which is what makes the Avatar component fall back to initials.
 */
export function avatarUrl(
  userId: string,
  avatarUpdatedAt: Date | string | null | undefined
): string | null {
  if (!avatarUpdatedAt) return null;
  const v =
    avatarUpdatedAt instanceof Date
      ? avatarUpdatedAt.getTime()
      : new Date(avatarUpdatedAt).getTime();
  return `/avatar/${userId}?v=${Number.isFinite(v) ? v : 0}`;
}

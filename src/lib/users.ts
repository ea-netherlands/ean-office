// Finding people by any address they use, and putting two accounts back
// together when they've ended up with one each.

import {
  db,
  users,
  userEmails,
  bookings,
  bookingSeries,
  checkins,
  noShowEvents,
  visitRequests,
  eventAttendance,
  eventGuests,
} from "@/db";
import { eq, inArray, sql } from "drizzle-orm";
import { newId } from "./ids";
import { asSlot, overlaps } from "./slots";

export type User = typeof users.$inferSelect;

/**
 * The one place that knows an address might be an alias. Every login,
 * sign-up and guest-request path goes through here, so an alias behaves
 * exactly like the address someone registered with.
 */
export async function findUserByEmail(email: string): Promise<User | null> {
  const normalised = email.toLowerCase().trim();
  if (!normalised) return null;

  const [direct] = await db
    .select()
    .from(users)
    .where(sql`lower(${users.email}) = ${normalised}`);
  if (direct) return direct;

  const [viaAlias] = await db
    .select({ user: users })
    .from(userEmails)
    .innerJoin(users, eq(users.id, userEmails.userId))
    .where(sql`lower(${userEmails.email}) = ${normalised}`);
  return viaAlias?.user ?? null;
}

/** Every address that reaches this person, primary first. */
export async function emailsFor(userId: string): Promise<string[]> {
  const [user] = await db.select().from(users).where(eq(users.id, userId));
  if (!user) return [];
  const aliases = await db
    .select({ email: userEmails.email })
    .from(userEmails)
    .where(eq(userEmails.userId, userId));
  return [user.email, ...aliases.map((a) => a.email)];
}

export type MergePlan = {
  keep: { id: string; name: string; email: string; status: string; role: string };
  merge: { id: string; name: string; email: string; status: string; role: string };
  bookings: number;
  /** Bookings that can't move as-is because the kept account was there too. */
  clashingBookings: number;
  checkins: number;
  duplicateCheckins: number;
  visitRequests: number;
  eventGuests: number;
  eventAttendance: number;
  aliases: string[];
};

/**
 * What merging would do, without doing it. Worth showing: "this moves 34
 * bookings and drops 2 duplicate check-ins" is the difference between an
 * admin pressing the button confidently and not pressing it at all.
 */
export async function planMerge(
  keepId: string,
  mergeId: string
): Promise<MergePlan | { error: string }> {
  if (keepId === mergeId) return { error: "That's the same account twice." };
  const [keep] = await db.select().from(users).where(eq(users.id, keepId));
  const [merge] = await db.select().from(users).where(eq(users.id, mergeId));
  if (!keep || !merge) return { error: "One of those accounts no longer exists." };

  const theirs = await db.select().from(bookings).where(eq(bookings.userId, mergeId));
  const ours = await db.select().from(bookings).where(eq(bookings.userId, keepId));
  const live = (b: typeof bookings.$inferSelect) =>
    b.status === "booked" || b.status === "waitlisted";
  const clashing = theirs.filter(
    (t) =>
      live(t) &&
      ours.some(
        (o) => live(o) && o.date === t.date && overlaps(asSlot(o.slot), asSlot(t.slot))
      )
  ).length;

  const theirCheckins = await db
    .select({ date: checkins.date })
    .from(checkins)
    .where(eq(checkins.userId, mergeId));
  const ourCheckinDates = new Set(
    (
      await db.select({ date: checkins.date }).from(checkins).where(eq(checkins.userId, keepId))
    ).map((c) => c.date)
  );
  const duplicateCheckins = theirCheckins.filter((c) => ourCheckinDates.has(c.date)).length;

  const [requests, guests, attendance, aliases] = await Promise.all([
    db.select({ id: visitRequests.id }).from(visitRequests).where(eq(visitRequests.userId, mergeId)),
    db.select({ id: eventGuests.id }).from(eventGuests).where(eq(eventGuests.userId, mergeId)),
    db.select({ id: eventAttendance.id }).from(eventAttendance).where(eq(eventAttendance.userId, mergeId)),
    db.select({ email: userEmails.email }).from(userEmails).where(eq(userEmails.userId, mergeId)),
  ]);

  const brief = (u: User) => ({
    id: u.id,
    name: u.name,
    email: u.email,
    status: u.status,
    role: u.role,
  });
  return {
    keep: brief(keep),
    merge: brief(merge),
    bookings: theirs.length,
    clashingBookings: clashing,
    checkins: theirCheckins.length,
    duplicateCheckins,
    visitRequests: requests.length,
    eventGuests: guests.length,
    eventAttendance: attendance.length,
    aliases: [merge.email, ...aliases.map((a) => a.email)],
  };
}

/** Rank statuses so a merge never demotes someone. */
const STATUS_RANK: Record<string, number> = {
  declined: 0,
  event_guest: 1,
  pending: 2,
  imported: 3,
  inactive: 4,
  trial: 5,
  active: 6,
};

const earliest = (a: Date | null, b: Date | null) =>
  a && b ? (a < b ? a : b) : (a ?? b);
const latest = (a: Date | null, b: Date | null) => (a && b ? (a > b ? a : b) : (a ?? b));

/**
 * Fold one account into another. History moves rather than being deleted:
 * check-ins are what the funder reports count, and someone who has been
 * coming for a year under two addresses should still read as a year.
 *
 * Everything happens in one transaction — a half-merged person is worse than
 * either of the two they started as.
 */
export async function mergeUsers(
  keepId: string,
  mergeId: string
): Promise<{ ok: true; moved: MergePlan } | { ok: false; error: string }> {
  const plan = await planMerge(keepId, mergeId);
  if ("error" in plan) return { ok: false, error: plan.error };

  await db.transaction(async (tx) => {
    const [keep] = await tx.select().from(users).where(eq(users.id, keepId));
    const [merge] = await tx.select().from(users).where(eq(users.id, mergeId));

    // --- bookings: cancel the ones that would collide, move the rest ---
    const theirs = await tx.select().from(bookings).where(eq(bookings.userId, mergeId));
    const ours = await tx.select().from(bookings).where(eq(bookings.userId, keepId));
    const live = (b: typeof bookings.$inferSelect) =>
      b.status === "booked" || b.status === "waitlisted";
    for (const b of theirs) {
      const clash =
        live(b) &&
        ours.some(
          (o) => live(o) && o.date === b.date && overlaps(asSlot(o.slot), asSlot(b.slot))
        );
      // A cancelled row is outside the partial unique indexes, so it can sit
      // alongside the kept account's booking for the same day as history.
      await tx
        .update(bookings)
        .set(
          clash
            ? { userId: keepId, status: "cancelled", cancelledAt: new Date() }
            : { userId: keepId }
        )
        .where(eq(bookings.id, b.id));
    }
    await tx
      .update(bookingSeries)
      .set({ userId: keepId })
      .where(eq(bookingSeries.userId, mergeId));

    // --- check-ins: one per person per day ---
    const ourDates = new Set(
      (
        await tx.select({ date: checkins.date }).from(checkins).where(eq(checkins.userId, keepId))
      ).map((c) => c.date)
    );
    const theirCheckins = await tx.select().from(checkins).where(eq(checkins.userId, mergeId));
    for (const c of theirCheckins) {
      if (ourDates.has(c.date)) {
        await tx.delete(checkins).where(eq(checkins.id, c.id));
      } else {
        await tx.update(checkins).set({ userId: keepId }).where(eq(checkins.id, c.id));
        ourDates.add(c.date);
      }
    }

    await tx
      .update(noShowEvents)
      .set({ userId: keepId })
      .where(eq(noShowEvents.userId, mergeId));
    await tx
      .update(visitRequests)
      .set({ userId: keepId })
      .where(eq(visitRequests.userId, mergeId));

    // --- events: unique per (event, person) ---
    const ourEvents = new Set(
      (
        await tx
          .select({ eventId: eventGuests.eventId })
          .from(eventGuests)
          .where(eq(eventGuests.userId, keepId))
      ).map((g) => g.eventId)
    );
    for (const g of await tx.select().from(eventGuests).where(eq(eventGuests.userId, mergeId))) {
      if (ourEvents.has(g.eventId)) {
        await tx.delete(eventGuests).where(eq(eventGuests.id, g.id));
      } else {
        await tx.update(eventGuests).set({ userId: keepId }).where(eq(eventGuests.id, g.id));
        ourEvents.add(g.eventId);
      }
    }
    const ourAttendance = new Set(
      (
        await tx
          .select({ eventId: eventAttendance.eventId, source: eventAttendance.source })
          .from(eventAttendance)
          .where(eq(eventAttendance.userId, keepId))
      ).map((a) => `${a.eventId}:${a.source}`)
    );
    for (const a of await tx
      .select()
      .from(eventAttendance)
      .where(eq(eventAttendance.userId, mergeId))) {
      const key = `${a.eventId}:${a.source}`;
      if (ourAttendance.has(key)) {
        await tx.delete(eventAttendance).where(eq(eventAttendance.id, a.id));
      } else {
        await tx.update(eventAttendance).set({ userId: keepId }).where(eq(eventAttendance.id, a.id));
        ourAttendance.add(key);
      }
    }

    // --- events they organised keep pointing at them ---
    await tx.execute(
      sql`update events set created_by = ${keepId} where created_by = ${mergeId}`
    );

    // --- the person themselves: never lose an answer, never demote ---
    const fill = <T>(mine: T | null, theirs: T | null): T | null => mine ?? theirs;
    await tx
      .update(users)
      .set({
        role: keep.role === "admin" || merge.role === "admin" ? "admin" : keep.role,
        status:
          (STATUS_RANK[merge.status] ?? 0) > (STATUS_RANK[keep.status] ?? 0)
            ? merge.status
            : keep.status,
        trialDate:
          !keep.trialDate || (merge.trialDate && merge.trialDate > keep.trialDate)
            ? merge.trialDate ?? keep.trialDate
            : keep.trialDate,
        createdAt: earliest(keep.createdAt, merge.createdAt) ?? keep.createdAt,
        lastSeenAt: latest(keep.lastSeenAt, merge.lastSeenAt),
        claimedAt: earliest(keep.claimedAt, merge.claimedAt),
        approvedAt: earliest(keep.approvedAt, merge.approvedAt),
        guidelinesAcceptedAt: earliest(
          keep.guidelinesAcceptedAt,
          merge.guidelinesAcceptedAt
        ),
        profileUrl: fill(keep.profileUrl, merge.profileUrl),
        descriptor: fill(keep.descriptor, merge.descriptor),
        about: fill(keep.about, merge.about),
        expectedFrequency: fill(keep.expectedFrequency, merge.expectedFrequency),
        accessibilityNotes: fill(keep.accessibilityNotes, merge.accessibilityNotes),
        causeArea: fill(keep.causeArea, merge.causeArea),
        causeAreaOther: fill(keep.causeAreaOther, merge.causeAreaOther),
        roleCategory: fill(keep.roleCategory, merge.roleCategory),
        experienceLevel: fill(keep.experienceLevel, merge.experienceLevel),
        eaFunding: fill(keep.eaFunding, merge.eaFunding),
        funders: fill(keep.funders, merge.funders),
        gender: fill(keep.gender, merge.gender),
        profileUpdatedAt: latest(keep.profileUpdatedAt, merge.profileUpdatedAt),
        bio: fill(keep.bio, merge.bio),
        expertise: fill(keep.expertise, merge.expertise),
        publicCauseAreas: fill(keep.publicCauseAreas, merge.publicCauseAreas),
        publicLink: fill(keep.publicLink, merge.publicLink),
        profileVisible: keep.profileVisible || merge.profileVisible,
        noshowEmailOptOut: keep.noshowEmailOptOut || merge.noshowEmailOptOut,
      })
      .where(eq(users.id, keepId));

    // --- keep both addresses working ---
    const theirAliases = await tx
      .select()
      .from(userEmails)
      .where(eq(userEmails.userId, mergeId));
    const toAdd = [merge.email, ...theirAliases.map((a) => a.email)];
    // Delete first: the alias rows cascade with the account below, and the
    // unique index doesn't care which row holds the address.
    await tx.delete(userEmails).where(eq(userEmails.userId, mergeId));
    for (const email of toAdd) {
      const [clash] = await tx
        .select({ id: userEmails.id })
        .from(userEmails)
        .where(sql`lower(${userEmails.email}) = ${email.toLowerCase()}`);
      if (clash) continue;
      await tx.insert(userEmails).values({
        id: newId("uem"),
        userId: keepId,
        email,
        source: "merge",
      });
    }

    await tx.delete(users).where(eq(users.id, mergeId));
  });

  return { ok: true, moved: plan };
}

/**
 * Accounts that look like the same person, for the admin members list. Name
 * matching only — two addresses is the whole problem, so it can't key on
 * those.
 */
export function findLikelyDuplicates<T extends { id: string; name: string }>(
  people: T[]
): [T, T][] {
  const byName = new Map<string, T[]>();
  for (const p of people) {
    const key = p.name.toLowerCase().replace(/\s+/g, " ").trim();
    if (!key) continue;
    byName.set(key, [...(byName.get(key) ?? []), p]);
  }
  const pairs: [T, T][] = [];
  for (const group of byName.values()) {
    for (let i = 0; i < group.length; i++) {
      for (let j = i + 1; j < group.length; j++) pairs.push([group[i], group[j]]);
    }
  }
  return pairs;
}

/** Aliases are user-visible on the members list, so fetch them in one go. */
export async function aliasesByUser(
  userIds: string[]
): Promise<Map<string, string[]>> {
  const out = new Map<string, string[]>();
  if (userIds.length === 0) return out;
  const rows = await db
    .select()
    .from(userEmails)
    .where(inArray(userEmails.userId, userIds));
  for (const r of rows) {
    out.set(r.userId, [...(out.get(r.userId) ?? []), r.email]);
  }
  return out;
}

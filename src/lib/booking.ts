import { db, bookings, bookingSeries, users, checkins } from "@/db";
import { and, eq, gte, lte, inArray, sql, asc } from "drizzle-orm";
import { newId } from "./ids";
import { getSettings, Settings } from "./settings";
import {
  addDays,
  formatDay,
  formatDayLong,
  isHoliday,
  isoWeekday,
  isWeekend,
  todayAms,
} from "./dates";
import { sendEmail, btn, link } from "./email";
import { makeToken } from "./tokens";
import { appUrl } from "./auth";

export type Booking = typeof bookings.$inferSelect;

export type PersonProfile = {
  bio: string | null;
  expertise: string | null;
  causeAreas: string[] | null;
  link: string | null;
};

export type DayPerson = {
  id: string;
  name: string;
  seatType: string;
  deskNumber: number | null;
  // Present only when the member opted in to a visible community profile.
  profile: PersonProfile | null;
};

export type DayCapacity = {
  date: string;
  desksBooked: number;
  flexBooked: number;
  blockDesks: number;
  desksLeft: number;
  flexLeft: number;
  full: boolean;
  waitlistCount: number;
  closed: boolean; // weekend or holiday
  people: DayPerson[];
};

export async function capacityForRange(
  startDate: string,
  endDate: string
): Promise<Map<string, DayCapacity>> {
  const cfg = await getSettings();
  const rows = await db
    .select({
      id: bookings.id,
      date: bookings.date,
      seatType: bookings.seatType,
      status: bookings.status,
      source: bookings.source,
      userId: bookings.userId,
      userName: users.name,
      deskNumber: bookings.deskNumber,
      profileVisible: users.profileVisible,
      bio: users.bio,
      expertise: users.expertise,
      publicCauseAreas: users.publicCauseAreas,
      publicLink: users.publicLink,
    })
    .from(bookings)
    .innerJoin(users, eq(users.id, bookings.userId))
    .where(
      and(
        gte(bookings.date, startDate),
        lte(bookings.date, endDate),
        inArray(bookings.status, ["booked", "waitlisted"])
      )
    );

  const map = new Map<string, DayCapacity>();
  for (let d = startDate; d <= endDate; d = addDays(d, 1)) {
    map.set(d, {
      date: d,
      desksBooked: 0,
      flexBooked: 0,
      blockDesks: 0,
      desksLeft: cfg.desk_count,
      flexLeft: cfg.flex_count,
      full: false,
      waitlistCount: 0,
      closed: isWeekend(d) || isHoliday(d),
      people: [],
    });
  }
  for (const r of rows) {
    const day = map.get(r.date);
    if (!day) continue;
    if (r.status === "waitlisted") {
      day.waitlistCount++;
      continue;
    }
    if (r.seatType === "desk") {
      day.desksBooked++;
      if (r.source === "block") day.blockDesks++;
    } else {
      day.flexBooked++;
    }
    day.people.push({
      id: r.userId,
      name: r.userName,
      seatType: r.seatType,
      deskNumber: r.deskNumber,
      profile: r.profileVisible
        ? {
            bio: r.bio,
            expertise: r.expertise,
            causeAreas: r.publicCauseAreas,
            link: r.publicLink,
          }
        : null,
    });
  }
  for (const day of map.values()) {
    day.desksLeft = Math.max(0, cfg.desk_count - day.desksBooked);
    day.flexLeft = Math.max(0, cfg.flex_count - day.flexBooked);
    day.full = day.desksLeft === 0 && day.flexLeft === 0;
  }
  return map;
}

export async function capacityForDay(date: string): Promise<DayCapacity> {
  const map = await capacityForRange(date, date);
  return map.get(date)!;
}

// ---------- booking ----------

/** Desk numbers already reserved on a given day. */
export async function takenDeskNumbers(date: string): Promise<Set<number>> {
  const rows = await db
    .select({ n: bookings.deskNumber })
    .from(bookings)
    .where(
      and(
        eq(bookings.date, date),
        eq(bookings.status, "booked"),
        eq(bookings.seatType, "desk")
      )
    );
  return new Set(rows.map((r) => r.n).filter((n): n is number => n !== null));
}

async function assignDeskNumber(
  date: string,
  deskCount: number,
  requested?: number
): Promise<{ ok: true; n: number | null } | { ok: false; error: string }> {
  const taken = await takenDeskNumbers(date);
  if (requested) {
    if (requested < 1 || requested > deskCount) {
      return { ok: false, error: `There is no desk ${requested}.` };
    }
    if (taken.has(requested)) {
      return { ok: false, error: `Desk ${requested} is already taken that day.` };
    }
    return { ok: true, n: requested };
  }
  for (let n = 1; n <= deskCount; n++) {
    if (!taken.has(n)) return { ok: true, n };
  }
  return { ok: true, n: null }; // shouldn't happen while desksLeft > 0
}

export type BookResult =
  | { ok: true; booking: Booking; seatType: "desk" | "flex" }
  | { ok: true; waitlisted: true; booking: Booking }
  | { ok: false; error: string };

export async function bookDay(
  userId: string,
  date: string,
  opts: {
    source?: "self" | "block" | "walkin" | "admin";
    allowWaitlist?: boolean;
    sendConfirmation?: boolean;
    seriesId?: string;
    deskNumber?: number; // request a specific desk
  } = {}
): Promise<BookResult> {
  const cfg = await getSettings();
  const source = opts.source ?? "self";

  if (date < todayAms()) return { ok: false, error: "That day has passed." };
  if (isWeekend(date)) return { ok: false, error: "The office is closed at weekends." };
  if (isHoliday(date)) return { ok: false, error: "That's a public holiday — the office is closed." };

  const existing = await db
    .select()
    .from(bookings)
    .where(
      and(
        eq(bookings.userId, userId),
        eq(bookings.date, date),
        inArray(bookings.status, ["booked", "waitlisted"])
      )
    );
  if (existing.length > 0) {
    return { ok: false, error: "You already have a booking for that day." };
  }

  if (source === "self") {
    const future = await db
      .select({ n: sql<number>`count(*)::int` })
      .from(bookings)
      .where(
        and(
          eq(bookings.userId, userId),
          eq(bookings.status, "booked"),
          gte(bookings.date, todayAms()),
          eq(bookings.source, "self")
        )
      );
    if (future[0].n >= cfg.max_future_bookings) {
      return {
        ok: false,
        error: `You can hold at most ${cfg.max_future_bookings} future bookings at once.`,
      };
    }
  }

  const cap = await capacityForDay(date);
  let seatType: "desk" | "flex" | null = null;
  if (cap.desksLeft > 0) seatType = "desk";
  else if (cap.flexLeft > 0 && !opts.deskNumber) seatType = "flex";

  if (opts.deskNumber && cap.desksLeft === 0) {
    return { ok: false, error: "All desks are taken that day." };
  }

  let deskNumber: number | null = null;
  if (seatType === "desk") {
    const assigned = await assignDeskNumber(date, cfg.desk_count, opts.deskNumber);
    if (!assigned.ok) return { ok: false, error: assigned.error };
    deskNumber = assigned.n;
  }

  if (!seatType) {
    if (!opts.allowWaitlist) return { ok: false, error: "That day is full." };
    const [wl] = await db
      .insert(bookings)
      .values({
        id: newId("bk"),
        userId,
        date,
        seatType: "desk",
        status: "waitlisted",
        source,
      })
      .returning();
    return { ok: true, waitlisted: true, booking: wl };
  }

  const [booking] = await db
    .insert(bookings)
    .values({
      id: newId("bk"),
      userId,
      date,
      seatType,
      deskNumber,
      status: "booked",
      source,
      seriesId: opts.seriesId ?? null,
    })
    .returning();

  if (opts.sendConfirmation !== false && source === "self") {
    const [user] = await db.select().from(users).where(eq(users.id, userId));
    if (user) await sendBookingConfirmation(user.email, user.name, booking);
  }

  return { ok: true, booking, seatType };
}

export function cancelUrl(booking: Booking): string {
  const exp = new Date(`${booking.date}T23:59:59+02:00`);
  return `${appUrl()}/cancel/${makeToken("cancel", booking.id, exp)}`;
}

async function sendBookingConfirmation(
  email: string,
  name: string,
  booking: Booking
): Promise<void> {
  const cfg = await getSettings();
  const flexNote =
    booking.seatType === "flex"
      ? `<p><strong>Heads up:</strong> you're at the lunch table, which is used for lunch from ${cfg.flex_unavailable_window} — you'll need to pack up for that hour.</p>`
      : "";
  await sendEmail({
    to: email,
    subject: `Booked: ${formatDayLong(booking.date)}`,
    kind: "booking_confirmed",
    html: `<p>Hi ${name},</p>
<p>You're booked for <strong>${formatDayLong(booking.date)}</strong> (${booking.seatType === "desk" ? `desk ${booking.deskNumber ?? ""}`.trim() : "lunch-table spot"}).</p>
${flexNote}
<p>Plans changed? ${link(cancelUrl(booking), "Cancel in one tap")} — no login needed, and it frees the desk for someone else.</p>`,
  });
}

/** Move an existing desk booking to a different (free) desk. */
export async function switchDesk(
  bookingId: string,
  userId: string,
  deskNumber: number
): Promise<{ ok: boolean; error?: string }> {
  const cfg = await getSettings();
  const [booking] = await db
    .select()
    .from(bookings)
    .where(eq(bookings.id, bookingId));
  if (!booking || booking.userId !== userId) return { ok: false, error: "Booking not found." };
  if (booking.status !== "booked" || booking.seatType !== "desk") {
    return { ok: false, error: "Only booked desks can be moved." };
  }
  if (booking.date < todayAms()) return { ok: false, error: "That day has passed." };
  const assigned = await assignDeskNumber(booking.date, cfg.desk_count, deskNumber);
  if (!assigned.ok) return { ok: false, error: assigned.error };
  await db
    .update(bookings)
    .set({ deskNumber: assigned.n })
    .where(eq(bookings.id, bookingId));
  return { ok: true };
}

// ---------- cancellation + waitlist promotion ----------

export async function cancelBooking(
  bookingId: string,
  opts: { promote?: boolean } = {}
): Promise<{ ok: boolean; booking?: Booking }> {
  const [booking] = await db
    .select()
    .from(bookings)
    .where(eq(bookings.id, bookingId));
  if (!booking) return { ok: false };
  if (booking.status === "cancelled") return { ok: true, booking }; // idempotent

  const [updated] = await db
    .update(bookings)
    .set({ status: "cancelled", cancelledAt: new Date() })
    .where(eq(bookings.id, bookingId))
    .returning();

  if (opts.promote !== false && booking.status === "booked") {
    await promoteWaitlist(booking.date);
  }
  return { ok: true, booking: updated };
}

export async function promoteWaitlist(date: string): Promise<void> {
  const cap = await capacityForDay(date);
  // Prefer desks over flex.
  let seatType: "desk" | "flex" | null = null;
  if (cap.desksLeft > 0) seatType = "desk";
  else if (cap.flexLeft > 0) seatType = "flex";
  if (!seatType) return;

  const [next] = await db
    .select()
    .from(bookings)
    .where(and(eq(bookings.date, date), eq(bookings.status, "waitlisted")))
    .orderBy(asc(bookings.createdAt))
    .limit(1);
  if (!next) return;

  let deskNumber: number | null = null;
  if (seatType === "desk") {
    const cfg = await getSettings();
    const assigned = await assignDeskNumber(date, cfg.desk_count);
    if (assigned.ok) deskNumber = assigned.n;
  }
  const [promoted] = await db
    .update(bookings)
    .set({ status: "booked", seatType, deskNumber })
    .where(eq(bookings.id, next.id))
    .returning();

  const [user] = await db.select().from(users).where(eq(users.id, next.userId));
  if (user) {
    await sendEmail({
      to: user.email,
      subject: `A desk opened up for ${formatDay(date)}`,
      kind: "waitlist_promoted",
      html: `<p>Hi ${user.name},</p>
<p>Good news — a ${seatType === "desk" ? "desk" : "lunch-table spot"} opened up for <strong>${formatDayLong(date)}</strong> and it's now yours.</p>
<p>Can't make it after all? ${link(cancelUrl(promoted), "Cancel in one tap")}.</p>`,
    });
  }
}

// ---------- block booking ----------

export type BlockPreview = {
  eligible: string[]; // days that will be booked
  skippedFull: string[];
  skippedBlockCap: string[];
  skippedExisting: string[];
  skippedHoliday: string[];
  endDate: string; // horizon-clamped
};

export async function previewBlockBooking(
  userId: string,
  weekdays: number[],
  until: string
): Promise<BlockPreview> {
  const cfg = await getSettings();
  const start = addDays(todayAms(), 1);
  const horizon = addDays(todayAms(), cfg.block_horizon_weeks * 7);
  const endDate = until > horizon ? horizon : until;
  const blockCap = Math.floor(cfg.desk_count * cfg.block_max_share);

  const preview: BlockPreview = {
    eligible: [],
    skippedFull: [],
    skippedBlockCap: [],
    skippedExisting: [],
    skippedHoliday: [],
    endDate,
  };
  if (weekdays.length === 0 || endDate < start) return preview;

  const capMap = await capacityForRange(start, endDate);
  const own = await db
    .select({ date: bookings.date })
    .from(bookings)
    .where(
      and(
        eq(bookings.userId, userId),
        inArray(bookings.status, ["booked", "waitlisted"]),
        gte(bookings.date, start),
        lte(bookings.date, endDate)
      )
    );
  const ownDates = new Set(own.map((b) => b.date));

  for (let d = start; d <= endDate; d = addDays(d, 1)) {
    if (!weekdays.includes(isoWeekday(d))) continue;
    if (isWeekend(d)) continue;
    if (isHoliday(d)) {
      preview.skippedHoliday.push(d);
      continue;
    }
    if (ownDates.has(d)) {
      preview.skippedExisting.push(d);
      continue;
    }
    const cap = capMap.get(d)!;
    if (cap.desksLeft <= 0) {
      preview.skippedFull.push(d);
      continue;
    }
    if (cap.blockDesks >= blockCap) {
      preview.skippedBlockCap.push(d);
      continue;
    }
    preview.eligible.push(d);
  }
  return preview;
}

export async function createBlockBooking(
  userId: string,
  weekdays: number[],
  until: string
): Promise<{ ok: boolean; booked: string[]; preview: BlockPreview; error?: string }> {
  const preview = await previewBlockBooking(userId, weekdays, until);
  if (preview.eligible.length === 0) {
    return { ok: false, booked: [], preview, error: "No bookable days in that range." };
  }
  const [series] = await db
    .insert(bookingSeries)
    .values({
      id: newId("ser"),
      userId,
      weekdays,
      startDate: preview.eligible[0],
      endDate: preview.endDate,
    })
    .returning();

  const booked: string[] = [];
  for (const date of preview.eligible) {
    const res = await bookDay(userId, date, {
      source: "block",
      sendConfirmation: false,
      seriesId: series.id,
    });
    if (res.ok && !("waitlisted" in res)) booked.push(date);
  }

  // One summary email instead of eleven confirmations.
  const [user] = await db.select().from(users).where(eq(users.id, userId));
  if (user && booked.length > 0) {
    const skipped =
      preview.skippedFull.length + preview.skippedBlockCap.length;
    const skippedNote =
      skipped > 0
        ? `<p>${skipped} day${skipped === 1 ? " was" : "s were"} skipped (${[
            preview.skippedFull.length > 0 ? `${preview.skippedFull.length} full` : "",
            preview.skippedBlockCap.length > 0
              ? `${preview.skippedBlockCap.length} at the repeat-booking limit`
              : "",
          ]
            .filter(Boolean)
            .join(", ")}). You can still join the waitlist for those from the booking page.</p>`
        : "";
    await sendEmail({
      to: user.email,
      subject: `Booked: ${booked.length} days through ${formatDay(preview.endDate)}`,
      kind: "block_summary",
      html: `<p>Hi ${user.name},</p>
<p>Your repeating booking is in — <strong>${booked.length} days</strong>:</p>
<p>${booked.map(formatDay).join(" · ")}</p>
${skippedNote}
<p>Each day is cancellable on its own from ${link(`${appUrl()}/me`, "your bookings page")}, or cancel the whole series there.</p>`,
    });
  }
  return { ok: true, booked, preview };
}

export async function cancelSeries(
  seriesId: string,
  userId: string
): Promise<number> {
  const remaining = await db
    .select()
    .from(bookings)
    .where(
      and(
        eq(bookings.seriesId, seriesId),
        eq(bookings.userId, userId),
        inArray(bookings.status, ["booked", "waitlisted"]),
        gte(bookings.date, todayAms())
      )
    );
  for (const b of remaining) {
    await cancelBooking(b.id);
  }
  return remaining.length;
}

// ---------- check-in ----------

export type CheckinResult =
  | { ok: true; kind: "checked_in"; walkIn: boolean; overCapacity: boolean }
  | { ok: true; kind: "already" }
  | { ok: false; error: string };

export async function checkInUser(
  userId: string,
  date: string,
  opts: { retroactive?: boolean } = {}
): Promise<CheckinResult> {
  const existing = await db
    .select()
    .from(checkins)
    .where(and(eq(checkins.userId, userId), eq(checkins.date, date)));
  if (existing.length > 0) return { ok: true, kind: "already" }; // idempotent

  const [booking] = await db
    .select()
    .from(bookings)
    .where(
      and(
        eq(bookings.userId, userId),
        eq(bookings.date, date),
        eq(bookings.status, "booked")
      )
    );

  let walkIn = false;
  let overCapacity = false;
  let bookingId = booking?.id ?? null;

  if (!booking && !opts.retroactive) {
    // Walk-in: create a booking if there's space; check them in regardless.
    const cap = await capacityForDay(date);
    const seatType = cap.desksLeft > 0 ? "desk" : cap.flexLeft > 0 ? "flex" : "desk";
    overCapacity = cap.full;
    let deskNumber: number | null = null;
    if (seatType === "desk" && cap.desksLeft > 0) {
      const cfg = await getSettings();
      const assigned = await assignDeskNumber(date, cfg.desk_count);
      if (assigned.ok) deskNumber = assigned.n;
    }
    const [wb] = await db
      .insert(bookings)
      .values({
        id: newId("bk"),
        userId,
        date,
        seatType,
        deskNumber,
        status: "booked",
        source: "walkin",
      })
      .returning();
    bookingId = wb.id;
    walkIn = true;
  }

  await db.insert(checkins).values({
    id: newId("ci"),
    userId,
    bookingId,
    date,
    isRetroactive: opts.retroactive ?? false,
  });

  await db
    .update(users)
    .set({ lastSeenAt: new Date() })
    .where(eq(users.id, userId));

  return { ok: true, kind: "checked_in", walkIn, overCapacity };
}

export async function retroCheckinWindowOk(date: string): Promise<boolean> {
  // Allowed until end of the following day (Amsterdam).
  return todayAms() <= addDays(date, 1);
}

export function flexWarning(cfg: Settings): string {
  return `The lunch table is used for lunch from ${cfg.flex_unavailable_window}, so you'll need to pack up for an hour. Fine for a half day or if you're happy to break — less good for deep work.`;
}

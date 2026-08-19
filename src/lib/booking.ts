import { db, bookings, bookingSeries, users, checkins, events } from "@/db";
import { and, eq, gte, lte, inArray, sql, asc } from "drizzle-orm";
import { COWORKING_TYPE } from "./coworking";
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
import { minutesOfDayAms } from "./dates";
import { sendEmail, btn, link } from "./email";
import { makeToken } from "./tokens";
import { appUrl } from "./auth";
import { afterResponse } from "./after";
import {
  Half,
  HALVES,
  Slot,
  SLOT_LABEL,
  asSlot,
  currentHalf,
  halves,
  overlaps,
  slotSuffix,
  slotWeight,
  slotWindow,
} from "./slots";

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
  slot: Slot;
  // Present only when the member opted in to a visible community profile.
  profile: PersonProfile | null;
};

/** Occupancy of one half of the day. */
export type HalfCapacity = {
  desksBooked: number;
  flexBooked: number;
  blockDesks: number;
  desksLeft: number;
  flexLeft: number;
  full: boolean;
};

export type DayCapacity = {
  date: string;
  am: HalfCapacity;
  pm: HalfCapacity;
  /**
   * Seats free for a whole-day booking. Not min(am, pm): a desk taken in
   * either half can't be held all day, so two disjoint half-day bookings on
   * different desks cost two whole-day desks, not one.
   */
  desksFreeAllDay: number;
  flexFreeAllDay: number;
  full: boolean; // nothing free in either half
  waitlistCount: number;
  closed: boolean; // weekend or holiday
  people: DayPerson[];
  /**
   * Which numbered desks are held in each half. Computed on the way to
   * `desksFreeAllDay`, and exposed so callers that already have the capacity
   * can assign a desk without a second query for the same rows.
   */
  deskTaken: Record<Half, Set<number>>;
};

/** Desks free for a booking of this slot. */
export function desksLeftFor(cap: DayCapacity, slot: Slot): number {
  return slot === "day" ? cap.desksFreeAllDay : cap[slot].desksLeft;
}

export function flexLeftFor(cap: DayCapacity, slot: Slot): number {
  return slot === "day" ? cap.flexFreeAllDay : cap[slot].flexLeft;
}

export function hasRoomFor(cap: DayCapacity, slot: Slot): boolean {
  return desksLeftFor(cap, slot) > 0 || flexLeftFor(cap, slot) > 0;
}

function emptyHalf(cfg: Settings): HalfCapacity {
  return {
    desksBooked: 0,
    flexBooked: 0,
    blockDesks: 0,
    desksLeft: cfg.desk_count,
    flexLeft: cfg.flex_count,
    full: false,
  };
}

export async function capacityForRange(
  startDate: string,
  endDate: string,
  /**
   * Pass the settings when you already have them. React `cache` dedupes
   * `getSettings` across a page render but not inside a Server Action, so on
   * the booking path this is what actually keeps it to one read.
   */
  known?: Settings
): Promise<Map<string, DayCapacity>> {
  const cfg = known ?? (await getSettings());
  const rows = await db
    .select({
      id: bookings.id,
      date: bookings.date,
      seatType: bookings.seatType,
      status: bookings.status,
      source: bookings.source,
      slot: bookings.slot,
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
  const deskTaken = new Map<string, Record<Half, Set<number>>>();
  for (let d = startDate; d <= endDate; d = addDays(d, 1)) {
    const taken: Record<Half, Set<number>> = { am: new Set(), pm: new Set() };
    map.set(d, {
      date: d,
      am: emptyHalf(cfg),
      pm: emptyHalf(cfg),
      desksFreeAllDay: cfg.desk_count,
      flexFreeAllDay: cfg.flex_count,
      full: false,
      waitlistCount: 0,
      closed: isWeekend(d) || isHoliday(d),
      people: [],
      deskTaken: taken,
    });
    deskTaken.set(d, taken);
  }
  for (const r of rows) {
    const day = map.get(r.date);
    if (!day) continue;
    if (r.status === "waitlisted") {
      day.waitlistCount++;
      continue;
    }
    const slot = asSlot(r.slot);
    for (const half of halves(slot)) {
      const c = day[half];
      if (r.seatType === "desk") {
        c.desksBooked++;
        if (r.source === "block") c.blockDesks++;
        if (r.deskNumber) deskTaken.get(r.date)![half].add(r.deskNumber);
      } else {
        c.flexBooked++;
      }
    }
    day.people.push({
      id: r.userId,
      name: r.userName,
      seatType: r.seatType,
      deskNumber: r.deskNumber,
      slot,
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
    for (const half of HALVES) {
      const c = day[half];
      c.desksLeft = Math.max(0, cfg.desk_count - c.desksBooked);
      c.flexLeft = Math.max(0, cfg.flex_count - c.flexBooked);
      c.full = c.desksLeft === 0 && c.flexLeft === 0;
    }
    const taken = deskTaken.get(day.date)!;
    let freeBothHalves = 0;
    for (let n = 1; n <= cfg.desk_count; n++) {
      if (!taken.am.has(n) && !taken.pm.has(n)) freeBothHalves++;
    }
    // The per-half counts also cover desk rows with no number assigned, so
    // take the tightest of the three views.
    day.desksFreeAllDay = Math.min(
      day.am.desksLeft,
      day.pm.desksLeft,
      freeBothHalves
    );
    day.flexFreeAllDay = Math.min(day.am.flexLeft, day.pm.flexLeft);
    day.full = day.am.full && day.pm.full;
  }
  return map;
}

export async function capacityForDay(
  date: string,
  known?: Settings
): Promise<DayCapacity> {
  const map = await capacityForRange(date, date, known);
  return map.get(date)!;
}

// ---------- co-working days ----------

/**
 * Confirmed co-working days in a range. The office is closed to general
 * booking on these: the organiser hands out the seats, so the calendar hiding
 * the day isn't enough — the booking paths have to refuse it too.
 */
export async function coworkingDaysBetween(
  startDate: string,
  endDate: string
): Promise<Map<string, { id: string; title: string }>> {
  const rows = await db
    .select({ id: events.id, date: events.date, title: events.title })
    .from(events)
    .where(
      and(
        gte(events.date, startDate),
        lte(events.date, endDate),
        eq(events.type, COWORKING_TYPE),
        eq(events.status, "confirmed")
      )
    );
  return new Map(rows.map((r) => [r.date, { id: r.id, title: r.title }]));
}

export async function coworkingDayOn(
  date: string
): Promise<{ id: string; title: string } | null> {
  return (await coworkingDaysBetween(date, date)).get(date) ?? null;
}

// ---------- booking ----------

/** Which desk numbers are held in each half of a day. */
export async function deskTakenSets(
  date: string,
  excludeBookingId?: string
): Promise<Record<Half, Set<number>>> {
  const rows = await db
    .select({ id: bookings.id, n: bookings.deskNumber, slot: bookings.slot })
    .from(bookings)
    .where(
      and(
        eq(bookings.date, date),
        eq(bookings.status, "booked"),
        eq(bookings.seatType, "desk")
      )
    );
  const sets: Record<Half, Set<number>> = { am: new Set(), pm: new Set() };
  for (const r of rows) {
    if (r.n === null) continue;
    if (excludeBookingId && r.id === excludeBookingId) continue;
    for (const half of halves(asSlot(r.slot))) sets[half].add(r.n);
  }
  return sets;
}

/** Desk numbers a booking of this slot can't have. */
export async function takenDeskNumbers(
  date: string,
  slot: Slot = "day",
  excludeBookingId?: string
): Promise<Set<number>> {
  const sets = await deskTakenSets(date, excludeBookingId);
  const out = new Set<number>();
  for (const half of halves(slot)) for (const n of sets[half]) out.add(n);
  return out;
}

async function assignDeskNumber(
  date: string,
  deskCount: number,
  slot: Slot,
  requested?: number,
  excludeBookingId?: string,
  /** Reuse occupancy the caller already fetched (see DayCapacity.deskTaken). */
  known?: Record<Half, Set<number>>
): Promise<{ ok: true; n: number | null } | { ok: false; error: string }> {
  const sets = known ?? (await deskTakenSets(date, excludeBookingId));
  const conflicts = (n: number) => halves(slot).some((h) => sets[h].has(n));

  if (requested) {
    if (requested < 1 || requested > deskCount) {
      return { ok: false, error: `There is no desk ${requested}.` };
    }
    if (conflicts(requested)) {
      return {
        ok: false,
        error:
          slot === "day"
            ? `Desk ${requested} isn't free for the whole day.`
            : `Desk ${requested} is already taken that ${SLOT_LABEL[slot]}.`,
      };
    }
    return { ok: true, n: requested };
  }

  const free: number[] = [];
  for (let n = 1; n <= deskCount; n++) if (!conflicts(n)) free.push(n);
  if (free.length === 0) return { ok: true, n: null }; // caller checked capacity

  if (slot !== "day") {
    // Pair halves onto one desk where we can, so whole desks stay open for
    // people who want a full day.
    const other: Half = slot === "am" ? "pm" : "am";
    const paired = free.find((n) => sets[other].has(n));
    if (paired) return { ok: true, n: paired };
  }
  return { ok: true, n: free[0] };
}

/** Why a requested slot can't sit alongside one the member already holds. */
function clashMessage(held: Slot, wanted: Slot): string {
  if (held === wanted) {
    return held === "day"
      ? "You already have a booking for that day."
      : `You already have that ${SLOT_LABEL[held]} booked.`;
  }
  if (held === "day") return "You're already booked for the whole of that day.";
  return `You already have the ${SLOT_LABEL[held]} that day — change that booking to a full day instead.`;
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
    seatType?: "desk" | "flex"; // request a seat kind (flex = lunch table)
    slot?: Slot; // full day (default), morning or afternoon
    /** Saves a re-select when the caller already holds the user row. */
    user?: { email: string; name: string };
    /** Saves a re-read when the caller already has the settings. */
    cfg?: Settings;
  } = {}
): Promise<BookResult> {
  const cfg = opts.cfg ?? (await getSettings());
  const source = opts.source ?? "self";
  const slot = opts.slot ?? "day";

  if (date < todayAms()) return { ok: false, error: "That day has passed." };
  if (isWeekend(date)) return { ok: false, error: "The office is closed at weekends." };
  if (isHoliday(date)) return { ok: false, error: "That's a public holiday — the office is closed." };

  // A co-working day belongs to its organiser — no desk booking of any kind,
  // including admin-seated trial visits, can land on that date.
  const coworking = await coworkingDayOn(date);
  if (coworking) {
    return {
      ok: false,
      error: `${coworking.title} has the whole office that day — ask the organiser for a spot instead.`,
    };
  }

  if (source === "self" || source === "block") {
    // Trial members get exactly the one day approved for their visit — no
    // self-service booking beyond it until an admin admits them.
    const [trialUser] = await db
      .select({ status: users.status })
      .from(users)
      .where(eq(users.id, userId));
    if (trialUser?.status === "trial") {
      return {
        ok: false,
        error: "You're here on a trial visit — full booking opens up once you're admitted as a member.",
      };
    }
  }

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
  // Holding a morning and an afternoon separately is fine; overlapping isn't.
  const clash = existing.find((b) => overlaps(asSlot(b.slot), slot));
  if (clash) {
    return { ok: false, error: clashMessage(asSlot(clash.slot), slot) };
  }

  if (source === "self") {
    // Half days count as half, so the cap means the same amount of office
    // time however it's sliced.
    const future = await db
      .select({
        n: sql<number>`coalesce(sum(case when ${bookings.slot} = 'day' then 1 else 0.5 end), 0)::float`,
      })
      .from(bookings)
      .where(
        and(
          eq(bookings.userId, userId),
          eq(bookings.status, "booked"),
          gte(bookings.date, todayAms()),
          eq(bookings.source, "self")
        )
      );
    if (Number(future[0].n) + slotWeight(slot) > cfg.max_future_bookings) {
      return {
        ok: false,
        error: `You can hold at most ${cfg.max_future_bookings} future booking-days at once (a half day counts as a half).`,
      };
    }
  }

  const cap = await capacityForDay(date, cfg);
  const desksLeft = desksLeftFor(cap, slot);
  const flexLeft = flexLeftFor(cap, slot);
  const wantsFlex = opts.seatType === "flex";
  let seatType: "desk" | "flex" | null = null;
  if (wantsFlex) {
    if (flexLeft > 0) seatType = "flex";
  } else if (desksLeft > 0) seatType = "desk";
  else if (flexLeft > 0 && !opts.deskNumber) seatType = "flex";

  if (opts.deskNumber && desksLeft === 0) {
    return {
      ok: false,
      error:
        slot === "day"
          ? "No desk is free for the whole of that day."
          : `All desks are taken that ${SLOT_LABEL[slot]}.`,
    };
  }
  if (wantsFlex && !seatType && !opts.allowWaitlist) {
    return {
      ok: false,
      error: `The lunch table is full that ${slot === "day" ? "day" : SLOT_LABEL[slot]}.`,
    };
  }

  let deskNumber: number | null = null;
  if (seatType === "desk") {
    const assigned = await assignDeskNumber(
      date,
      cfg.desk_count,
      slot,
      opts.deskNumber,
      undefined,
      cap.deskTaken // already fetched by capacityForDay above
    );
    if (!assigned.ok) return { ok: false, error: assigned.error };
    deskNumber = assigned.n;
  }

  if (!seatType) {
    if (!opts.allowWaitlist) {
      return {
        ok: false,
        error:
          slot === "day"
            ? "That day is full."
            : `That ${SLOT_LABEL[slot]} is full.`,
      };
    }
    const [wl] = await db
      .insert(bookings)
      .values({
        id: newId("bk"),
        userId,
        date,
        slot,
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
      slot,
      seatType,
      deskNumber,
      status: "booked",
      source,
      seriesId: opts.seriesId ?? null,
    })
    .returning();

  if (opts.sendConfirmation !== false && source === "self") {
    // Handing off to Resend takes a few hundred milliseconds, and the member
    // is standing there waiting to see their desk number. Confirm first, mail
    // after — the lookup goes with it when the caller didn't supply the user.
    await afterResponse(async () => {
      const recipient =
        opts.user ??
        (await db.select().from(users).where(eq(users.id, userId)))[0];
      if (recipient) {
        await sendBookingConfirmation(
          recipient.email,
          recipient.name,
          booking,
          cfg
        );
      }
    });
  }

  return { ok: true, booking, seatType };
}

export function cancelUrl(booking: Booking): string {
  const exp = new Date(`${booking.date}T23:59:59+02:00`);
  return `${appUrl()}/cancel/${makeToken("cancel", booking.id, exp)}`;
}

/** One-tap "I'm only here this morning" — frees the desk from lunch. */
export function releaseUrl(booking: Booking): string {
  const exp = new Date(`${booking.date}T23:59:59+02:00`);
  return `${appUrl()}/release/${makeToken("release", booking.id, exp)}`;
}

/** "desk 3" / "a lunch-table spot" */
export function describeSeat(booking: Booking): string {
  return booking.seatType === "desk"
    ? `desk ${booking.deskNumber ?? ""}`.trim()
    : "a lunch-table spot";
}

/** "Tuesday 4 August 2026 (morning, 9:00–13:30)" */
export function describeWhen(booking: Booking, cfg: Settings): string {
  const slot = asSlot(booking.slot);
  if (slot === "day") return formatDayLong(booking.date);
  return `${formatDayLong(booking.date)} (${SLOT_LABEL[slot]}, ${slotWindow(slot, cfg)})`;
}

async function sendBookingConfirmation(
  email: string,
  name: string,
  booking: Booking,
  known?: Settings
): Promise<void> {
  const cfg = known ?? (await getSettings());
  const slot = asSlot(booking.slot);
  const flexNote =
    booking.seatType === "flex"
      ? `<p><strong>Heads up:</strong> ${flexWarning(cfg, slot)}</p>`
      : "";
  // Half-day bookers share the desk, so the handover matters to someone else.
  const shareNote =
    slot === "am"
      ? `<p>Someone may have the same desk for the afternoon, so please pack up by the end of lunch (${cfg.flex_unavailable_window}).</p>`
      : slot === "pm"
        ? `<p>Someone may have the same desk for the morning — it'll be free from the start of lunch (${cfg.flex_unavailable_window}).</p>`
        : "";
  await sendEmail({
    to: email,
    subject: `Booked: ${formatDayLong(booking.date)}${slotSuffix(slot)}`,
    kind: "booking_confirmed",
    html: `<p>Hi ${name},</p>
<p>You're booked for <strong>${describeWhen(booking, cfg)}</strong> — ${describeSeat(booking)}.</p>
${flexNote}
${shareNote}
<p>Plans changed? ${link(cancelUrl(booking), "Cancel in one tap")} — no login needed, and it frees the desk for someone else.</p>`,
  });
}

export type SeatTarget =
  | { type: "desk"; deskNumber: number }
  | { type: "flex" };

/** Move an existing booking to another free seat — desk or lunch table. */
export async function switchSeat(
  bookingId: string,
  userId: string,
  target: SeatTarget
): Promise<{ ok: boolean; error?: string }> {
  const cfg = await getSettings();
  const [booking] = await db
    .select()
    .from(bookings)
    .where(eq(bookings.id, bookingId));
  if (!booking || booking.userId !== userId) return { ok: false, error: "Booking not found." };
  if (booking.status !== "booked") {
    return { ok: false, error: "Only confirmed bookings can be moved." };
  }
  if (booking.date < todayAms()) return { ok: false, error: "That day has passed." };

  const slot = asSlot(booking.slot);
  if (target.type === "flex") {
    if (booking.seatType === "flex") return { ok: true }; // already there
    const cap = await capacityForDay(booking.date);
    if (flexLeftFor(cap, slot) <= 0) {
      return {
        ok: false,
        error: `The lunch table is full that ${slot === "day" ? "day" : SLOT_LABEL[slot]}.`,
      };
    }
    await db
      .update(bookings)
      .set({ seatType: "flex", deskNumber: null })
      .where(eq(bookings.id, bookingId));
  } else {
    const assigned = await assignDeskNumber(
      booking.date,
      cfg.desk_count,
      slot,
      target.deskNumber,
      bookingId
    );
    if (!assigned.ok) return { ok: false, error: assigned.error };
    await db
      .update(bookings)
      .set({ seatType: "desk", deskNumber: assigned.n })
      .where(eq(bookings.id, bookingId));
  }

  // Moving off a desk or off the table can free a seat for the waitlist.
  await promoteWaitlist(booking.date);
  return { ok: true };
}

export type ChangeSlotResult =
  | { ok: true; slot: Slot; seatType: "desk" | "flex"; deskNumber: number | null }
  | { ok: false; error: string };

/**
 * Stretch a half day into a full one, trim a full day back to a half, or
 * swap morning for afternoon. Keeps the same desk when it's free across the
 * new hours, otherwise moves to one that is.
 */
export async function changeSlot(
  bookingId: string,
  userId: string,
  slot: Slot
): Promise<ChangeSlotResult> {
  const cfg = await getSettings();
  const [booking] = await db
    .select()
    .from(bookings)
    .where(eq(bookings.id, bookingId));
  if (!booking || booking.userId !== userId) {
    return { ok: false, error: "Booking not found." };
  }
  if (booking.status !== "booked") {
    return { ok: false, error: "Only confirmed bookings can be changed." };
  }
  if (booking.date < todayAms()) return { ok: false, error: "That day has passed." };

  const current = asSlot(booking.slot);
  const seatType = booking.seatType as "desk" | "flex";
  if (current === slot) {
    return { ok: true, slot, seatType, deskNumber: booking.deskNumber };
  }

  // Your own other booking that day (a separate half) can be in the way.
  const others = await db
    .select()
    .from(bookings)
    .where(
      and(
        eq(bookings.userId, userId),
        eq(bookings.date, booking.date),
        inArray(bookings.status, ["booked", "waitlisted"])
      )
    );
  const clash = others.find(
    (b) => b.id !== bookingId && overlaps(asSlot(b.slot), slot)
  );
  if (clash) {
    return {
      ok: false,
      error: `That would clash with your ${SLOT_LABEL[asSlot(clash.slot)]} booking on the same day.`,
    };
  }

  if (seatType === "flex") {
    const cap = await capacityForDay(booking.date);
    const held = halves(current);
    for (const half of halves(slot)) {
      if (held.includes(half)) continue; // already ours
      if (cap[half].flexLeft <= 0) {
        return {
          ok: false,
          error: `The lunch table is full that ${SLOT_LABEL[half === "am" ? "am" : "pm"]}.`,
        };
      }
    }
    await db.update(bookings).set({ slot }).where(eq(bookings.id, bookingId));
    await promoteWaitlist(booking.date);
    return { ok: true, slot, seatType, deskNumber: null };
  }

  // Try to keep the desk they know; fall back to any desk free across the
  // new hours before giving up.
  let deskNumber: number | null = null;
  const keep = booking.deskNumber
    ? await assignDeskNumber(
        booking.date,
        cfg.desk_count,
        slot,
        booking.deskNumber,
        bookingId
      )
    : { ok: false as const, error: "" };
  if (keep.ok) {
    deskNumber = keep.n;
  } else {
    const moved = await assignDeskNumber(
      booking.date,
      cfg.desk_count,
      slot,
      undefined,
      bookingId
    );
    if (!moved.ok || moved.n === null) {
      return {
        ok: false,
        error:
          slot === "day"
            ? "No desk is free for the whole of that day."
            : `No desk is free that ${SLOT_LABEL[slot]}.`,
      };
    }
    deskNumber = moved.n;
  }

  await db
    .update(bookings)
    .set({ slot, deskNumber })
    .where(eq(bookings.id, bookingId));
  // Trimming a full day to a half frees the other half for the waitlist.
  await promoteWaitlist(booking.date);
  return { ok: true, slot, seatType, deskNumber };
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
  const waiting = await db
    .select()
    .from(bookings)
    .where(and(eq(bookings.date, date), eq(bookings.status, "waitlisted")))
    .orderBy(asc(bookings.createdAt));

  // A freed morning can't satisfy someone waiting on a full day, so walk the
  // queue in order and promote the first person the freed hours actually fit.
  for (const next of waiting) {
    const slot = asSlot(next.slot);
    // Prefer desks over flex.
    let seatType: "desk" | "flex" | null = null;
    if (desksLeftFor(cap, slot) > 0) seatType = "desk";
    else if (flexLeftFor(cap, slot) > 0) seatType = "flex";
    if (!seatType) continue;

    let deskNumber: number | null = null;
    if (seatType === "desk") {
      const cfg = await getSettings();
      const assigned = await assignDeskNumber(date, cfg.desk_count, slot);
      if (assigned.ok) deskNumber = assigned.n;
    }
    const [promoted] = await db
      .update(bookings)
      .set({ status: "booked", seatType, deskNumber })
      .where(eq(bookings.id, next.id))
      .returning();

    const [user] = await db.select().from(users).where(eq(users.id, next.userId));
    if (user) {
      const cfg = await getSettings();
      await sendEmail({
        to: user.email,
        subject: `A desk opened up for ${formatDay(date)}${slotSuffix(slot)}`,
        kind: "waitlist_promoted",
        html: `<p>Hi ${user.name},</p>
<p>Good news — a ${seatType === "desk" ? "desk" : "lunch-table spot"} opened up for <strong>${describeWhen(promoted, cfg)}</strong> and it's now yours.</p>
<p>Can't make it after all? ${link(cancelUrl(promoted), "Cancel in one tap")}.</p>`,
      });
    }
    return;
  }
}

// ---------- block booking ----------

export type BlockPreview = {
  eligible: string[]; // days that will be booked
  skippedFull: string[];
  skippedBlockCap: string[];
  skippedExisting: string[];
  skippedHoliday: string[];
  skippedCoworking: string[]; // taken over by a co-working day
  endDate: string; // horizon-clamped
};

export async function previewBlockBooking(
  userId: string,
  weekdays: number[],
  until: string,
  slot: Slot = "day"
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
    skippedCoworking: [],
    endDate,
  };
  if (weekdays.length === 0 || endDate < start) return preview;

  const capMap = await capacityForRange(start, endDate);
  const coworkingDays = await coworkingDaysBetween(start, endDate);
  const own = await db
    .select({ date: bookings.date, slot: bookings.slot })
    .from(bookings)
    .where(
      and(
        eq(bookings.userId, userId),
        inArray(bookings.status, ["booked", "waitlisted"]),
        gte(bookings.date, start),
        lte(bookings.date, endDate)
      )
    );
  // Only your own bookings that overlap the slot you're repeating block it —
  // a standing Tuesday morning can sit next to a one-off Tuesday afternoon.
  const ownDates = new Set(
    own.filter((b) => overlaps(asSlot(b.slot), slot)).map((b) => b.date)
  );

  for (let d = start; d <= endDate; d = addDays(d, 1)) {
    if (!weekdays.includes(isoWeekday(d))) continue;
    if (isWeekend(d)) continue;
    if (isHoliday(d)) {
      preview.skippedHoliday.push(d);
      continue;
    }
    if (coworkingDays.has(d)) {
      preview.skippedCoworking.push(d);
      continue;
    }
    if (ownDates.has(d)) {
      preview.skippedExisting.push(d);
      continue;
    }
    const cap = capMap.get(d)!;
    if (desksLeftFor(cap, slot) <= 0) {
      preview.skippedFull.push(d);
      continue;
    }
    // The repeat-booking cap applies to every half the series would occupy.
    if (halves(slot).some((h) => cap[h].blockDesks >= blockCap)) {
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
  until: string,
  slot: Slot = "day"
): Promise<{ ok: boolean; booked: string[]; preview: BlockPreview; error?: string }> {
  const preview = await previewBlockBooking(userId, weekdays, until, slot);
  if (preview.eligible.length === 0) {
    return { ok: false, booked: [], preview, error: "No bookable days in that range." };
  }
  const [series] = await db
    .insert(bookingSeries)
    .values({
      id: newId("ser"),
      userId,
      weekdays,
      slot,
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
      slot,
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
    const unit = slot === "day" ? "days" : `${SLOT_LABEL[slot]}s`;
    await sendEmail({
      to: user.email,
      subject: `Booked: ${booked.length} ${unit} through ${formatDay(preview.endDate)}`,
      kind: "block_summary",
      html: `<p>Hi ${user.name},</p>
<p>Your repeating booking is in — <strong>${booked.length} ${unit}</strong>:</p>
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

  const mine = await db
    .select()
    .from(bookings)
    .where(
      and(
        eq(bookings.userId, userId),
        eq(bookings.date, date),
        eq(bookings.status, "booked")
      )
    );
  // Someone holding a morning and an afternoon has two rows — attribute the
  // check-in to the one covering the hours they walked in during.
  const nowHalf: Half =
    date === todayAms() ? currentHalf(minutesOfDayAms()) : "am";
  const booking =
    mine.find((b) => halves(asSlot(b.slot)).includes(nowHalf)) ?? mine[0];

  let walkIn = false;
  let overCapacity = false;
  let bookingId = booking?.id ?? null;

  if (!booking && !opts.retroactive) {
    // Walk-in: create a booking if there's space; check them in regardless.
    // Someone arriving after lunch only takes the afternoon, so an afternoon
    // drop-in doesn't read as a whole desk-day in the reports.
    const slot: Slot = date === todayAms() && nowHalf === "pm" ? "pm" : "day";
    const cap = await capacityForDay(date);
    const desksLeft = desksLeftFor(cap, slot);
    const seatType =
      desksLeft > 0 ? "desk" : flexLeftFor(cap, slot) > 0 ? "flex" : "desk";
    overCapacity = !hasRoomFor(cap, slot);
    let deskNumber: number | null = null;
    if (seatType === "desk" && desksLeft > 0) {
      const cfg = await getSettings();
      const assigned = await assignDeskNumber(date, cfg.desk_count, slot);
      if (assigned.ok) deskNumber = assigned.n;
    }
    const [wb] = await db
      .insert(bookings)
      .values({
        id: newId("bk"),
        userId,
        date,
        slot,
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

export function flexWarning(cfg: Settings, slot: Slot = "day"): string {
  // A half day stops (or starts) at exactly the hour the table is cleared, so
  // the usual pack-up warning doesn't apply to it.
  if (slot === "am") {
    return `The lunch table is cleared for lunch at ${cfg.flex_unavailable_window.split("–")[0]} — which is when a morning booking ends anyway, so it works out.`;
  }
  if (slot === "pm") {
    return `The lunch table is in use for lunch until ${cfg.flex_unavailable_window.split("–")[1] ?? ""}, so settle in once it's cleared.`;
  }
  return `The lunch table is used for lunch from ${cfg.flex_unavailable_window}, so you'll need to pack up for an hour. Fine if you're happy to break — less good for deep work, and a half-day booking avoids it entirely.`;
}

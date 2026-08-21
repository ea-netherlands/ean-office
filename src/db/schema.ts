import {
  pgTable,
  text,
  integer,
  boolean,
  timestamp,
  date,
  uniqueIndex,
  index,
} from "drizzle-orm/pg-core";
import { sql } from "drizzle-orm";

// ---------- users ----------

export const users = pgTable(
  "users",
  {
    id: text("id").primaryKey(), // nanoid-style
    email: text("email").notNull(),
    name: text("name").notNull(),
    role: text("role", { enum: ["visitor", "member", "admin"] })
      .notNull()
      .default("visitor"),
    status: text("status", {
      enum: [
        "pending",
        "trial",
        "active",
        "inactive",
        "declined",
        "imported",
        "event_guest",
      ],
    })
      .notNull()
      .default("pending"),
    // The single day their trial visit happened (or is booked for). Trial
    // ends the same day it starts — the admin then admits or declines them.
    trialDate: date("trial_date"),
    trialReminderSentAt: timestamp("trial_reminder_sent_at", { withTimezone: true }),

    // provenance — where this row came from, and (for bulk imports) whether
    // they've claimed the account yet. "imported" rows are silent and
    // uncounted until someone accepts the guidelines at /welcome.
    source: text("source", { enum: ["join", "import", "admin"] })
      .notNull()
      .default("join"),
    claimedAt: timestamp("claimed_at", { withTimezone: true }),
    importBatch: text("import_batch"),

    // intake — part 1
    profileUrl: text("profile_url"),
    descriptor: text("descriptor"), // "which best describes you"
    about: text("about"), // what are you working on / how did you find us
    expectedFrequency: text("expected_frequency"),
    accessibilityNotes: text("accessibility_notes"),
    guidelinesAcceptedAt: timestamp("guidelines_accepted_at", {
      withTimezone: true,
    }),

    // M&E profile — part 2, self-reported, refreshed annually
    causeArea: text("cause_area"),
    causeAreaOther: text("cause_area_other"),
    roleCategory: text("role_category"),
    experienceLevel: text("experience_level"),
    eaFunding: text("ea_funding", {
      enum: ["direct", "employer", "none", "undisclosed"],
    }),
    funders: text("funders").array(),
    gender: text("gender"),
    profileUpdatedAt: timestamp("profile_updated_at", { withTimezone: true }),
    profileSkipCount: integer("profile_skip_count").notNull().default(0),

    // Community profile — what other members may see. Deliberately separate
    // from the M&E answers above, which are aggregate-reporting-only by
    // promise. Opt-in, member-authored, never includes funding or gender.
    profileVisible: boolean("profile_visible").notNull().default(false),
    bio: text("bio"), // "what I'm working on"
    expertise: text("expertise"), // "ask me about"
    publicCauseAreas: text("public_cause_areas").array(),
    publicLink: text("public_link"),

    // no-show ladder state
    noshowEmailOptOut: boolean("noshow_email_opt_out").notNull().default(false),
    lastNoshowEmailAt: timestamp("last_noshow_email_at", {
      withTimezone: true,
    }),

    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
    approvedAt: timestamp("approved_at", { withTimezone: true }),
    approvedBy: text("approved_by"),
    lastSeenAt: timestamp("last_seen_at", { withTimezone: true }),
  },
  (t) => [uniqueIndex("users_email_unique").on(sql`lower(${t.email})`)]
);

/**
 * Extra addresses that reach the same person. People sign up with a work
 * address and later log in with their personal one (or the reverse), and end
 * up as two members with half their history each. Merging two accounts keeps
 * the address that loses as an alias here, so either one still logs them in
 * and nobody has to remember which they used.
 */
export const userEmails = pgTable(
  "user_emails",
  {
    id: text("id").primaryKey(),
    userId: text("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    email: text("email").notNull(),
    source: text("source", { enum: ["merge", "admin"] })
      .notNull()
      .default("merge"),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  // Same case-insensitive uniqueness as users.email. The two tables can't
  // share one constraint, so lookups check both — see lib/users.ts.
  (t) => [uniqueIndex("user_emails_unique").on(sql`lower(${t.email})`)]
);

// ---------- auth ----------

export const loginTokens = pgTable("login_tokens", {
  id: text("id").primaryKey(),
  tokenHash: text("token_hash").notNull().unique(),
  email: text("email").notNull(),
  redirectTo: text("redirect_to"),
  expiresAt: timestamp("expires_at", { withTimezone: true }).notNull(),
  usedAt: timestamp("used_at", { withTimezone: true }),
  createdAt: timestamp("created_at", { withTimezone: true })
    .notNull()
    .defaultNow(),
});

export const sessions = pgTable("sessions", {
  id: text("id").primaryKey(),
  tokenHash: text("token_hash").notNull().unique(),
  userId: text("user_id")
    .notNull()
    .references(() => users.id, { onDelete: "cascade" }),
  expiresAt: timestamp("expires_at", { withTimezone: true }).notNull(),
  createdAt: timestamp("created_at", { withTimezone: true })
    .notNull()
    .defaultNow(),
});

// ---------- visit requests ----------

export const visitRequests = pgTable("visit_requests", {
  id: text("id").primaryKey(),
  userId: text("user_id")
    .notNull()
    .references(() => users.id, { onDelete: "cascade" }),
  requestedDate: date("requested_date").notNull(),
  requestedArrival: text("requested_arrival").notNull(), // "11:00" | "13:00"
  status: text("status", {
    enum: ["pending", "awaiting_reply", "approved", "declined", "expired"],
  })
    .notNull()
    .default("pending"),
  decidedBy: text("decided_by"),
  decidedAt: timestamp("decided_at", { withTimezone: true }),
  declineReason: text("decline_reason"),
  adminNotes: text("admin_notes"),
  questionAskedAt: timestamp("question_asked_at", { withTimezone: true }),
  staleReminderSentAt: timestamp("stale_reminder_sent_at", {
    withTimezone: true,
  }),
  createdAt: timestamp("created_at", { withTimezone: true })
    .notNull()
    .defaultNow(),
});

// ---------- guest booking requests ----------

// A member asking for a desk for someone who has no account. Two flavours,
// because "my colleague is joining me for the day" and "I'm introducing
// someone who might join" need different endings: a one-off guest is seated
// and that's that, a first visit becomes a trial and goes through the usual
// admit/decline. The co-working-day exclusivity check applies to first visits
// (same rule as /join) but not to one-offs, who are the host's own party.
export const guestRequests = pgTable("guest_requests", {
  id: text("id").primaryKey(),
  hostUserId: text("host_user_id")
    .notNull()
    .references(() => users.id, { onDelete: "cascade" }),
  guestName: text("guest_name").notNull(),
  guestEmail: text("guest_email").notNull(),
  date: date("date").notNull(),
  // Null for a single day. Set, and the request covers every working day from
  // `date` to `end_date` — a new colleague's first week, say. Only one-off
  // guests may span days: a first visit is a trial, and a trial is one day.
  endDate: date("end_date"),
  slot: text("slot", { enum: ["day", "am", "pm"] })
    .notNull()
    .default("day"),
  visitType: text("visit_type", { enum: ["one_off", "first_visit"] })
    .notNull()
    .default("one_off"),
  // Why this person, in the host's words — the whole point of the queue.
  reason: text("reason").notNull(),
  status: text("status", { enum: ["pending", "approved", "declined"] })
    .notNull()
    .default("pending"),
  // The account we created (or matched) when approving.
  guestUserId: text("guest_user_id").references(() => users.id, {
    onDelete: "set null",
  }),
  decidedBy: text("decided_by"),
  decidedAt: timestamp("decided_at", { withTimezone: true }),
  declineReason: text("decline_reason"),
  createdAt: timestamp("created_at", { withTimezone: true })
    .notNull()
    .defaultNow(),
});

// ---------- bookings ----------

export const bookingSeries = pgTable("booking_series", {
  id: text("id").primaryKey(),
  userId: text("user_id")
    .notNull()
    .references(() => users.id, { onDelete: "cascade" }),
  weekdays: integer("weekdays").array().notNull(), // 1=Mon … 5=Fri
  slot: text("slot", { enum: ["day", "am", "pm"] })
    .notNull()
    .default("day"),
  startDate: date("start_date").notNull(),
  endDate: date("end_date").notNull(),
  createdAt: timestamp("created_at", { withTimezone: true })
    .notNull()
    .defaultNow(),
});

export const bookings = pgTable(
  "bookings",
  {
    id: text("id").primaryKey(),
    userId: text("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    date: date("date").notNull(),
    seriesId: text("series_id").references(() => bookingSeries.id, {
      onDelete: "set null",
    }),
    seatType: text("seat_type", { enum: ["desk", "flex"] })
      .notNull()
      .default("desk"),
    deskNumber: integer("desk_number"), // 1..desk_count, desks only

    // Half days. `slot` is the source of truth; coversAm/coversPm are derived
    // from it by Postgres so the partial unique indexes below can enforce
    // overlap for free — a "day" row sits in both indexes and therefore
    // collides with either half, with no overlap logic in application code.
    slot: text("slot", { enum: ["day", "am", "pm"] })
      .notNull()
      .default("day"),
    coversAm: boolean("covers_am")
      .notNull()
      .generatedAlwaysAs(sql`slot IN ('day', 'am')`),
    coversPm: boolean("covers_pm")
      .notNull()
      .generatedAlwaysAs(sql`slot IN ('day', 'pm')`),

    status: text("status", { enum: ["booked", "cancelled", "waitlisted"] })
      .notNull()
      .default("booked"),
    source: text("source", { enum: ["self", "block", "walkin", "admin"] })
      .notNull()
      .default("self"),
    noShow: boolean("no_show").notNull().default(false),
    reminderSentAt: timestamp("reminder_sent_at", { withTimezone: true }),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
    cancelledAt: timestamp("cancelled_at", { withTimezone: true }),
  },
  (t) => [
    // One booking per person per half, and one person per desk per half. A
    // full-day row has both flags set, so it lands in both indexes of each
    // pair — which is what makes day-vs-half conflicts impossible.
    uniqueIndex("bookings_user_date_am")
      .on(t.userId, t.date)
      .where(sql`${t.status} = 'booked' AND ${t.coversAm}`),
    uniqueIndex("bookings_user_date_pm")
      .on(t.userId, t.date)
      .where(sql`${t.status} = 'booked' AND ${t.coversPm}`),
    uniqueIndex("bookings_date_desk_am")
      .on(t.date, t.deskNumber)
      .where(
        sql`${t.status} = 'booked' AND ${t.deskNumber} IS NOT NULL AND ${t.coversAm}`
      ),
    uniqueIndex("bookings_date_desk_pm")
      .on(t.date, t.deskNumber)
      .where(
        sql`${t.status} = 'booked' AND ${t.deskNumber} IS NOT NULL AND ${t.coversPm}`
      ),
    index("bookings_date_idx").on(t.date),
  ]
);

// ---------- check-ins ----------

export const checkins = pgTable(
  "checkins",
  {
    id: text("id").primaryKey(),
    userId: text("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    bookingId: text("booking_id").references(() => bookings.id, {
      onDelete: "set null",
    }),
    date: date("date").notNull(), // Amsterdam calendar date of the check-in
    checkedInAt: timestamp("checked_in_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
    isRetroactive: boolean("is_retroactive").notNull().default(false),
  },
  (t) => [uniqueIndex("checkins_user_date_unique").on(t.userId, t.date)]
);

// ---------- no-shows ----------

export const noShowEvents = pgTable("no_show_events", {
  id: text("id").primaryKey(),
  userId: text("user_id")
    .notNull()
    .references(() => users.id, { onDelete: "cascade" }),
  bookingId: text("booking_id")
    .notNull()
    .references(() => bookings.id, { onDelete: "cascade" }),
  date: date("date").notNull(),
  clearedAt: timestamp("cleared_at", { withTimezone: true }),
  clearedBy: text("cleared_by"), // "retro_checkin" | admin user id
  createdAt: timestamp("created_at", { withTimezone: true })
    .notNull()
    .defaultNow(),
});

// ---------- events ----------

export const events = pgTable("events", {
  id: text("id").primaryKey(),
  title: text("title").notNull(),
  date: date("date").notNull(),
  startsAt: text("starts_at"), // "18:00"
  endsAt: text("ends_at"),
  type: text("type", {
    enum: [
      "talk",
      "social",
      "reading_group",
      "workshop",
      "unconference",
      "themed_coworking",
      "other",
    ],
  }).notNull(),
  causeArea: text("cause_area"),
  organiser: text("organiser", { enum: ["ean", "hosted"] })
    .notNull()
    .default("ean"),
  expectedAttendance: integer("expected_attendance"),
  headcount: integer("headcount"), // admin-entered fallback
  source: text("source", { enum: ["manual", "luma"] })
    .notNull()
    .default("manual"),
  // Members can propose events; admins confirm. Only confirmed events show to
  // members and count towards the funder-facing event figures.
  //
  // `cancelled` is called off after it was confirmed, by an admin or by the
  // organiser. Kept rather than deleted: an event that vanishes takes its
  // history with it, and a reporting period shouldn't quietly change shape
  // after the fact. Excluded from the funder counts all the same.
  status: text("status", {
    enum: ["proposed", "confirmed", "declined", "cancelled"],
  })
    .notNull()
    .default("confirmed"),
  cancelledAt: timestamp("cancelled_at", { withTimezone: true }),
  cancelledBy: text("cancelled_by"),
  cancelReason: text("cancel_reason"),
  /**
   * Who lost a booking when a co-working day cleared the office (see
   * lib/coworking-guests.ts). Recorded so that calling the day off can tell
   * exactly those people the space is theirs again — no way to tell them
   * apart from ordinary cancellations otherwise.
   */
  displacedUserIds: text("displaced_user_ids").array(),
  proposalNote: text("proposal_note"),
  questionAskedAt: timestamp("question_asked_at", { withTimezone: true }),
  externalId: text("external_id").unique(), // Luma UID for sync upserts
  url: text("url"), // luma.com event page
  createdBy: text("created_by"),
  createdAt: timestamp("created_at", { withTimezone: true })
    .notNull()
    .defaultNow(),
});

export const eventAttendance = pgTable(
  "event_attendance",
  {
    id: text("id").primaryKey(),
    eventId: text("event_id")
      .notNull()
      .references(() => events.id, { onDelete: "cascade" }),
    userId: text("user_id").references(() => users.id, {
      onDelete: "set null",
    }), // nullable for non-members
    source: text("source", { enum: ["checkin", "rsvp", "manual"] }).notNull(),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (t) => [
    uniqueIndex("event_attendance_unique")
      .on(t.eventId, t.userId, t.source)
      .where(sql`${t.userId} IS NOT NULL`),
  ]
);

// Requests to join a themed coworking day, curated by the event's organiser
// (its createdBy, or any admin) rather than first-come. Deliberately separate
// from eventAttendance, which records facts (attended/rsvp'd), not pending
// decisions.
export const eventGuests = pgTable(
  "event_guests",
  {
    id: text("id").primaryKey(),
    eventId: text("event_id")
      .notNull()
      .references(() => events.id, { onDelete: "cascade" }),
    userId: text("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    status: text("status", { enum: ["pending", "approved", "declined"] })
      .notNull()
      .default("pending"),
    accessibilityNotes: text("accessibility_notes"),
    guidelinesAcceptedAt: timestamp("guidelines_accepted_at", {
      withTimezone: true,
    }).notNull(),
    decidedBy: text("decided_by"),
    decidedAt: timestamp("decided_at", { withTimezone: true }),
    // Post-event "come back as a regular" nudge, sent once the day after.
    nudgeSentAt: timestamp("nudge_sent_at", { withTimezone: true }),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (t) => [uniqueIndex("event_guests_unique").on(t.eventId, t.userId)]
);

// ---------- email log (dev visibility + audit) ----------

export const emailLog = pgTable("email_log", {
  id: text("id").primaryKey(),
  toEmail: text("to_email").notNull(),
  subject: text("subject").notNull(),
  body: text("body").notNull(),
  kind: text("kind").notNull(),
  sentAt: timestamp("sent_at", { withTimezone: true }).notNull().defaultNow(),
  delivered: boolean("delivered").notNull().default(false), // true when a real provider accepted it
});

// ---------- settings ----------

export const settings = pgTable("settings", {
  key: text("key").primaryKey(),
  value: text("value").notNull(), // JSON-encoded
});

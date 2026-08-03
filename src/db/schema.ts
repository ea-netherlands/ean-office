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
      enum: ["pending", "trial", "active", "inactive", "declined"],
    })
      .notNull()
      .default("pending"),
    trialEndsAt: date("trial_ends_at"),

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

// ---------- bookings ----------

export const bookingSeries = pgTable("booking_series", {
  id: text("id").primaryKey(),
  userId: text("user_id")
    .notNull()
    .references(() => users.id, { onDelete: "cascade" }),
  weekdays: integer("weekdays").array().notNull(), // 1=Mon … 5=Fri
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
    uniqueIndex("bookings_user_date_booked")
      .on(t.userId, t.date)
      .where(sql`${t.status} = 'booked'`),
    uniqueIndex("bookings_date_desk_booked")
      .on(t.date, t.deskNumber)
      .where(sql`${t.status} = 'booked' AND ${t.deskNumber} IS NOT NULL`),
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
  status: text("status", { enum: ["proposed", "confirmed", "declined"] })
    .notNull()
    .default("confirmed"),
  proposalNote: text("proposal_note"),
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

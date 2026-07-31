CREATE TABLE "booking_series" (
	"id" text PRIMARY KEY NOT NULL,
	"user_id" text NOT NULL,
	"weekdays" integer[] NOT NULL,
	"start_date" date NOT NULL,
	"end_date" date NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "bookings" (
	"id" text PRIMARY KEY NOT NULL,
	"user_id" text NOT NULL,
	"date" date NOT NULL,
	"series_id" text,
	"seat_type" text DEFAULT 'desk' NOT NULL,
	"status" text DEFAULT 'booked' NOT NULL,
	"source" text DEFAULT 'self' NOT NULL,
	"no_show" boolean DEFAULT false NOT NULL,
	"reminder_sent_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"cancelled_at" timestamp with time zone
);
--> statement-breakpoint
CREATE TABLE "checkins" (
	"id" text PRIMARY KEY NOT NULL,
	"user_id" text NOT NULL,
	"booking_id" text,
	"date" date NOT NULL,
	"checked_in_at" timestamp with time zone DEFAULT now() NOT NULL,
	"is_retroactive" boolean DEFAULT false NOT NULL
);
--> statement-breakpoint
CREATE TABLE "email_log" (
	"id" text PRIMARY KEY NOT NULL,
	"to_email" text NOT NULL,
	"subject" text NOT NULL,
	"body" text NOT NULL,
	"kind" text NOT NULL,
	"sent_at" timestamp with time zone DEFAULT now() NOT NULL,
	"delivered" boolean DEFAULT false NOT NULL
);
--> statement-breakpoint
CREATE TABLE "event_attendance" (
	"id" text PRIMARY KEY NOT NULL,
	"event_id" text NOT NULL,
	"user_id" text,
	"source" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "events" (
	"id" text PRIMARY KEY NOT NULL,
	"title" text NOT NULL,
	"date" date NOT NULL,
	"starts_at" text,
	"ends_at" text,
	"type" text NOT NULL,
	"cause_area" text,
	"organiser" text DEFAULT 'ean' NOT NULL,
	"expected_attendance" integer,
	"headcount" integer,
	"created_by" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "login_tokens" (
	"id" text PRIMARY KEY NOT NULL,
	"token_hash" text NOT NULL,
	"email" text NOT NULL,
	"redirect_to" text,
	"expires_at" timestamp with time zone NOT NULL,
	"used_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "login_tokens_token_hash_unique" UNIQUE("token_hash")
);
--> statement-breakpoint
CREATE TABLE "no_show_events" (
	"id" text PRIMARY KEY NOT NULL,
	"user_id" text NOT NULL,
	"booking_id" text NOT NULL,
	"date" date NOT NULL,
	"cleared_at" timestamp with time zone,
	"cleared_by" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "sessions" (
	"id" text PRIMARY KEY NOT NULL,
	"token_hash" text NOT NULL,
	"user_id" text NOT NULL,
	"expires_at" timestamp with time zone NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "sessions_token_hash_unique" UNIQUE("token_hash")
);
--> statement-breakpoint
CREATE TABLE "settings" (
	"key" text PRIMARY KEY NOT NULL,
	"value" text NOT NULL
);
--> statement-breakpoint
CREATE TABLE "users" (
	"id" text PRIMARY KEY NOT NULL,
	"email" text NOT NULL,
	"name" text NOT NULL,
	"role" text DEFAULT 'visitor' NOT NULL,
	"status" text DEFAULT 'pending' NOT NULL,
	"trial_ends_at" date,
	"profile_url" text,
	"descriptor" text,
	"about" text,
	"expected_frequency" text,
	"accessibility_notes" text,
	"guidelines_accepted_at" timestamp with time zone,
	"cause_area" text,
	"cause_area_other" text,
	"role_category" text,
	"experience_level" text,
	"ea_funding" text,
	"funders" text[],
	"gender" text,
	"profile_updated_at" timestamp with time zone,
	"profile_skip_count" integer DEFAULT 0 NOT NULL,
	"noshow_email_opt_out" boolean DEFAULT false NOT NULL,
	"last_noshow_email_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"approved_at" timestamp with time zone,
	"approved_by" text,
	"last_seen_at" timestamp with time zone
);
--> statement-breakpoint
CREATE TABLE "visit_requests" (
	"id" text PRIMARY KEY NOT NULL,
	"user_id" text NOT NULL,
	"requested_date" date NOT NULL,
	"requested_arrival" text NOT NULL,
	"status" text DEFAULT 'pending' NOT NULL,
	"decided_by" text,
	"decided_at" timestamp with time zone,
	"decline_reason" text,
	"admin_notes" text,
	"question_asked_at" timestamp with time zone,
	"stale_reminder_sent_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "booking_series" ADD CONSTRAINT "booking_series_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "bookings" ADD CONSTRAINT "bookings_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "bookings" ADD CONSTRAINT "bookings_series_id_booking_series_id_fk" FOREIGN KEY ("series_id") REFERENCES "public"."booking_series"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "checkins" ADD CONSTRAINT "checkins_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "checkins" ADD CONSTRAINT "checkins_booking_id_bookings_id_fk" FOREIGN KEY ("booking_id") REFERENCES "public"."bookings"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "event_attendance" ADD CONSTRAINT "event_attendance_event_id_events_id_fk" FOREIGN KEY ("event_id") REFERENCES "public"."events"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "event_attendance" ADD CONSTRAINT "event_attendance_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "no_show_events" ADD CONSTRAINT "no_show_events_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "no_show_events" ADD CONSTRAINT "no_show_events_booking_id_bookings_id_fk" FOREIGN KEY ("booking_id") REFERENCES "public"."bookings"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "sessions" ADD CONSTRAINT "sessions_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "visit_requests" ADD CONSTRAINT "visit_requests_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "bookings_user_date_booked" ON "bookings" USING btree ("user_id","date") WHERE "bookings"."status" = 'booked';--> statement-breakpoint
CREATE INDEX "bookings_date_idx" ON "bookings" USING btree ("date");--> statement-breakpoint
CREATE UNIQUE INDEX "checkins_user_date_unique" ON "checkins" USING btree ("user_id","date");--> statement-breakpoint
CREATE UNIQUE INDEX "event_attendance_unique" ON "event_attendance" USING btree ("event_id","user_id","source") WHERE "event_attendance"."user_id" IS NOT NULL;--> statement-breakpoint
CREATE UNIQUE INDEX "users_email_unique" ON "users" USING btree (lower("email"));
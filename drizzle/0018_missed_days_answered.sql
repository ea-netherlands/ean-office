-- A missed check-in is asked about once. `asked_at` marks the email a day
-- went out in, so the next one only names days since; `absent_confirmed_at`
-- is the member saying they weren't in, which settles the day without
-- clearing it (it was a real no-show).
ALTER TABLE "no_show_events" ADD COLUMN IF NOT EXISTS "asked_at" timestamp with time zone;
--> statement-breakpoint
ALTER TABLE "no_show_events" ADD COLUMN IF NOT EXISTS "absent_confirmed_at" timestamp with time zone;
--> statement-breakpoint
-- Anything already on record when someone's last check-in email went out
-- counts as asked. Without this, the first email after deploy would bring
-- back exactly the days members had rightly left alone last time.
UPDATE "no_show_events" AS ne SET "asked_at" = u."last_noshow_email_at" FROM "users" AS u WHERE u."id" = ne."user_id" AND u."last_noshow_email_at" IS NOT NULL AND ne."asked_at" IS NULL AND ne."cleared_at" IS NULL AND ne."created_at" <= u."last_noshow_email_at";

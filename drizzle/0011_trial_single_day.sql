ALTER TABLE "users" RENAME COLUMN "trial_ends_at" TO "trial_date";--> statement-breakpoint
ALTER TABLE "users" ADD COLUMN "trial_reminder_sent_at" timestamp with time zone;

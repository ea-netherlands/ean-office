ALTER TABLE "events" ADD COLUMN "cancelled_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "events" ADD COLUMN "cancelled_by" text;--> statement-breakpoint
ALTER TABLE "events" ADD COLUMN "cancel_reason" text;--> statement-breakpoint
ALTER TABLE "events" ADD COLUMN "displaced_user_ids" text[];
ALTER TABLE "users" ADD COLUMN "source" text DEFAULT 'join' NOT NULL;--> statement-breakpoint
ALTER TABLE "users" ADD COLUMN "claimed_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "users" ADD COLUMN "import_batch" text;
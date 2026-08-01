ALTER TABLE "users" ADD COLUMN "profile_visible" boolean DEFAULT false NOT NULL;--> statement-breakpoint
ALTER TABLE "users" ADD COLUMN "bio" text;--> statement-breakpoint
ALTER TABLE "users" ADD COLUMN "expertise" text;--> statement-breakpoint
ALTER TABLE "users" ADD COLUMN "public_cause_areas" text[];--> statement-breakpoint
ALTER TABLE "users" ADD COLUMN "public_link" text;
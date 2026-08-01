ALTER TABLE "events" ADD COLUMN "source" text DEFAULT 'manual' NOT NULL;--> statement-breakpoint
ALTER TABLE "events" ADD COLUMN "external_id" text;--> statement-breakpoint
ALTER TABLE "events" ADD COLUMN "url" text;--> statement-breakpoint
ALTER TABLE "events" ADD CONSTRAINT "events_external_id_unique" UNIQUE("external_id");
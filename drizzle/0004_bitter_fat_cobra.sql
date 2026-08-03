ALTER TABLE "events" ADD COLUMN "status" text DEFAULT 'confirmed' NOT NULL;--> statement-breakpoint
ALTER TABLE "events" ADD COLUMN "proposal_note" text;
-- Private co-working days: the office closes, but members aren't shown what
-- for and can't ask in. Everything already on the calendar stays public.
ALTER TABLE "events" ADD COLUMN IF NOT EXISTS "is_private" boolean DEFAULT false NOT NULL;
--> statement-breakpoint
-- Who decided a proposal. Left empty for decisions made before this existed.
ALTER TABLE "events" ADD COLUMN IF NOT EXISTS "decided_by" text;
--> statement-breakpoint
ALTER TABLE "events" ADD COLUMN IF NOT EXISTS "decided_at" timestamp with time zone;

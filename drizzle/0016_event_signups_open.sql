-- Existing events close, new ones open. Adding the column with DEFAULT false
-- backfills every row already on the calendar as closed (there were private
-- intro-course sessions on it), then the default flips so anything created
-- afterwards is open without anyone having to think about it.
ALTER TABLE "events" ADD COLUMN IF NOT EXISTS "signups_open" boolean DEFAULT false NOT NULL;
--> statement-breakpoint
ALTER TABLE "events" ALTER COLUMN "signups_open" SET DEFAULT true;

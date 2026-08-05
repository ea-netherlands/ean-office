DROP INDEX "bookings_user_date_booked";--> statement-breakpoint
DROP INDEX "bookings_date_desk_booked";--> statement-breakpoint
ALTER TABLE "booking_series" ADD COLUMN "slot" text DEFAULT 'day' NOT NULL;--> statement-breakpoint
ALTER TABLE "bookings" ADD COLUMN "slot" text DEFAULT 'day' NOT NULL;--> statement-breakpoint
ALTER TABLE "bookings" ADD COLUMN "covers_am" boolean GENERATED ALWAYS AS (slot IN ('day', 'am')) STORED NOT NULL;--> statement-breakpoint
ALTER TABLE "bookings" ADD COLUMN "covers_pm" boolean GENERATED ALWAYS AS (slot IN ('day', 'pm')) STORED NOT NULL;--> statement-breakpoint
CREATE UNIQUE INDEX "bookings_user_date_am" ON "bookings" USING btree ("user_id","date") WHERE "bookings"."status" = 'booked' AND "bookings"."covers_am";--> statement-breakpoint
CREATE UNIQUE INDEX "bookings_user_date_pm" ON "bookings" USING btree ("user_id","date") WHERE "bookings"."status" = 'booked' AND "bookings"."covers_pm";--> statement-breakpoint
CREATE UNIQUE INDEX "bookings_date_desk_am" ON "bookings" USING btree ("date","desk_number") WHERE "bookings"."status" = 'booked' AND "bookings"."desk_number" IS NOT NULL AND "bookings"."covers_am";--> statement-breakpoint
CREATE UNIQUE INDEX "bookings_date_desk_pm" ON "bookings" USING btree ("date","desk_number") WHERE "bookings"."status" = 'booked' AND "bookings"."desk_number" IS NOT NULL AND "bookings"."covers_pm";
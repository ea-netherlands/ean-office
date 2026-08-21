CREATE TABLE "guest_requests" (
	"id" text PRIMARY KEY NOT NULL,
	"host_user_id" text NOT NULL,
	"guest_name" text NOT NULL,
	"guest_email" text NOT NULL,
	"date" date NOT NULL,
	"slot" text DEFAULT 'day' NOT NULL,
	"visit_type" text DEFAULT 'one_off' NOT NULL,
	"reason" text NOT NULL,
	"status" text DEFAULT 'pending' NOT NULL,
	"guest_user_id" text,
	"decided_by" text,
	"decided_at" timestamp with time zone,
	"decline_reason" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "guest_requests" ADD CONSTRAINT "guest_requests_host_user_id_users_id_fk" FOREIGN KEY ("host_user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "guest_requests" ADD CONSTRAINT "guest_requests_guest_user_id_users_id_fk" FOREIGN KEY ("guest_user_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;
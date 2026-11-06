CREATE TABLE "signup_allowed_emails" (
	"email" text PRIMARY KEY NOT NULL,
	"added_by_email" text NOT NULL,
	"created_at" text NOT NULL
);
--> statement-breakpoint
CREATE TABLE "signup_settings" (
	"id" text PRIMARY KEY NOT NULL,
	"invite_only" boolean NOT NULL,
	"updated_by_email" text NOT NULL,
	"updated_at" text NOT NULL
);

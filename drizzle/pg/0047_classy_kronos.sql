CREATE TABLE "audit_schedules" (
	"project_id" text PRIMARY KEY NOT NULL,
	"start_url" text NOT NULL,
	"interval" text NOT NULL,
	"max_pages" integer NOT NULL,
	"created_by_user_id" text NOT NULL,
	"next_run_at" text NOT NULL,
	"last_audit_id" text,
	"last_error" text,
	"notified_audit_id" text,
	"updated_at" text NOT NULL
);
--> statement-breakpoint
ALTER TABLE "audit_schedules" ADD CONSTRAINT "audit_schedules_project_id_projects_id_fk" FOREIGN KEY ("project_id") REFERENCES "public"."projects"("id") ON DELETE cascade ON UPDATE no action;
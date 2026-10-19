CREATE TABLE "billing_admin_actions" (
	"id" text PRIMARY KEY NOT NULL,
	"organization_id" text NOT NULL,
	"action" text NOT NULL,
	"credits" integer,
	"admin_email" text NOT NULL,
	"created_at" text NOT NULL
);
--> statement-breakpoint
ALTER TABLE "billing_admin_actions" ADD CONSTRAINT "billing_admin_actions_organization_id_organization_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organization"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "billing_admin_actions_org_idx" ON "billing_admin_actions" USING btree ("organization_id","created_at");
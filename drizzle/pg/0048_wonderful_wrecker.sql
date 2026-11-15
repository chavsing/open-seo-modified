CREATE TABLE "report_branding" (
	"organization_id" text PRIMARY KEY NOT NULL,
	"company_name" text NOT NULL,
	"website_url" text,
	"logo_data_url" text,
	"updated_at" text NOT NULL
);
--> statement-breakpoint
ALTER TABLE "report_branding" ADD CONSTRAINT "report_branding_organization_id_organization_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organization"("id") ON DELETE cascade ON UPDATE no action;
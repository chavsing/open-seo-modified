CREATE TABLE "billing_notices" (
	"organization_id" text NOT NULL,
	"kind" text NOT NULL,
	"period_key" text NOT NULL,
	"sent_at" text NOT NULL,
	CONSTRAINT "billing_notices_organization_id_kind_period_key_pk" PRIMARY KEY("organization_id","kind","period_key")
);
--> statement-breakpoint
ALTER TABLE "billing_notices" ADD CONSTRAINT "billing_notices_organization_id_organization_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organization"("id") ON DELETE cascade ON UPDATE no action;
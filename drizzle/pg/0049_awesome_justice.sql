CREATE TABLE "paypal_payments" (
	"id" text PRIMARY KEY NOT NULL,
	"organization_id" text,
	"product" text,
	"status" text NOT NULL,
	"amount" text NOT NULL,
	"currency" text NOT NULL,
	"payer_email" text,
	"note" text,
	"created_at" text NOT NULL,
	"handled_at" text
);
--> statement-breakpoint
ALTER TABLE "paypal_payments" ADD CONSTRAINT "paypal_payments_organization_id_organization_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organization"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "paypal_payments_status_idx" ON "paypal_payments" USING btree ("status","created_at");
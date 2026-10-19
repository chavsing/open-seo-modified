CREATE TABLE "billing_accounts" (
	"organization_id" text PRIMARY KEY NOT NULL,
	"plan_id" text DEFAULT 'free' NOT NULL,
	"plan_status" text DEFAULT 'active' NOT NULL,
	"current_period_end" text,
	"canceled_at" text,
	"created_at" text DEFAULT to_char(now() AT TIME ZONE 'utc', 'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"') NOT NULL,
	"updated_at" text DEFAULT to_char(now() AT TIME ZONE 'utc', 'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"') NOT NULL
);
--> statement-breakpoint
CREATE TABLE "credit_balances" (
	"organization_id" text NOT NULL,
	"pool" text NOT NULL,
	"granted" integer DEFAULT 0 NOT NULL,
	"remaining" integer DEFAULT 0 NOT NULL,
	"next_reset_at" text,
	CONSTRAINT "credit_balances_organization_id_pool_pk" PRIMARY KEY("organization_id","pool")
);
--> statement-breakpoint
CREATE TABLE "credit_events" (
	"id" text PRIMARY KEY NOT NULL,
	"organization_id" text NOT NULL,
	"pool" text NOT NULL,
	"credits" integer NOT NULL,
	"credit_feature" text,
	"paths" text,
	"created_at" text NOT NULL
);
--> statement-breakpoint
CREATE TABLE "credit_holds" (
	"id" text PRIMARY KEY NOT NULL,
	"organization_id" text NOT NULL,
	"pool" text NOT NULL,
	"credits" integer NOT NULL,
	"expires_at" text NOT NULL
);
--> statement-breakpoint
ALTER TABLE "billing_accounts" ADD CONSTRAINT "billing_accounts_organization_id_organization_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organization"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "credit_balances" ADD CONSTRAINT "credit_balances_organization_id_organization_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organization"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "credit_events" ADD CONSTRAINT "credit_events_organization_id_organization_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organization"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "credit_holds" ADD CONSTRAINT "credit_holds_organization_id_organization_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organization"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "credit_events_org_created_idx" ON "credit_events" USING btree ("organization_id","created_at");--> statement-breakpoint
CREATE INDEX "credit_holds_expires_at_idx" ON "credit_holds" USING btree ("expires_at");
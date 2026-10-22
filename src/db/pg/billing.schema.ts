import { sql } from "drizzle-orm";
import { index, integer, pgTable, primaryKey, text } from "drizzle-orm/pg-core";
import { organization } from "./better-auth-schema";

// See src/db/pg/app.schema.ts for why timestamps are ISO-8601 UTC text.
const isoNow = sql`to_char(now() AT TIME ZONE 'utc', 'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"')`;

const CREDIT_POOLS = ["usage_credits", "topup_credits"] as const;

// Mirrors src/db/billing.schema.ts; see there for what each table holds.
export const billingAccounts = pgTable("billing_accounts", {
  organizationId: text("organization_id")
    .primaryKey()
    .references(() => organization.id, { onDelete: "cascade" }),
  planId: text("plan_id").notNull().default("free"),
  planStatus: text("plan_status", {
    enum: ["active", "past_due", "canceled"],
  })
    .notNull()
    .default("active"),
  currentPeriodEnd: text("current_period_end"),
  canceledAt: text("canceled_at"),
  // The PayPal subscription the customer's browser reported after approving
  // the Pro button. A lead for the admin to check in PayPal, not proof of
  // payment: the browser could report anything.
  paypalSubscriptionId: text("paypal_subscription_id"),
  paypalSubscriptionReportedAt: text("paypal_subscription_reported_at"),
  createdAt: text("created_at").notNull().default(isoNow),
  updatedAt: text("updated_at").notNull().default(isoNow),
});

export const creditBalances = pgTable(
  "credit_balances",
  {
    organizationId: text("organization_id")
      .notNull()
      .references(() => organization.id, { onDelete: "cascade" }),
    pool: text("pool", { enum: CREDIT_POOLS }).notNull(),
    granted: integer("granted").notNull().default(0),
    remaining: integer("remaining").notNull().default(0),
    nextResetAt: text("next_reset_at"),
  },
  (t) => [primaryKey({ columns: [t.organizationId, t.pool] })],
);

export const creditHolds = pgTable(
  "credit_holds",
  {
    id: text("id").primaryKey(),
    organizationId: text("organization_id")
      .notNull()
      .references(() => organization.id, { onDelete: "cascade" }),
    pool: text("pool", { enum: CREDIT_POOLS }).notNull(),
    credits: integer("credits").notNull(),
    expiresAt: text("expires_at").notNull(),
  },
  (t) => [index("credit_holds_expires_at_idx").on(t.expiresAt)],
);

export const creditEvents = pgTable(
  "credit_events",
  {
    id: text("id").primaryKey(),
    organizationId: text("organization_id")
      .notNull()
      .references(() => organization.id, { onDelete: "cascade" }),
    pool: text("pool", { enum: CREDIT_POOLS }).notNull(),
    credits: integer("credits").notNull(),
    creditFeature: text("credit_feature"),
    paths: text("paths"),
    createdAt: text("created_at").notNull(),
  },
  (t) => [
    index("credit_events_org_created_idx").on(t.organizationId, t.createdAt),
  ],
);

export const billingAdminActions = pgTable(
  "billing_admin_actions",
  {
    id: text("id").primaryKey(),
    organizationId: text("organization_id")
      .notNull()
      .references(() => organization.id, { onDelete: "cascade" }),
    action: text("action", {
      enum: ["pro_month", "lifetime", "add_credits", "downgrade"],
    }).notNull(),
    credits: integer("credits"),
    adminEmail: text("admin_email").notNull(),
    createdAt: text("created_at").notNull(),
  },
  (t) => [
    index("billing_admin_actions_org_idx").on(t.organizationId, t.createdAt),
  ],
);

import { sql } from "drizzle-orm";
import {
  index,
  integer,
  primaryKey,
  sqliteTable,
  text,
} from "drizzle-orm/sqlite-core";
import { organization } from "./better-auth-schema";

export const billingCustomerStatus = sqliteTable("billing_customer_status", {
  organizationId: text("organization_id")
    .primaryKey()
    .references(() => organization.id, { onDelete: "cascade" }),
  isPaying: integer("is_paying", { mode: "boolean" }).notNull().default(false),
  paidPlanId: text("paid_plan_id"),
  paidPlanStatus: text("paid_plan_status"),
  // Full Autumn customer payload — escape hatch for any field we don't flatten,
  // queryable via json_extract so we never have to widen this table.
  customerJson: text("customer_json").notNull(),
  syncedAt: text("synced_at").notNull(),
  createdAt: text("created_at")
    .notNull()
    .default(sql`(current_timestamp)`),
  updatedAt: text("updated_at")
    .notNull()
    .default(sql`(current_timestamp)`),
});

// Credit pools. The ids double as the pool names callers already use.
const CREDIT_POOLS = ["usage_credits", "topup_credits"] as const;

// The org's plan. Created as "free" the first time billing touches the org
// (ensureBillingAccount); payments move it to a paid plan. Timestamps here and
// in the credit tables are ISO-8601 UTC strings written by the app, so they
// compare the same way on both dialects.
export const billingAccounts = sqliteTable("billing_accounts", {
  organizationId: text("organization_id")
    .primaryKey()
    .references(() => organization.id, { onDelete: "cascade" }),
  planId: text("plan_id").notNull().default("free"),
  planStatus: text("plan_status", {
    enum: ["active", "past_due", "canceled"],
  })
    .notNull()
    .default("active"),
  // End of the paid period; a canceled plan keeps access until then.
  currentPeriodEnd: text("current_period_end"),
  canceledAt: text("canceled_at"),
  createdAt: text("created_at")
    .notNull()
    .default(sql`(current_timestamp)`),
  updatedAt: text("updated_at")
    .notNull()
    .default(sql`(current_timestamp)`),
});

// One row per org and pool. `remaining` already excludes credits held by open
// holds, and can go negative when admitted research overdraws.
export const creditBalances = sqliteTable(
  "credit_balances",
  {
    organizationId: text("organization_id")
      .notNull()
      .references(() => organization.id, { onDelete: "cascade" }),
    pool: text("pool", { enum: CREDIT_POOLS }).notNull(),
    granted: integer("granted").notNull().default(0),
    remaining: integer("remaining").notNull().default(0),
    // When the monthly pool next refills; null for one-time grants.
    nextResetAt: text("next_reset_at"),
  },
  (t) => [primaryKey({ columns: [t.organizationId, t.pool] })],
);

// Credits set aside for provider calls in flight. Settling deletes the row
// and returns the unspent part; an unsettled hold is released at expiresAt.
export const creditHolds = sqliteTable(
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

// Every deduction, for the billing page's usage chart and breakdown.
export const creditEvents = sqliteTable(
  "credit_events",
  {
    id: text("id").primaryKey(),
    organizationId: text("organization_id")
      .notNull()
      .references(() => organization.id, { onDelete: "cascade" }),
    pool: text("pool", { enum: CREDIT_POOLS }).notNull(),
    credits: integer("credits").notNull(),
    creditFeature: text("credit_feature"),
    // JSON array of the DataForSEO paths billed, when known. A label list,
    // not a relation.
    paths: text("paths"),
    createdAt: text("created_at").notNull(),
  },
  (t) => [
    index("credit_events_org_created_idx").on(t.organizationId, t.createdAt),
  ],
);

// Plan changes and credit grants made from the admin page after a PayPal
// payment. The id is generated once per confirm dialog, so a repeated submit
// fails on the primary key instead of granting twice.
export const billingAdminActions = sqliteTable(
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

import { sql } from "drizzle-orm";
import {
  boolean,
  index,
  integer,
  pgTable,
  primaryKey,
  text,
} from "drizzle-orm/pg-core";
import { organization } from "./better-auth-schema";

// See src/db/pg/app.schema.ts for why timestamps are ISO-8601 UTC text.
const isoNow = sql`to_char(now() AT TIME ZONE 'utc', 'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"')`;

export const billingCustomerStatus = pgTable("billing_customer_status", {
  organizationId: text("organization_id")
    .primaryKey()
    .references(() => organization.id, { onDelete: "cascade" }),
  isPaying: boolean("is_paying").notNull().default(false),
  paidPlanId: text("paid_plan_id"),
  paidPlanStatus: text("paid_plan_status"),
  // Full Autumn customer payload — escape hatch for any field we don't flatten,
  // queryable via json_extract so we never have to widen this table.
  customerJson: text("customer_json").notNull(),
  syncedAt: text("synced_at").notNull(),
  createdAt: text("created_at").notNull().default(isoNow),
  updatedAt: text("updated_at").notNull().default(isoNow),
});

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

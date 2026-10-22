import { and, asc, eq, exists, gte, lt, sql } from "drizzle-orm";
import { db } from "@/db";
import { runBatch } from "@/db/runBatch";
import {
  billingAccounts,
  creditBalances,
  creditEvents,
  creditHolds,
} from "@/db/schema";
import {
  AUTUMN_SEO_DATA_BALANCE_FEATURE_ID,
  AUTUMN_SEO_DATA_TOPUP_BALANCE_FEATURE_ID,
  FREE_PLAN_CREDITS,
} from "@/shared/billing";

// The app-owned credit ledger: plan rows, balances, holds and the usage log.
// Every write that moves credits runs as one runBatch, which is a single
// atomic batch on D1 and a transaction on Postgres.

export type CreditPool =
  | typeof AUTUMN_SEO_DATA_BALANCE_FEATURE_ID
  | typeof AUTUMN_SEO_DATA_TOPUP_BALANCE_FEATURE_ID;

type CreditEventDetails = {
  creditFeature?: string | null;
  paths?: readonly string[];
};

export const balanceRow = (organizationId: string, pool: CreditPool) =>
  and(
    eq(creditBalances.organizationId, organizationId),
    eq(creditBalances.pool, pool),
  );

const pathsJson = (paths?: readonly string[]) =>
  paths && paths.length > 0 ? JSON.stringify(paths) : null;

/**
 * Gives a new org its free plan and free credits. Safe to call on every
 * request: existing rows are left untouched, so the grant happens once.
 */
export async function ensureBillingAccount(organizationId: string) {
  await runBatch((tx) => [
    tx.insert(billingAccounts).values({ organizationId }).onConflictDoNothing(),
    tx
      .insert(creditBalances)
      .values([
        {
          organizationId,
          pool: AUTUMN_SEO_DATA_BALANCE_FEATURE_ID,
          granted: FREE_PLAN_CREDITS,
          remaining: FREE_PLAN_CREDITS,
        },
        {
          organizationId,
          pool: AUTUMN_SEO_DATA_TOPUP_BALANCE_FEATURE_ID,
          granted: 0,
          remaining: 0,
        },
      ])
      .onConflictDoNothing(),
  ]);
}

/** Saves the PayPal subscription the customer's browser reported. A repeat
 *  report replaces it (a new subscription after a canceled one). */
export async function recordReportedPaypalSubscription(args: {
  organizationId: string;
  subscriptionId: string;
  reportedAt: string;
}) {
  await ensureBillingAccount(args.organizationId);
  await db
    .update(billingAccounts)
    .set({
      paypalSubscriptionId: args.subscriptionId,
      paypalSubscriptionReportedAt: args.reportedAt,
    })
    .where(eq(billingAccounts.organizationId, args.organizationId));
}

export async function getBillingAccountRow(organizationId: string) {
  const [row] = await db
    .select()
    .from(billingAccounts)
    .where(eq(billingAccounts.organizationId, organizationId))
    .limit(1);
  return row ?? null;
}

export async function getCreditBalanceRows(organizationId: string) {
  const rows = await db
    .select()
    .from(creditBalances)
    .where(eq(creditBalances.organizationId, organizationId));
  return {
    monthly: rows.find((r) => r.pool === AUTUMN_SEO_DATA_BALANCE_FEATURE_ID),
    topup: rows.find(
      (r) => r.pool === AUTUMN_SEO_DATA_TOPUP_BALANCE_FEATURE_ID,
    ),
  };
}

async function readRemaining(organizationId: string, pool: CreditPool) {
  const [row] = await db
    .select({ remaining: creditBalances.remaining })
    .from(creditBalances)
    .where(balanceRow(organizationId, pool))
    .limit(1);
  return row?.remaining ?? null;
}

/**
 * Sets aside `credits` from one pool, or refuses when the pool holds fewer.
 * The hold row is inserted only if the balance covers it, and the balance is
 * reduced only if the hold row exists, both in one batch. On Postgres the
 * first statement locks the balance row, so concurrent holds queue instead of
 * passing on the same reading.
 */
export async function placeCreditHold(args: {
  holdId: string;
  organizationId: string;
  pool: CreditPool;
  credits: number;
  expiresAt: string;
}): Promise<{ allowed: boolean; remaining: number | null }> {
  const { holdId, organizationId, pool, credits, expiresAt } = args;
  await runBatch((tx) => [
    tx
      .update(creditBalances)
      .set({ remaining: sql`${creditBalances.remaining}` })
      .where(balanceRow(organizationId, pool)),
    tx.insert(creditHolds).select(
      tx
        .select({
          id: sql<string>`cast(${holdId} as text)`.as("id"),
          organizationId: creditBalances.organizationId,
          pool: creditBalances.pool,
          credits: sql<number>`cast(${credits} as integer)`.as("credits"),
          expiresAt: sql<string>`cast(${expiresAt} as text)`.as("expires_at"),
        })
        .from(creditBalances)
        .where(
          and(
            balanceRow(organizationId, pool),
            gte(creditBalances.remaining, credits),
          ),
        ),
    ),
    tx
      .update(creditBalances)
      .set({ remaining: sql`${creditBalances.remaining} - ${credits}` })
      .where(
        and(
          balanceRow(organizationId, pool),
          exists(
            tx
              .select({ id: creditHolds.id })
              .from(creditHolds)
              .where(eq(creditHolds.id, holdId)),
          ),
        ),
      ),
  ]);
  const [hold] = await db
    .select({ id: creditHolds.id })
    .from(creditHolds)
    .where(eq(creditHolds.id, holdId))
    .limit(1);
  return {
    allowed: Boolean(hold),
    remaining: await readRemaining(organizationId, pool),
  };
}

/**
 * Settles a hold: charges `credits` (above or below what was held), returns
 * the rest of the hold to the pool, logs the charge, and deletes the hold.
 * Does nothing if the hold is already gone (settled, or released at expiry).
 * `landed` is read back from the logged charge: true when the hold's charge
 * is recorded, by this call or an earlier settle of the same hold (a retry),
 * and false when the hold was released without one.
 */
export async function settleCreditHold(args: {
  holdId: string;
  organizationId: string;
  pool: CreditPool;
  credits: number;
  details?: CreditEventDetails;
}): Promise<{ landed: boolean }> {
  const { holdId, organizationId, pool, credits, details } = args;
  await runBatch((tx) => [
    tx
      .update(creditBalances)
      .set({
        remaining: sql`${creditBalances.remaining} + (select ${creditHolds.credits} from ${creditHolds} where ${creditHolds.id} = ${holdId}) - ${credits}`,
      })
      .where(
        and(
          balanceRow(organizationId, pool),
          exists(
            tx
              .select({ id: creditHolds.id })
              .from(creditHolds)
              .where(eq(creditHolds.id, holdId)),
          ),
        ),
      ),
    ...(credits > 0
      ? [
          tx.insert(creditEvents).select(
            tx
              .select({
                id: creditHolds.id,
                organizationId: creditHolds.organizationId,
                pool: creditHolds.pool,
                credits: sql<number>`cast(${credits} as integer)`.as("credits"),
                creditFeature: sql<
                  string | null
                >`cast(${details?.creditFeature ?? null} as text)`.as(
                  "credit_feature",
                ),
                paths: sql<
                  string | null
                >`cast(${pathsJson(details?.paths)} as text)`.as("paths"),
                createdAt:
                  sql<string>`cast(${new Date().toISOString()} as text)`.as(
                    "created_at",
                  ),
              })
              .from(creditHolds)
              .where(eq(creditHolds.id, holdId)),
          ),
        ]
      : []),
    tx.delete(creditHolds).where(eq(creditHolds.id, holdId)),
  ]);
  if (credits <= 0) return { landed: true };
  const [event] = await db
    .select({ id: creditEvents.id })
    .from(creditEvents)
    .where(eq(creditEvents.id, holdId))
    .limit(1);
  return { landed: Boolean(event) };
}

/**
 * Deducts credits after the fact (spend whose cost is only known once it
 * happened). Without `allowNegative` the balance stops at zero, as Autumn's
 * did; with it, the balance goes into debt.
 */
export async function deductCredits(args: {
  organizationId: string;
  pool: CreditPool;
  credits: number;
  allowNegative: boolean;
  details?: CreditEventDetails;
}) {
  const { organizationId, pool, credits, allowNegative, details } = args;
  const remaining = creditBalances.remaining;
  await runBatch((tx) => [
    tx
      .update(creditBalances)
      .set({
        remaining: allowNegative
          ? sql`${remaining} - ${credits}`
          : sql`case when ${remaining} >= ${credits} then ${remaining} - ${credits} when ${remaining} > 0 then 0 else ${remaining} end`,
      })
      .where(balanceRow(organizationId, pool)),
    tx.insert(creditEvents).values({
      id: crypto.randomUUID(),
      organizationId,
      pool,
      credits,
      creditFeature: details?.creditFeature ?? null,
      paths: pathsJson(details?.paths),
      createdAt: new Date().toISOString(),
    }),
  ]);
}

/**
 * Releases holds whose owner never settled them (the isolate died mid-call),
 * returning their credits. Runs from the 5-minute cron. Each release is the
 * normal zero-credit settle, so a hold settled concurrently is not refunded
 * twice.
 */
export async function releaseExpiredCreditHolds(now = new Date()) {
  const expired = await db
    .select({
      id: creditHolds.id,
      organizationId: creditHolds.organizationId,
      pool: creditHolds.pool,
    })
    .from(creditHolds)
    .where(lt(creditHolds.expiresAt, now.toISOString()))
    .orderBy(asc(creditHolds.expiresAt))
    .limit(100);
  for (const hold of expired) {
    await settleCreditHold({
      holdId: hold.id,
      organizationId: hold.organizationId,
      pool: hold.pool,
      credits: 0,
    });
  }
  return expired.length;
}

export async function listCreditEvents(args: {
  organizationId: string;
  start: string;
  end: string;
}) {
  return db
    .select({
      createdAt: creditEvents.createdAt,
      credits: creditEvents.credits,
      creditFeature: creditEvents.creditFeature,
      paths: creditEvents.paths,
    })
    .from(creditEvents)
    .where(
      and(
        eq(creditEvents.organizationId, args.organizationId),
        gte(creditEvents.createdAt, args.start),
        lt(creditEvents.createdAt, args.end),
      ),
    )
    .orderBy(asc(creditEvents.createdAt));
}

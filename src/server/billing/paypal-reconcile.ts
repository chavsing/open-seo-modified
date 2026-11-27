import { and, eq, gte, isNotNull, lte, or } from "drizzle-orm";
import { z } from "zod";
import { db } from "@/db";
import { billingAccounts } from "@/db/schema";
import { paypalRequest } from "@/server/billing/paypal";
import { recordPayment } from "@/server/billing/paypal-payments";
import { getOptionalEnvValue } from "@/server/lib/runtime-env";
import { AUTUMN_PRO_PLAN_ID, PAYPAL_PRO_PLAN_ID } from "@/shared/billing";

// A safety net for PayPal's webhook. Every 15 minutes the app asks PayPal
// directly about the monthly Pro subscriptions it is waiting on: one whose
// first payment hasn't arrived, or one whose paid month ends within a day or
// is in its grace days. Any completed charge the webhook didn't deliver is
// applied the same way the webhook would, so a charge both report is counted
// once.

const DAY_MS = 24 * 60 * 60_000;
// The webhook usually lands within a minute; this leaves it the first try.
const WEBHOOK_HEAD_START_MS = 10 * 60_000;
// Two months of charges is enough to catch any that went missing.
const LOOKBACK_MS = 62 * DAY_MS;

const subscriptionSchema = z.object({
  plan_id: z.string(),
  custom_id: z.string().optional(),
  subscriber: z.object({ email_address: z.string().optional() }).optional(),
});
const transactionsSchema = z.object({
  transactions: z
    .array(
      z.object({
        id: z.string(),
        status: z.string(),
        time: z.string(),
        amount_with_breakdown: z.object({
          gross_amount: z.object({
            currency_code: z.string(),
            value: z.string(),
          }),
        }),
      }),
    )
    .default([]),
});

/** Returns how many subscriptions it checked. Never throws for one bad one. */
export async function reconcilePaypalSubscriptions(now = new Date()) {
  if (!(await getOptionalEnvValue("PAYPAL_CLIENT_SECRET"))) return 0;
  const accounts = await db
    .select({
      organizationId: billingAccounts.organizationId,
      subscriptionId: billingAccounts.paypalSubscriptionId,
    })
    .from(billingAccounts)
    .where(
      and(
        isNotNull(billingAccounts.paypalSubscriptionId),
        or(
          // Subscribed in the app, first payment not applied yet.
          isNotNull(billingAccounts.paypalSubscriptionReportedAt),
          // A monthly Pro month about to end, or in its grace days.
          and(
            eq(billingAccounts.planId, AUTUMN_PRO_PLAN_ID),
            lte(
              billingAccounts.currentPeriodEnd,
              new Date(now.getTime() + DAY_MS).toISOString(),
            ),
            gte(
              billingAccounts.currentPeriodEnd,
              new Date(now.getTime() - 4 * DAY_MS).toISOString(),
            ),
          ),
        ),
      ),
    )
    .limit(50);
  for (const account of accounts) {
    if (!account.subscriptionId) continue;
    await reconcileSubscription(
      account.organizationId,
      account.subscriptionId,
      now,
    ).catch((error: unknown) =>
      console.error("[paypal] subscription check failed", {
        organizationId: account.organizationId,
        error,
      }),
    );
  }
  return accounts.length;
}

async function reconcileSubscription(
  organizationId: string,
  subscriptionId: string,
  now: Date,
) {
  const id = encodeURIComponent(subscriptionId);
  const response = await paypalRequest(`/v1/billing/subscriptions/${id}`);
  if (!response.ok) {
    throw new Error(`PayPal subscription read failed with ${response.status}`);
  }
  const subscription = subscriptionSchema.parse(response.body);
  // The subscription must be the app's Pro plan, started from this account's
  // own Subscribe button: the reported id came from a browser.
  if (
    subscription.plan_id !== PAYPAL_PRO_PLAN_ID ||
    subscription.custom_id?.trim() !== organizationId
  )
    return;

  const query = new URLSearchParams({
    start_time: new Date(now.getTime() - LOOKBACK_MS).toISOString(),
    end_time: new Date(now.getTime() - WEBHOOK_HEAD_START_MS).toISOString(),
  });
  const listed = await paypalRequest(
    `/v1/billing/subscriptions/${id}/transactions?${query.toString()}`,
  );
  if (!listed.ok) {
    throw new Error(`PayPal transactions read failed with ${listed.status}`);
  }
  for (const charge of transactionsSchema.parse(listed.body).transactions) {
    if (charge.status !== "COMPLETED") continue;
    await recordPayment({
      id: charge.id,
      amount: charge.amount_with_breakdown.gross_amount.value,
      currency: charge.amount_with_breakdown.gross_amount.currency_code,
      payerEmail: subscription.subscriber?.email_address ?? null,
      organizationId,
      product: "pro_month",
      paidAt: charge.time,
    });
  }
}

import { and, eq, inArray, isNull, lt, or } from "drizzle-orm";
import { z } from "zod";
import { db } from "@/db";
import { billingAccounts } from "@/db/schema";
import {
  isGenuinePaddleSignature,
  paddleRequest,
  productForPaddlePrice,
} from "@/server/billing/paddle";
import { recordPayment } from "@/server/billing/paypal-payments";
import { getOptionalEnvValue } from "@/server/lib/runtime-env";
import {
  AUTUMN_PRO_PLAN_ID,
  AUTUMN_PRO_YEARLY_PLAN_ID,
} from "@/shared/billing";

// Paddle's webhook (POST /api/paddle/webhook). A completed transaction is a
// payment: the first or a renewal of a Pro subscription, Lifetime, or a
// credit pack, applied once per transaction id like a PayPal payment. The
// subscription events keep a Pro plan's status in step with Paddle
// (canceled, past due, active again); its access itself always runs to the
// paid period's end, which only payments move.

const eventSchema = z.object({
  event_id: z.string(),
  event_type: z.string(),
  occurred_at: z.string(),
  data: z.unknown(),
});
const customDataSchema = z
  .object({ organizationId: z.string().min(1).optional() })
  .nullish();
const transactionSchema = z.object({
  id: z.string(),
  status: z.string(),
  customer_id: z.string().nullish(),
  subscription_id: z.string().nullish(),
  custom_data: z.unknown(),
  currency_code: z.string(),
  items: z.array(z.object({ price: z.object({ id: z.string() }).nullish() })),
  details: z
    .object({ totals: z.object({ grand_total: z.string() }).nullish() })
    .nullish(),
});
const subscriptionSchema = z.object({
  id: z.string(),
  status: z.string(),
  scheduled_change: z.object({ action: z.string() }).nullish(),
});
const customerSchema = z.object({
  data: z.object({ email: z.string().nullish() }),
});

export async function handlePaddleWebhook(request: Request) {
  if (request.method !== "POST") {
    return new Response("Method not allowed", { status: 405 });
  }
  const secret = await getOptionalEnvValue("PADDLE_WEBHOOK_SECRET");
  if (!secret) {
    // Not set up yet: Paddle keeps retrying.
    console.error("[paddle] PADDLE_WEBHOOK_SECRET is not set");
    return new Response("Not configured", { status: 503 });
  }
  const raw = await request.text();
  if (
    !(await isGenuinePaddleSignature(
      request.headers.get("paddle-signature"),
      raw,
      secret,
    ))
  ) {
    console.warn("[paddle] webhook signature rejected");
    return new Response("Invalid signature", { status: 401 });
  }
  let parsedBody: unknown;
  try {
    parsedBody = JSON.parse(raw);
  } catch {
    return new Response("Bad request", { status: 400 });
  }
  const event = eventSchema.safeParse(parsedBody);
  if (!event.success) return new Response("Bad request", { status: 400 });

  try {
    await handleEvent(event.data);
    return new Response("OK");
  } catch (error) {
    console.error("[paddle] webhook failed", {
      eventId: event.data.event_id,
      eventType: event.data.event_type,
      error,
    });
    return new Response("Error", { status: 500 });
  }
}

async function handleEvent(event: z.infer<typeof eventSchema>) {
  if (event.event_type === "transaction.completed") {
    await handleTransaction(transactionSchema.parse(event.data));
  } else if (event.event_type.startsWith("subscription.")) {
    await handleSubscription(
      subscriptionSchema.parse(event.data),
      event.occurred_at,
    );
  }
}

async function handleTransaction(
  transaction: z.infer<typeof transactionSchema>,
) {
  if (transaction.status !== "completed") return;
  const prices = transaction.items.flatMap((item) =>
    item.price ? [item.price.id] : [],
  );
  const products = await Promise.all(prices.map(productForPaddlePrice));
  const product = products.length === 1 ? products[0] : null;
  // Not one of the app's products (or several in one basket, which the app's
  // checkout never makes): nothing to apply.
  if (!product) {
    if (products.some(Boolean)) {
      console.warn("[paddle] transaction with several items ignored", {
        id: transaction.id,
      });
    }
    return;
  }

  // The app's checkout tags each payment with the account; a renewal may
  // only carry the subscription, which the first payment linked.
  const tagged =
    customDataSchema.safeParse(transaction.custom_data).data?.organizationId ??
    null;
  const organizationId =
    tagged ?? (await accountForSubscription(transaction.subscription_id));
  const grandTotal = transaction.details?.totals?.grand_total ?? "0";

  const status = await recordPayment({
    source: "Paddle",
    id: transaction.id,
    // Paddle's totals are in the currency's smallest unit.
    amount: (Number(grandTotal) / 100).toFixed(2),
    currency: transaction.currency_code,
    payerEmail: organizationId
      ? null
      : await customerEmail(transaction.customer_id),
    organizationId,
    product,
    priceChecked: true,
    unmatchedReason:
      "Paddle didn't say which account this payment is for (it wasn't made from the app's checkout). Find the customer by the payer email and record it by hand.",
  });

  // Link the subscription to the account once its payment has turned Pro
  // on, so renewals and cancellations find it. A refused change (e.g. Pro
  // on a Lifetime account) leaves the account unlinked.
  if (
    status === "applied" &&
    organizationId &&
    transaction.subscription_id &&
    (product === "pro_month" || product === "pro_year")
  ) {
    await db
      .update(billingAccounts)
      .set({
        paddleSubscriptionId: transaction.subscription_id,
        paddleCustomerId: transaction.customer_id ?? null,
      })
      .where(eq(billingAccounts.organizationId, organizationId));
  }
}

async function accountForSubscription(
  subscriptionId: string | null | undefined,
) {
  if (!subscriptionId) return null;
  const [row] = await db
    .select({ organizationId: billingAccounts.organizationId })
    .from(billingAccounts)
    .where(eq(billingAccounts.paddleSubscriptionId, subscriptionId))
    .limit(1);
  return row?.organizationId ?? null;
}

/** The payer's email, for the admin to find an unmatched payment's account. */
async function customerEmail(customerId: string | null | undefined) {
  if (!customerId) return null;
  try {
    const response = await paddleRequest(
      `/customers/${encodeURIComponent(customerId)}`,
    );
    if (!response?.ok) return null;
    return customerSchema.safeParse(response.body).data?.data.email ?? null;
  } catch {
    return null;
  }
}

/**
 * Mirrors a subscription's state onto the Pro plan it pays for: canceled
 * (now or at the period's end), past due, or active. Only a Pro or Pro
 * Yearly plan is touched, so a stale subscription can never cancel Lifetime.
 */
async function handleSubscription(
  subscription: z.infer<typeof subscriptionSchema>,
  occurredAt: string,
) {
  const planStatus =
    subscription.status === "canceled" ||
    subscription.scheduled_change?.action === "cancel"
      ? "canceled"
      : subscription.status === "past_due"
        ? "past_due"
        : subscription.status === "active"
          ? "active"
          : null;
  // Paused and trialing aren't offered.
  if (!planStatus) return;
  const at = new Date(occurredAt).toISOString();
  const updated = await db
    .update(billingAccounts)
    .set({
      planStatus,
      canceledAt: planStatus === "canceled" ? at : null,
      paddleStatusAt: at,
      updatedAt: new Date().toISOString(),
    })
    .where(
      and(
        eq(billingAccounts.paddleSubscriptionId, subscription.id),
        inArray(billingAccounts.planId, [
          AUTUMN_PRO_PLAN_ID,
          AUTUMN_PRO_YEARLY_PLAN_ID,
        ]),
        or(
          isNull(billingAccounts.paddleStatusAt),
          lt(billingAccounts.paddleStatusAt, at),
        ),
      ),
    )
    .returning({ organizationId: billingAccounts.organizationId });
  console.info("[paddle] subscription status", {
    subscriptionId: subscription.id,
    planStatus,
    organizationId: updated[0]?.organizationId ?? null,
  });
}

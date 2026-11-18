import { z } from "zod";
import { paypalRequest } from "@/server/billing/paypal";
import {
  parseCheckoutCustomId,
  productForAmount,
  recordPaypalPayment,
} from "@/server/billing/paypal-payments";
import { getOptionalEnvValue } from "@/server/lib/runtime-env";
import { PAYPAL_PRO_PLAN_ID } from "@/shared/billing";

// PayPal's webhook (POST /api/paypal/webhook). It tells the app about every
// completed payment on the client's PayPal app: monthly Pro charges, the
// app's own checkout, and payments through the old payment links. The same
// PayPal app also takes the client's other sales (his GoHighLevel store), so
// a payment that isn't for an AGS MASTER product is ignored.

const eventSchema = z.object({
  id: z.string(),
  event_type: z.string(),
  resource: z.unknown(),
});
const captureSchema = z.object({
  id: z.string(),
  status: z.string(),
  amount: z.object({ currency_code: z.string(), value: z.string() }),
  custom_id: z.string().optional(),
  supplementary_data: z
    .object({
      related_ids: z.object({ order_id: z.string().optional() }).optional(),
    })
    .optional(),
});
const saleSchema = z.object({
  id: z.string(),
  state: z.string(),
  amount: z.object({ total: z.string(), currency: z.string() }),
  billing_agreement_id: z.string().optional(),
});
const subscriptionSchema = z.object({
  plan_id: z.string(),
  custom_id: z.string().optional(),
  subscriber: z.object({ email_address: z.string().optional() }).optional(),
});
const orderPayerSchema = z.object({
  payer: z.object({ email_address: z.string().optional() }).optional(),
});

export async function handlePaypalWebhook(request: Request) {
  if (request.method !== "POST") {
    return new Response("Method not allowed", { status: 405 });
  }
  const webhookId = await getOptionalEnvValue("PAYPAL_WEBHOOK_ID");
  if (!webhookId) {
    // Not set up yet: PayPal keeps retrying for 3 days.
    console.error("[paypal] PAYPAL_WEBHOOK_ID is not set");
    return new Response("Not configured", { status: 503 });
  }
  const raw = await request.text();
  let parsedBody: unknown;
  try {
    parsedBody = JSON.parse(raw);
  } catch {
    return new Response("Bad request", { status: 400 });
  }
  const event = eventSchema.safeParse(parsedBody);
  if (!event.success) return new Response("Bad request", { status: 400 });

  try {
    if (!(await isGenuine(request, raw, webhookId))) {
      console.warn("[paypal] webhook signature rejected", {
        eventId: event.data.id,
      });
      return new Response("Invalid signature", { status: 401 });
    }
    await handleEvent(event.data.event_type, event.data.resource);
    return new Response("OK");
  } catch (error) {
    console.error("[paypal] webhook failed", {
      eventId: event.data.id,
      eventType: event.data.event_type,
      error,
    });
    return new Response("Error", { status: 500 });
  }
}

// The signature PayPal sends with each event, as its check expects it.
const SIGNATURE_HEADERS = [
  ["auth_algo", "paypal-auth-algo"],
  ["cert_url", "paypal-cert-url"],
  ["transmission_id", "paypal-transmission-id"],
  ["transmission_sig", "paypal-transmission-sig"],
  ["transmission_time", "paypal-transmission-time"],
] as const;

/**
 * Asks PayPal whether it sent this event to this webhook. The event goes
 * back byte for byte: re-serialising it can change numbers and fail the
 * check.
 */
async function isGenuine(request: Request, raw: string, webhookId: string) {
  const fields = SIGNATURE_HEADERS.map(
    ([field, name]) => [field, request.headers.get(name)] as const,
  );
  // Not from PayPal at all: no need to ask.
  if (fields.some(([, value]) => !value)) return false;
  const signature = fields
    .map(([field, value]) => `"${field}":${JSON.stringify(value)}`)
    .join(",");
  const response = await paypalRequest(
    "/v1/notifications/verify-webhook-signature",
    {
      method: "POST",
      body: `{${signature},"webhook_id":${JSON.stringify(webhookId)},"webhook_event":${raw}}`,
    },
  );
  // PayPal refusing the check itself (a malformed signature) is a forgery;
  // PayPal being down is retried.
  if (response.status >= 400 && response.status < 500) return false;
  if (!response.ok) {
    throw new Error(`PayPal signature check failed with ${response.status}`);
  }
  return (
    z.object({ verification_status: z.string() }).safeParse(response.body).data
      ?.verification_status === "SUCCESS"
  );
}

async function handleEvent(eventType: string, resource: unknown) {
  if (eventType === "PAYMENT.CAPTURE.COMPLETED") {
    await handleCapture(captureSchema.parse(resource));
  } else if (eventType === "PAYMENT.SALE.COMPLETED") {
    await handleSale(saleSchema.parse(resource));
  }
}

async function handleCapture(capture: z.infer<typeof captureSchema>) {
  if (capture.status !== "COMPLETED") return;
  const amount = capture.amount.value;
  const currency = capture.amount.currency_code;
  const tagged = parseCheckoutCustomId(capture.custom_id);
  if (tagged) {
    await recordPaypalPayment({
      id: capture.id,
      amount,
      currency,
      payerEmail: null,
      ...tagged,
    });
    return;
  }
  // No account attached: an old payment link, or not ours at all.
  const product = productForAmount(amount, currency);
  if (!product || product === "pro_month") return;
  const orderId = capture.supplementary_data?.related_ids?.order_id;
  await recordPaypalPayment({
    id: capture.id,
    amount,
    currency,
    payerEmail: orderId ? await orderPayerEmail(orderId) : null,
    organizationId: null,
    product,
    unmatchedReason:
      "Paid through a PayPal payment link, which doesn't say which account it is for. Find the customer by the payer email and record it by hand.",
  });
}

async function orderPayerEmail(orderId: string) {
  const response = await paypalRequest(
    `/v2/checkout/orders/${encodeURIComponent(orderId)}`,
  );
  if (!response.ok) return null;
  return (
    orderPayerSchema.safeParse(response.body).data?.payer?.email_address ?? null
  );
}

/** A monthly Pro charge. The subscription says which plan and account. */
async function handleSale(sale: z.infer<typeof saleSchema>) {
  if (sale.state !== "completed" || !sale.billing_agreement_id) return;
  const subscriptionId = sale.billing_agreement_id;
  const response = await paypalRequest(
    `/v1/billing/subscriptions/${encodeURIComponent(subscriptionId)}`,
  );
  if (!response.ok) {
    throw new Error(`PayPal subscription read failed with ${response.status}`);
  }
  const subscription = subscriptionSchema.parse(response.body);
  if (subscription.plan_id !== PAYPAL_PRO_PLAN_ID) return;
  // The app's Subscribe button sets custom_id to the account id.
  const organizationId = subscription.custom_id?.trim() || null;
  await recordPaypalPayment({
    id: sale.id,
    amount: sale.amount.total,
    currency: sale.amount.currency,
    payerEmail: subscription.subscriber?.email_address ?? null,
    organizationId,
    product: "pro_month",
    unmatchedReason: `Subscription ${subscriptionId} doesn't say which account it is for (it was started from PayPal's link, not the app). Find the customer by the payer email and record it by hand.`,
  });
}

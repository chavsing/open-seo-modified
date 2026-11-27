import { z } from "zod";
import type { EnsuredUserContext } from "@/middleware/ensure-user/types";
import { requireOrgPermission } from "@/server/auth/org-gate";
import { getBillingAccountRow } from "@/server/billing/creditLedger";
import { paypalRequest } from "@/server/billing/paypal";
import {
  checkoutCustomId,
  parseCheckoutCustomId,
  productName,
  productPriceUsd,
  recordPayment,
} from "@/server/billing/paypal-payments";
import { hasPaidAccess } from "@/server/billing/plan-access";
import { AppError } from "@/server/lib/errors";
import {
  AUTUMN_LIFETIME_PLAN_ID,
  type PaypalCheckoutProduct,
} from "@/shared/billing";

// The app's own PayPal checkout for one-time payments (Pro Yearly, Lifetime,
// credit pack). The server sets the price and tags the order with the
// account, so the browser can't change either; it captures the payment as
// soon as the customer approves, and the plan turns on right away.

type CheckoutContext = Pick<EnsuredUserContext, "organizationId" | "role">;

const amountSchema = z.object({ currency_code: z.string(), value: z.string() });
const orderSchema = z.object({
  id: z.string(),
  status: z.string(),
  payer: z.object({ email_address: z.string().optional() }).optional(),
  purchase_units: z
    .array(
      z.object({
        custom_id: z.string().optional(),
        payments: z
          .object({
            captures: z
              .array(
                z.object({
                  id: z.string(),
                  status: z.string(),
                  amount: amountSchema,
                }),
              )
              .optional(),
          })
          .optional(),
      }),
    )
    .default([]),
});
const errorSchema = z.object({
  details: z.array(z.object({ issue: z.string() })).default([]),
});

/** A Lifetime account has nothing more to buy but credits. */
async function refuseCheckout(
  organizationId: string,
  product: PaypalCheckoutProduct,
) {
  if (product === "credit_pack") return;
  const account = await getBillingAccountRow(organizationId);
  if (account?.planId === AUTUMN_LIFETIME_PLAN_ID && hasPaidAccess(account)) {
    throw new AppError(
      "VALIDATION_ERROR",
      "This account already has Lifetime access.",
    );
  }
}

export async function createCheckoutOrder(
  context: CheckoutContext,
  product: PaypalCheckoutProduct,
) {
  requireOrgPermission(context, { billing: ["manage"] });
  await refuseCheckout(context.organizationId, product);
  const response = await paypalRequest("/v2/checkout/orders", {
    method: "POST",
    body: JSON.stringify({
      intent: "CAPTURE",
      purchase_units: [
        {
          custom_id: checkoutCustomId(context.organizationId, product),
          description: `AGS MASTER ${productName(product)}`,
          amount: {
            currency_code: "USD",
            value: productPriceUsd(product).toFixed(2),
          },
        },
      ],
      application_context: {
        brand_name: "AGS MASTER",
        shipping_preference: "NO_SHIPPING",
      },
    }),
  });
  if (!response.ok) {
    console.error("[paypal] order create failed", {
      status: response.status,
      body: response.body,
    });
    throw new AppError("UPSTREAM_UNAVAILABLE");
  }
  return orderSchema.parse(response.body).id;
}

async function getOrder(orderId: string) {
  const response = await paypalRequest(
    `/v2/checkout/orders/${encodeURIComponent(orderId)}`,
  );
  if (response.status === 404) throw new AppError("NOT_FOUND");
  if (!response.ok) throw new AppError("UPSTREAM_UNAVAILABLE");
  return orderSchema.parse(response.body);
}

/**
 * Captures an order the customer approved in PayPal's window and applies
 * it. "pending" means PayPal is still clearing the money (e.g. an eCheck);
 * its webhook applies the payment when it completes. "declined" means the
 * customer should pick another card or account in PayPal's window.
 */
export async function captureCheckoutOrder(
  context: CheckoutContext,
  orderId: string,
): Promise<"applied" | "needs_review" | "pending" | "declined"> {
  requireOrgPermission(context, { billing: ["manage"] });
  const order = await getOrder(orderId);
  const tagged = parseCheckoutCustomId(order.purchase_units[0]?.custom_id);
  // Only the account the order was created for can capture it.
  if (!tagged || tagged.organizationId !== context.organizationId) {
    throw new AppError("NOT_FOUND");
  }

  let captured = order;
  if (order.status !== "COMPLETED") {
    const response = await paypalRequest(
      `/v2/checkout/orders/${encodeURIComponent(orderId)}/capture`,
      { method: "POST", requestId: `capture-${orderId}` },
    );
    if (response.ok) {
      captured = orderSchema.parse(response.body);
    } else {
      const issue = errorSchema.safeParse(response.body).data?.details[0]
        ?.issue;
      if (issue === "INSTRUMENT_DECLINED") return "declined";
      if (issue === "ORDER_ALREADY_CAPTURED") {
        captured = await getOrder(orderId);
      } else {
        console.error("[paypal] capture failed", {
          orderId,
          status: response.status,
          body: response.body,
        });
        throw new AppError("UPSTREAM_UNAVAILABLE");
      }
    }
  }

  const capture = captured.purchase_units[0]?.payments?.captures?.[0];
  if (!capture) throw new AppError("UPSTREAM_UNAVAILABLE");
  if (capture.status !== "COMPLETED") return "pending";
  return recordPayment({
    id: capture.id,
    amount: capture.amount.value,
    currency: capture.amount.currency_code,
    payerEmail:
      captured.payer?.email_address ?? order.payer?.email_address ?? null,
    organizationId: tagged.organizationId,
    product: tagged.product,
  });
}

import { and, desc, eq, gte, inArray, isNull } from "drizzle-orm";
import { db } from "@/db";
import {
  billingAdminActions,
  member,
  organization,
  paypalPayments,
  user,
} from "@/db/schema";
import {
  applyAdminBillingAction,
  type AdminBillingAction,
} from "@/server/billing/adminBillingRepository";
import { notifyPlanChange } from "@/server/billing/billingNotices";
import { AppError } from "@/server/lib/errors";
import {
  CREDIT_PACK_CREDITS,
  CREDIT_PACK_PRICE_USD,
  LIFETIME_PRICE_USD,
  PRO_MONTHLY_PRICE_USD,
  PRO_YEARLY_PRICE_USD,
  type PaypalCheckoutProduct,
} from "@/shared/billing";

// Turns a PayPal or Paddle payment into the plan change the admin page would
// make by hand, once per payment id. PayPal's checkout, PayPal's webhook and
// Paddle's webhook all land here, PayPal's often twice for the same payment.
// Paddle's ids (txn_...) can't collide with PayPal's.

type PaypalProduct = "pro_month" | PaypalCheckoutProduct;

const PRODUCTS: Record<
  PaypalProduct,
  { priceUsd: number; name: string; change: AdminBillingAction }
> = {
  pro_month: {
    priceUsd: PRO_MONTHLY_PRICE_USD,
    name: "Pro (monthly)",
    change: { action: "pro_month" },
  },
  pro_year: {
    priceUsd: PRO_YEARLY_PRICE_USD,
    name: "Pro Yearly",
    change: { action: "pro_year" },
  },
  lifetime: {
    priceUsd: LIFETIME_PRICE_USD,
    name: "Lifetime",
    change: { action: "lifetime" },
  },
  credit_pack: {
    priceUsd: CREDIT_PACK_PRICE_USD,
    name: "Credit pack",
    change: { action: "add_credits", credits: CREDIT_PACK_CREDITS },
  },
};

export function productPriceUsd(product: PaypalProduct) {
  return PRODUCTS[product].priceUsd;
}

export function productName(product: PaypalProduct) {
  return PRODUCTS[product].name;
}

/** The product a USD amount pays for, to label a payment made outside the
 *  app's checkout. Null when no product costs that much. */
export function productForAmount(
  amount: string,
  currency: string,
): PaypalProduct | null {
  if (currency !== "USD") return null;
  const value = Number(amount);
  const match = Object.entries(PRODUCTS).find(
    ([, product]) => product.priceUsd === value,
  );
  return match ? toProduct(match[0]) : null;
}

function toProduct(value: string): PaypalProduct | null {
  return value === "pro_month" ||
    value === "pro_year" ||
    value === "lifetime" ||
    value === "credit_pack"
    ? value
    : null;
}

// The custom_id the app's checkout puts on each order. PayPal returns it on
// the payment, which is how a payment finds its account.
const CHECKOUT_PREFIX = "ags";

export function checkoutCustomId(
  organizationId: string,
  product: PaypalCheckoutProduct,
) {
  return `${CHECKOUT_PREFIX}:${product}:${organizationId}`;
}

export function parseCheckoutCustomId(customId: string | null | undefined) {
  const [prefix, product, organizationId] = (customId ?? "").split(":");
  const parsed = toProduct(product ?? "");
  if (prefix !== CHECKOUT_PREFIX || !parsed || parsed === "pro_month") {
    return null;
  }
  return organizationId ? { product: parsed, organizationId } : null;
}

type ReceivedPayment = {
  /** Who took the payment. PayPal unless said otherwise. */
  source?: "PayPal" | "Paddle";
  /** PayPal's capture or sale id, or Paddle's transaction id. */
  id: string;
  amount: string;
  currency: string;
  payerEmail: string | null;
  /** Null when the payment carries no account (e.g. an old payment link). */
  organizationId: string | null;
  product: PaypalProduct | null;
  /** Why the account or product is unknown, for the admin page. */
  unmatchedReason?: string;
  /** When PayPal took a monthly charge, to recognise one already counted. */
  paidAt?: string;
  /** The product came from the payment's own price ID (Paddle), so the
   *  amount, which includes tax and any discount, isn't checked. */
  priceChecked?: boolean;
};

/**
 * Applies a completed payment to its account, or records it for the admin
 * when it can't be. Safe to call again for the same payment: the first
 * record wins and the plan change itself is keyed on the payment id. An
 * unexpected failure throws without recording, so the webhook retries.
 */
export async function recordPayment(
  payment: ReceivedPayment,
): Promise<"applied" | "needs_review"> {
  const source = payment.source ?? "PayPal";
  const [existing] = await db
    .select({ status: paypalPayments.status })
    .from(paypalPayments)
    .where(eq(paypalPayments.id, payment.id))
    .limit(1);
  if (existing) return existing.status;

  let note = await reviewReason(payment);
  const counted = await monthAlreadyCounted(payment);
  if (note === null && !counted && payment.organizationId && payment.product) {
    const change = PRODUCTS[payment.product].change;
    try {
      const result = await applyAdminBillingAction({
        requestId: `${source.toLowerCase()}:${payment.id}`,
        organizationId: payment.organizationId,
        adminEmail: source,
        change,
      });
      if (result.applied) {
        await notifyPlanChange(payment.organizationId, change).catch(
          (error: unknown) =>
            console.error("[billing] plan change email failed", { error }),
        );
      }
    } catch (error) {
      // A refused change (e.g. Pro on a Lifetime account) is the admin's
      // call; anything else is retried.
      if (!(error instanceof AppError && error.code === "VALIDATION_ERROR")) {
        throw error;
      }
      note = `Paid, but the plan was not changed: ${error.message}`;
    }
  }

  const status = note === null ? "applied" : "needs_review";
  await db
    .insert(paypalPayments)
    .values({
      id: payment.id,
      organizationId: payment.organizationId,
      product: payment.product,
      status,
      amount: payment.amount,
      currency: payment.currency,
      payerEmail: payment.payerEmail,
      note,
      createdAt: new Date().toISOString(),
    })
    .onConflictDoNothing();
  console.info("[billing] payment recorded", {
    source,
    id: payment.id,
    organizationId: payment.organizationId,
    product: payment.product,
    status,
  });
  return status;
}

/**
 * A Pro month recorded for the account after PayPal took this charge already
 * covers it: by hand, or by the webhook and the 15-minute check reporting
 * the same charge under different PayPal ids. Counting it again would give a
 * second month for one payment.
 */
async function monthAlreadyCounted(payment: ReceivedPayment) {
  if (
    payment.product !== "pro_month" ||
    !payment.paidAt ||
    !payment.organizationId
  )
    return false;
  const [later] = await db
    .select({ id: billingAdminActions.id })
    .from(billingAdminActions)
    .where(
      and(
        eq(billingAdminActions.organizationId, payment.organizationId),
        eq(billingAdminActions.action, "pro_month"),
        gte(billingAdminActions.createdAt, payment.paidAt),
      ),
    )
    .limit(1);
  return Boolean(later);
}

async function reviewReason(payment: ReceivedPayment) {
  if (!payment.organizationId || !payment.product) {
    return (
      payment.unmatchedReason ??
      `${payment.source ?? "PayPal"} didn't say which account this payment is for.`
    );
  }
  const expected = PRODUCTS[payment.product].priceUsd;
  if (
    !payment.priceChecked &&
    (payment.currency !== "USD" || Number(payment.amount) !== expected)
  ) {
    return `Paid ${payment.amount} ${payment.currency}, but ${productName(payment.product)} costs $${expected}.`;
  }
  const [org] = await db
    .select({ id: organization.id })
    .from(organization)
    .where(eq(organization.id, payment.organizationId))
    .limit(1);
  return org ? null : "The account this payment was for no longer exists.";
}

/** Payments still waiting for the admin, newest first, with the account's
 *  name and owner when known. */
export async function listPaypalPaymentsToReview() {
  const rows = await db
    .select({
      id: paypalPayments.id,
      organizationId: paypalPayments.organizationId,
      organizationName: organization.name,
      product: paypalPayments.product,
      amount: paypalPayments.amount,
      currency: paypalPayments.currency,
      payerEmail: paypalPayments.payerEmail,
      note: paypalPayments.note,
      createdAt: paypalPayments.createdAt,
    })
    .from(paypalPayments)
    .leftJoin(organization, eq(organization.id, paypalPayments.organizationId))
    .where(
      and(
        eq(paypalPayments.status, "needs_review"),
        isNull(paypalPayments.handledAt),
      ),
    )
    .orderBy(desc(paypalPayments.createdAt))
    .limit(50);
  const orgIds = rows.flatMap((row) =>
    row.organizationId ? [row.organizationId] : [],
  );
  const owners =
    orgIds.length === 0
      ? []
      : await db
          .select({ organizationId: member.organizationId, email: user.email })
          .from(member)
          .innerJoin(user, eq(user.id, member.userId))
          .where(
            and(
              inArray(member.organizationId, orgIds),
              eq(member.role, "owner"),
            ),
          );
  return rows.map((row) => ({
    ...row,
    productName: row.product ? productName(row.product) : null,
    ownerEmail:
      owners.find((owner) => owner.organizationId === row.organizationId)
        ?.email ?? null,
  }));
}

export async function markPaypalPaymentHandled(id: string) {
  await db
    .update(paypalPayments)
    .set({ handledAt: new Date().toISOString() })
    .where(eq(paypalPayments.id, id));
}

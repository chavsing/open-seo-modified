import {
  AUTUMN_LIFETIME_PLAN_ID,
  AUTUMN_PRO_PLAN_ID,
  AUTUMN_PRO_YEARLY_PLAN_ID,
  autumnSeoDataCreditsToUsd,
  CREDIT_PACK_CREDITS,
  LIFETIME_CREDITS,
  LIFETIME_PRICE_USD,
  PAYPAL_LIFETIME_PAYMENT_URL,
  PAYPAL_PRO_YEARLY_PAYMENT_URL,
  PRO_MONTHLY_CREDITS,
  PRO_MONTHLY_PRICE_USD,
  PRO_YEARLY_PRICE_USD,
  PAYPAL_PRO_SUBSCRIBE_URL,
  type PaidPlanId,
} from "@/shared/billing";

// What the plan pages advertise before the customer holds the plan. Once
// they do, status and credits come from the billing ledger (see
// billing-account.ts) and only the name is read from here (getPlanName).
export type PlanOffer = {
  planId: PaidPlanId;
  name: string;
  priceUsd: number;
  /** "monthly" renews each month; "yearly" is one payment for 12 months;
   *  "once" is a single lifetime payment. */
  billing: "monthly" | "yearly" | "once";
  /** Credits the plan grants: each month, or once for a lifetime plan. */
  includedCreditsUsd: number;
  /** The client's PayPal link that sells this plan. */
  paymentUrl: string;
};

export const PRO_PLAN_OFFER: PlanOffer = {
  planId: AUTUMN_PRO_PLAN_ID,
  name: "Pro Plan",
  priceUsd: PRO_MONTHLY_PRICE_USD,
  billing: "monthly",
  includedCreditsUsd: autumnSeoDataCreditsToUsd(PRO_MONTHLY_CREDITS),
  paymentUrl: PAYPAL_PRO_SUBSCRIBE_URL,
};

export const PRO_YEARLY_PLAN_OFFER: PlanOffer = {
  planId: AUTUMN_PRO_YEARLY_PLAN_ID,
  name: "Pro Yearly",
  priceUsd: PRO_YEARLY_PRICE_USD,
  billing: "yearly",
  includedCreditsUsd: autumnSeoDataCreditsToUsd(PRO_MONTHLY_CREDITS),
  paymentUrl: PAYPAL_PRO_YEARLY_PAYMENT_URL,
};

export const LIFETIME_PLAN_OFFER: PlanOffer = {
  planId: AUTUMN_LIFETIME_PLAN_ID,
  name: "Lifetime Access",
  priceUsd: LIFETIME_PRICE_USD,
  billing: "once",
  includedCreditsUsd: autumnSeoDataCreditsToUsd(LIFETIME_CREDITS),
  paymentUrl: PAYPAL_LIFETIME_PAYMENT_URL,
};

export const CREDIT_PACK_LABEL = `Buy $${autumnSeoDataCreditsToUsd(CREDIT_PACK_CREDITS)} of credits`;

export const PLAN_OFFERS = [
  PRO_PLAN_OFFER,
  PRO_YEARLY_PLAN_OFFER,
  LIFETIME_PLAN_OFFER,
];

/** A plan's display name. Plans without an offer here (granted by hand)
 *  show their ID, which is also their name in Autumn. */
export function getPlanName(planId: string) {
  return PLAN_OFFERS.find((offer) => offer.planId === planId)?.name ?? planId;
}

/** "$197/month", "$1,997/year" or "$4,799 one-time". */
export function formatPlanPrice(offer: PlanOffer) {
  const price = `$${offer.priceUsd.toLocaleString("en-US")}`;
  if (offer.billing === "monthly") return `${price}/month`;
  if (offer.billing === "yearly") return `${price}/year`;
  return `${price} one-time`;
}

export function includedCreditsFeature(offer: PlanOffer) {
  const credits = `$${offer.includedCreditsUsd.toFixed(2)} of Usage Credits`;
  return offer.billing === "once"
    ? `Includes ${credits}`
    : `Includes ${credits} each month`;
}

import {
  AUTUMN_LIFETIME_PLAN_ID,
  AUTUMN_PRO_PLAN_ID,
  type CheckoutPlanId,
} from "@/shared/billing";

// What a checkout page advertises before the customer holds the plan. Once
// they do, status and credits come from the Autumn customer (see
// billing-account.ts) and only the name is read from here (getPlanName), so
// these only need to match the Autumn plans they sell.
export type PlanOffer = {
  planId: CheckoutPlanId;
  name: string;
  priceUsd: number;
  /** "monthly" renews each month; "once" is a single lifetime payment. */
  billing: "monthly" | "once";
  /** Credits the plan grants: each month, or once for a lifetime plan. */
  includedCreditsUsd: number;
};

export const PRO_PLAN_OFFER: PlanOffer = {
  planId: AUTUMN_PRO_PLAN_ID,
  name: "Pro Plan",
  priceUsd: 197,
  billing: "monthly",
  includedCreditsUsd: 50,
};

export const LIFETIME_PLAN_OFFER: PlanOffer = {
  planId: AUTUMN_LIFETIME_PLAN_ID,
  name: "Lifetime Access",
  priceUsd: 1499,
  billing: "once",
  includedCreditsUsd: 100,
};

export const PLAN_OFFERS = [PRO_PLAN_OFFER, LIFETIME_PLAN_OFFER];

/** A plan's display name. Plans without an offer here (granted by hand)
 *  show their ID, which is also their name in Autumn. */
export function getPlanName(planId: string) {
  return PLAN_OFFERS.find((offer) => offer.planId === planId)?.name ?? planId;
}

/** "$197/month" or "$1,499 one-time". */
export function formatPlanPrice(offer: PlanOffer) {
  const price = `$${offer.priceUsd.toLocaleString("en-US")}`;
  return offer.billing === "monthly" ? `${price}/month` : `${price} one-time`;
}

export function includedCreditsFeature(offer: PlanOffer) {
  const credits = `$${offer.includedCreditsUsd.toFixed(2)} of Usage Credits`;
  return offer.billing === "monthly"
    ? `Includes ${credits} each month`
    : `Includes ${credits}, then top up any time`;
}

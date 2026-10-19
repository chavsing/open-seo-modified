export const BILLING_ROUTE = "/billing";
export const SUBSCRIBE_ROUTE = "/subscribe";

// Billing page tabs. Here rather than in BillingTabs.tsx because the route's
// validateSearch reads them, and route options aren't code-split: importing
// the component would pull its chart into the entry chunk.
export const BILLING_TABS = [
  { value: "usage", label: "Usage" },
  { value: "invoices", label: "Invoices" },
] as const;
export type BillingTab = (typeof BILLING_TABS)[number]["value"];

export type PlanStatus = "free" | "paid";

export const AUTUMN_PRO_PLAN_ID = "pro-plan";
// One-off price in Autumn: paid once, never renews. Its included credits are
// a one-time grant, since one-off plan balances never reset.
export const AUTUMN_LIFETIME_PLAN_ID = "lifetime-plan";
/** The plans the app sells through checkout. */
export const CHECKOUT_PLAN_IDS = [
  AUTUMN_PRO_PLAN_ID,
  AUTUMN_LIFETIME_PLAN_ID,
] as const;
export type CheckoutPlanId = (typeof CHECKOUT_PLAN_IDS)[number];
export const AUTUMN_SEO_DATA_TOP_UP_PLAN_ID = "credit-top-up";
export const AUTUMN_PAID_PLAN_FEATURE_ID = "paid_plan";
// The shared usage-credit pool. Both DataForSEO and agent-LLM spend deduct
// from these (monthly usage_credits first, then rolled-over topup_credits).
export const AUTUMN_SEO_DATA_BALANCE_FEATURE_ID = "usage_credits";
export const AUTUMN_SEO_DATA_TOPUP_BALANCE_FEATURE_ID = "topup_credits";
export const AUTUMN_SEO_DATA_CREDITS_PER_USD = 1000;
// One-time credits every new org starts with ($1).
export const FREE_PLAN_CREDITS = 1000;
const SEO_DATA_COST_MARKUP = 1.28;
export const LOW_CREDITS_THRESHOLD_USD = 0.25;
// DataForSEO's raw price for one Google Ads search_volume live call (up to
// 1,000 keywords). Local keyword research adds one call to each search.
export const LOCAL_VOLUME_COST_USD = 0.09;

// Passed through to Stripe's checkout.sessions.create so checkout collects the
// legal business name, tax ID (EU VAT etc.), and full billing address — makes
// invoices valid for business customers. Display only, no Stripe Tax. Stripe
// requires customer_update.name "auto" to collect tax IDs for an existing customer.
export const AUTUMN_CHECKOUT_SESSION_PARAMS = {
  tax_id_collection: { enabled: true },
  billing_address_collection: "required",
  customer_update: { name: "auto", address: "auto" },
} as const;

export function roundUsdForBilling(value: number) {
  return Math.round(value * 100000) / 100000;
}

export function autumnSeoDataCreditsToUsd(credits: number) {
  return credits / AUTUMN_SEO_DATA_CREDITS_PER_USD;
}

/**
 * Convert a raw DataForSEO USD cost into the USD amount a hosted customer is
 * actually billed, applying the platform markup. Use this when displaying
 * cost estimates so the number matches what the user will be charged.
 *
 * Self-hosted deployments pay DataForSEO directly at the raw rate and should
 * show the raw number — gate at the call site with `isHostedClientAuthMode`.
 */
export function applyBillingMarkupUsd(rawUsd: number): number {
  return roundUsdForBilling(rawUsd * SEO_DATA_COST_MARKUP);
}

/**
 * Credits charged for one raw provider (DataForSEO) USD cost: marked-up,
 * rounded, then ceiled per call. This is the single charging formula, so a
 * pre-call estimate and the post-call deduction cannot drift apart.
 */
export function creditsForProviderUsd(rawUsd: number): number {
  return Math.ceil(
    applyBillingMarkupUsd(rawUsd) * AUTUMN_SEO_DATA_CREDITS_PER_USD,
  );
}

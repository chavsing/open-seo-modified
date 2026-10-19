export const BILLING_ROUTE = "/billing";
export const SUBSCRIBE_ROUTE = "/subscribe";

export type PlanStatus = "free" | "paid";

export const AUTUMN_PRO_PLAN_ID = "pro-plan";
// Paid once, never renews. Its included credits are a one-time grant.
export const AUTUMN_LIFETIME_PLAN_ID = "lifetime-plan";
/** The plans the app sells. */
export type PaidPlanId =
  | typeof AUTUMN_PRO_PLAN_ID
  | typeof AUTUMN_LIFETIME_PLAN_ID;

// The client's PayPal links. Pro is a PayPal Subscribe button, so PayPal
// charges it every month; Lifetime is a one-time payment link. PayPal does
// not tell the app who paid: the client activates each account from the
// admin page. Replace the placeholders with his real links before launch.
export const PAYPAL_PRO_SUBSCRIBE_URL =
  "https://www.paypal.com/PLACEHOLDER-pro-subscribe-link";
export const PAYPAL_LIFETIME_PAYMENT_URL =
  "https://www.paypal.com/PLACEHOLDER-lifetime-payment-link";
// Where a PayPal customer manages or cancels their automatic payments.
export const PAYPAL_AUTOPAY_URL = "https://www.paypal.com/myaccount/autopay/";
// The shared usage-credit pool. Both DataForSEO and agent-LLM spend deduct
// from these (monthly usage_credits first, then rolled-over topup_credits).
export const AUTUMN_SEO_DATA_BALANCE_FEATURE_ID = "usage_credits";
export const AUTUMN_SEO_DATA_TOPUP_BALANCE_FEATURE_ID = "topup_credits";
export const AUTUMN_SEO_DATA_CREDITS_PER_USD = 1000;
// One-time credits every new org starts with ($1).
export const FREE_PLAN_CREDITS = 1000;
// What each paid plan grants: Pro every month it is paid, Lifetime once.
export const PRO_MONTHLY_CREDITS = 50_000;
export const LIFETIME_CREDITS = 100_000;
const SEO_DATA_COST_MARKUP = 1.28;
export const LOW_CREDITS_THRESHOLD_USD = 0.25;
// DataForSEO's raw price for one Google Ads search_volume live call (up to
// 1,000 keywords). Local keyword research adds one call to each search.
export const LOCAL_VOLUME_COST_USD = 0.09;

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

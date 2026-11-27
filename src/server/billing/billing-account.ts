import {
  AUTUMN_LIFETIME_PLAN_ID,
  AUTUMN_PRO_PLAN_ID,
  AUTUMN_PRO_YEARLY_PLAN_ID,
  autumnSeoDataCreditsToUsd,
  type PlanStatus,
} from "@/shared/billing";
import {
  ensureBillingAccount,
  getBillingAccountRow,
  getCreditBalanceRows,
  recordReportedPaypalSubscription,
} from "@/server/billing/creditLedger";
import { z } from "zod";
import { requireOrgPermission } from "@/server/auth/org-gate";
import {
  getPaddleCheckoutConfig,
  paddleRequest,
  type PaddleConfig,
} from "@/server/billing/paddle";
import type { EnsuredUserContext } from "@/middleware/ensure-user/types";
import { hasPaidAccess } from "@/server/billing/plan-access";
import type { BillingCustomerContext } from "@/server/billing/subscription";
import { AppError } from "@/server/lib/errors";

/** The organization's plan and credits, as the billing screens show them. */
type BillingAccount = {
  planStatus: PlanStatus;
  /** The plan that grants paid access. Null on the free plan. */
  paidPlanId: string | null;
  /** What the plan grants: each month, or once for a one-time grant. */
  monthlyCreditsUsd: number;
  monthlyRemainingUsd: number;
  topUpRemainingUsd: number;
  hasManagedAccess: boolean;
  /** The paid plan was a one-time purchase (lifetime access): no renewals,
   *  nothing to cancel. */
  isLifetime: boolean;
  /** Pro paid once for 12 months: it ends unless paid again, and its
   *  credits refill each month on their own. */
  isYearly: boolean;
  /** When the paid period ends, in epoch ms. Null without one (Lifetime,
   *  free). */
  paidUntil: number | null;
  isPastDue: boolean;
  /** When the monthly credits refill, in epoch ms. Null for one-time
   *  credits and for a canceled plan, which ends instead of refilling. */
  monthlyRefillsAt: number | null;
  /** Receipt emails toggle. Off until the payment provider sends them. */
  invoiceEmailsEnabled: boolean;
  /** The PayPal subscription this org reported and the admin has not yet
   *  confirmed: the pages show it instead of another Subscribe button. */
  pendingPaypalSubscriptionId: string | null;
  /** Paddle checkout settings while the app sells through Paddle; null
   *  while it still sells through PayPal. */
  paddle: PaddleConfig | null;
  /** The paid Pro plan is a Paddle subscription: Paddle renews it, and the
   *  customer manages or cancels it in Paddle's billing portal. */
  isPaddleSubscription: boolean;
  /** The plan is canceled and ends at paidUntil instead of renewing. */
  isCanceled: boolean;
};

export async function getOrganizationBillingAccount(
  context: BillingCustomerContext,
): Promise<BillingAccount> {
  await ensureBillingAccount(context.organizationId);
  const [account, balances, paddle] = await Promise.all([
    getBillingAccountRow(context.organizationId),
    getCreditBalanceRows(context.organizationId),
    getPaddleCheckoutConfig(),
  ]);
  if (!account || !balances.monthly) {
    throw new AppError(
      "INTERNAL_ERROR",
      `Billing account missing for organization ${context.organizationId}`,
    );
  }

  const paid = hasPaidAccess(account);
  const { monthly, topup } = balances;
  return {
    planStatus: paid ? "paid" : "free",
    paidPlanId: paid ? account.planId : null,
    monthlyCreditsUsd: autumnSeoDataCreditsToUsd(monthly.granted),
    monthlyRemainingUsd: autumnSeoDataCreditsToUsd(monthly.remaining),
    topUpRemainingUsd: autumnSeoDataCreditsToUsd(topup?.remaining ?? 0),
    // Every hosted org gets the free plan, which grants the app itself.
    hasManagedAccess: true,
    isLifetime: paid && account.planId === AUTUMN_LIFETIME_PLAN_ID,
    isYearly: paid && account.planId === AUTUMN_PRO_YEARLY_PLAN_ID,
    paidUntil:
      paid && account.currentPeriodEnd
        ? Date.parse(account.currentPeriodEnd)
        : null,
    isPastDue: account.planStatus === "past_due",
    monthlyRefillsAt:
      account.planStatus === "canceled" || !monthly.nextResetAt
        ? null
        : Date.parse(monthly.nextResetAt),
    invoiceEmailsEnabled: false,
    pendingPaypalSubscriptionId: account.paypalSubscriptionReportedAt
      ? account.paypalSubscriptionId
      : null,
    paddle,
    isPaddleSubscription: paid && isPaddleSubscription(account),
    isCanceled: paid && account.planStatus === "canceled",
  };
}

// Only a Pro plan is paid by subscription; Lifetime keeps any old link
// harmlessly.
function isPaddleSubscription(
  account: NonNullable<Awaited<ReturnType<typeof getBillingAccountRow>>>,
) {
  return (
    account.paddleSubscriptionId !== null &&
    account.paddleCustomerId !== null &&
    (account.planId === AUTUMN_PRO_PLAN_ID ||
      account.planId === AUTUMN_PRO_YEARLY_PLAN_ID)
  );
}

const portalSessionSchema = z.object({
  data: z.object({
    urls: z.object({
      general: z.object({ overview: z.string().url() }),
    }),
  }),
});

/**
 * A one-time link to Paddle's billing portal for the owner's subscription,
 * where they update their card, download invoices or cancel.
 */
export async function createPaddlePortalLink(
  context: Pick<EnsuredUserContext, "organizationId" | "role">,
) {
  requireOrgPermission(context, { billing: ["manage"] });
  const account = await getBillingAccountRow(context.organizationId);
  if (!account || !isPaddleSubscription(account)) {
    throw new AppError("NOT_FOUND", "No Paddle subscription on this account");
  }
  const response = await paddleRequest(
    `/customers/${encodeURIComponent(account.paddleCustomerId ?? "")}/portal-sessions`,
    {
      method: "POST",
      body: JSON.stringify({
        subscription_ids: [account.paddleSubscriptionId],
      }),
    },
  );
  const session = portalSessionSchema.safeParse(response?.body);
  if (!response?.ok || !session.success) {
    console.error("[paddle] portal session failed", {
      status: response?.status ?? "no API key",
    });
    throw new AppError(
      "UPSTREAM_UNAVAILABLE",
      "Paddle's billing portal isn't available right now. Please try again, or email support.",
    );
  }
  return session.data.data.urls.general.overview;
}

/**
 * Saves the PayPal subscription the owner's browser reported after approving
 * the Pro button, so the admin page can list it for confirmation. The browser
 * could report anything, so this never changes the plan by itself.
 */
export async function reportPaypalSubscription(
  context: Pick<EnsuredUserContext, "organizationId" | "role">,
  subscriptionId: string,
) {
  requireOrgPermission(context, { billing: ["manage"] });
  await recordReportedPaypalSubscription({
    organizationId: context.organizationId,
    subscriptionId,
    reportedAt: new Date().toISOString(),
  });
}

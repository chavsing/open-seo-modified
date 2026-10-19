import {
  AUTUMN_LIFETIME_PLAN_ID,
  autumnSeoDataCreditsToUsd,
  type PlanStatus,
} from "@/shared/billing";
import {
  ensureBillingAccount,
  getBillingAccountRow,
  getCreditBalanceRows,
} from "@/server/billing/creditLedger";
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
  isPastDue: boolean;
  /** When the monthly credits refill, in epoch ms. Null for one-time
   *  credits and for a canceled plan, which ends instead of refilling. */
  monthlyRefillsAt: number | null;
  /** Receipt emails toggle. Off until the payment provider sends them. */
  invoiceEmailsEnabled: boolean;
};

export async function getOrganizationBillingAccount(
  context: BillingCustomerContext,
): Promise<BillingAccount> {
  await ensureBillingAccount(context.organizationId);
  const [account, balances] = await Promise.all([
    getBillingAccountRow(context.organizationId),
    getCreditBalanceRows(context.organizationId),
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
    isPastDue: account.planStatus === "past_due",
    monthlyRefillsAt:
      account.planStatus === "canceled" || !monthly.nextResetAt
        ? null
        : Date.parse(monthly.nextResetAt),
    invoiceEmailsEnabled: false,
  };
}

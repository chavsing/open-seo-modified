/* eslint-disable max-lines -- the org billing seam: customer lookup, credit gates, and credit holds with their settlement */
import { env } from "cloudflare:workers";
import type { EnsuredUserContext } from "@/middleware/ensure-user/types";
import {
  AUTUMN_SEO_DATA_BALANCE_FEATURE_ID,
  AUTUMN_SEO_DATA_TOPUP_BALANCE_FEATURE_ID,
  applyBillingMarkupUsd,
  creditsForProviderUsd,
} from "@/shared/billing";
import type { CreditFeature } from "@/shared/billing-credit-features";
import {
  deductCredits,
  ensureBillingAccount,
  getBillingAccountRow,
  getCreditBalanceRows,
  placeCreditHold,
  settleCreditHold,
} from "@/server/billing/creditLedger";
import { hasPaidAccess } from "@/server/billing/plan-access";
import { captureServerEvent } from "@/server/lib/posthog";
import { AppError } from "@/server/lib/errors";

export type BillingCustomerContext = Pick<
  EnsuredUserContext,
  "organizationId" | "userEmail" | "userId"
> & {
  projectId?: string;
};

// The billing customer is the org: its id is the org id. Ensuring it creates
// the free plan and credits once. Existence is monotonic, so a confirmed
// ensure is cached in KV to keep hot paths from writing on every request.
// Long TTL is safe: only confirmed existence is cached, never absence.
const CUSTOMER_ENSURED_TTL_SECONDS = 24 * 60 * 60;
const customerEnsuredKey = (organizationId: string) =>
  `billing:account-ensured:${organizationId}`;

export async function getOrCreateOrganizationCustomer(
  context: BillingCustomerContext,
): Promise<{ id: string }> {
  const cacheKey = customerEnsuredKey(context.organizationId);
  try {
    if (await env.KV.get(cacheKey)) {
      return { id: context.organizationId };
    }
  } catch (error) {
    console.warn("billing.customer-cache-read failed:", error);
  }

  await ensureBillingAccount(context.organizationId);

  try {
    await env.KV.put(cacheKey, "1", {
      expirationTtl: CUSTOMER_ENSURED_TTL_SECONDS,
    });
  } catch (error) {
    console.warn("billing.customer-cache-write failed:", error);
  }

  return { id: context.organizationId };
}

export async function customerHasPaidPlan(customerId: string) {
  return hasPaidAccess(await getBillingAccountRow(customerId));
}

// Remaining shared usage credits: the monthly `usage_credits` balance plus the
// rolled-over `topup_credits` balance. Both DataForSEO and LLM spend draw from
// these. Either can read negative after admitted research overdraws.
export async function getUsageCreditsRemaining(customerId: string): Promise<{
  monthlyRemaining: number;
  topupRemaining: number;
}> {
  let balances = await getCreditBalanceRows(customerId);
  // An org billing has never touched yet: give it its free plan first.
  if (!balances.monthly) {
    await ensureBillingAccount(customerId);
    balances = await getCreditBalanceRows(customerId);
  }
  if (!balances.monthly) {
    throw new AppError(
      "INTERNAL_ERROR",
      `No ${AUTUMN_SEO_DATA_BALANCE_FEATURE_ID} balance for customer ${customerId}`,
    );
  }
  return {
    monthlyRemaining: balances.monthly.remaining,
    topupRemaining: balances.topup?.remaining ?? 0,
  };
}

/**
 * Depletion check for the chat-agent gates. Confirmed refusals emit a PostHog
 * event (paywall analytics: refusals used to be invisible everywhere).
 */
export async function checkUsageCreditsDepleted(
  customer: BillingCustomerContext,
): Promise<{ depleted: boolean; monthlyRemaining: number }> {
  const balances = await getUsageCreditsRemaining(customer.organizationId);
  if (balances.monthlyRemaining + balances.topupRemaining > 0) {
    return { depleted: false, monthlyRemaining: balances.monthlyRemaining };
  }

  await captureServerEvent({
    distinctId: customer.userId,
    event: "usage:credits_gate_refused",
    organizationId: customer.organizationId,
    properties: {
      project_id: customer.projectId,
      monthly_remaining: balances.monthlyRemaining,
      topup_remaining: balances.topupRemaining,
    },
  });
  return { depleted: true, monthlyRemaining: balances.monthlyRemaining };
}

// A hold outlives the provider call it covers; an orphaned hold (isolate
// death between hold and settle) is released at this TTL with no deduction.
const HOLD_TTL_MS = 30 * 60_000;

export type UsageCreditFeatureId =
  | typeof AUTUMN_SEO_DATA_BALANCE_FEATURE_ID
  | typeof AUTUMN_SEO_DATA_TOPUP_BALANCE_FEATURE_ID;

export type UsageCreditHold = {
  lockId: string;
  featureId: UsageCreditFeatureId;
  estimatedCredits: number;
  /** Indexes of the reserved provider calls this hold covers. */
  callIndexes: readonly number[];
};

/**
 * Atomically holds `credits` on one balance pool: the ledger refuses the hold
 * (allowed: false) when the pool is short, so concurrent calls cannot all
 * pass on the same reading the way a plain balance check lets them. `balance`
 * is the pool's reading after the attempt, used to fit a smaller batch.
 */
export async function holdCredits(args: {
  customerId: string;
  featureId: UsageCreditFeatureId;
  estimatedCredits: number;
  callIndexes: readonly number[];
  properties: Record<string, unknown>;
  // A site audit's rendering hold must outlive the whole crawl, not one call.
  ttlMs?: number;
  lockPrefix?: string;
}) {
  const {
    customerId,
    featureId,
    estimatedCredits,
    callIndexes,
    ttlMs = HOLD_TTL_MS,
    lockPrefix = "dfs",
  } = args;
  const lockId = `${lockPrefix}_${customerId}_${crypto.randomUUID()}`;
  const hold: UsageCreditHold = {
    lockId,
    featureId,
    estimatedCredits,
    callIndexes,
  };
  const { allowed, remaining } = await placeCreditHold({
    holdId: lockId,
    organizationId: customerId,
    pool: featureId,
    credits: estimatedCredits,
    expiresAt: new Date(Date.now() + ttlMs).toISOString(),
  });
  return {
    hold,
    allowed,
    balance: remaining === null ? null : { remaining },
  };
}

/**
 * Reserves credits for a batch of provider calls before they are made, from
 * one estimate per call, and places each call where a hold of its own would
 * land: in order, on monthly `usage_credits` while they cover it, else on
 * `topup_credits`, else the call is refused. At most one hold per pool, so
 * the common case (monthly covers the batch) is a single hold.
 *
 * Throws INSUFFICIENT_CREDITS when no call fits; `refusedCalls` lists the
 * ones that did not when some did. Either way the refusal event is emitted.
 * The caller must settle every returned hold with `settleUsageCredits` once
 * its calls' real cost is known.
 */
export async function reserveUsageCredits(args: {
  customer: BillingCustomerContext;
  customerId: string;
  callCredits: number[];
  creditFeature?: CreditFeature;
}): Promise<{ holds: UsageCreditHold[]; refusedCalls: number[] }> {
  const callCredits = args.callCredits.map((credits) => Math.max(1, credits));
  const allCalls = callCredits.map((_, index) => index);
  const creditsFor = (calls: number[]) =>
    calls.reduce((sum, index) => sum + callCredits[index], 0);
  const properties = {
    creditFeature: args.creditFeature,
    provider: "dataforseo",
    estimatedCredits: creditsFor(allCalls),
  };
  // Holds `featureId` for the calls, in order, that fit `remaining`; null
  // when none does. A refusal here means the balance moved since the read.
  const holdFitting = async (
    featureId: UsageCreditFeatureId,
    calls: number[],
    remaining = Infinity,
  ) => {
    const fitting: number[] = [];
    let credits = 0;
    for (const index of calls) {
      if (credits + callCredits[index] > remaining) continue;
      fitting.push(index);
      credits += callCredits[index];
    }
    if (fitting.length === 0) return null;
    return holdCredits({
      customerId: args.customerId,
      featureId,
      estimatedCredits: credits,
      callIndexes: fitting,
      properties,
    });
  };

  const holds: UsageCreditHold[] = [];
  let monthlyRemaining = 0;
  let topupRemaining = 0;
  let refusedCalls: number[] = [];
  try {
    const monthly = await holdFitting(
      AUTUMN_SEO_DATA_BALANCE_FEATURE_ID,
      allCalls,
    );
    if (monthly?.allowed) return { holds: [monthly.hold], refusedCalls };
    monthlyRemaining = monthly?.balance?.remaining ?? 0;

    const partial = await holdFitting(
      AUTUMN_SEO_DATA_BALANCE_FEATURE_ID,
      allCalls,
      monthlyRemaining,
    );
    if (partial?.allowed) holds.push(partial.hold);
    const topupCalls = allCalls.filter(
      (index) => !holds.some((hold) => hold.callIndexes.includes(index)),
    );

    let topup = await holdFitting(
      AUTUMN_SEO_DATA_TOPUP_BALANCE_FEATURE_ID,
      topupCalls,
    );
    if (topup && !topup.allowed) {
      topupRemaining = topup.balance?.remaining ?? 0;
      topup = await holdFitting(
        AUTUMN_SEO_DATA_TOPUP_BALANCE_FEATURE_ID,
        topupCalls,
        topupRemaining,
      );
    }
    if (topup?.allowed) holds.push(topup.hold);
    refusedCalls = allCalls.filter(
      (index) => !holds.some((hold) => hold.callIndexes.includes(index)),
    );
  } catch (error) {
    // A later hold failed after earlier ones landed: release those rather
    // than strand their credits until the hold TTL.
    for (const hold of holds) {
      await settleUsageCredits({ customer: args.customer, hold, costs: [] });
    }
    throw error;
  }

  if (refusedCalls.length > 0) {
    await captureServerEvent({
      distinctId: args.customer.userId,
      event: "usage:credits_gate_refused",
      organizationId: args.customer.organizationId,
      properties: {
        project_id: args.customer.projectId,
        reason: "estimate_exceeds_balance",
        source: "dataforseo",
        credit_feature: args.creditFeature,
        estimated_credits: creditsFor(refusedCalls),
        monthly_remaining: monthlyRemaining,
        topup_remaining: topupRemaining,
      },
    });
  }
  if (holds.length === 0) throw new AppError("INSUFFICIENT_CREDITS");
  return { holds, refusedCalls };
}

// lockIds are `${prefix}_${customerId}_${uuid}`; the uuid has no underscores.
function holdOrganizationId(hold: UsageCreditHold) {
  const withoutPrefix = hold.lockId.slice(hold.lockId.indexOf("_") + 1);
  return withoutPrefix.slice(0, withoutPrefix.lastIndexOf("_"));
}

/**
 * Charges `credits` against a hold (above or below what was held) and
 * returns the rest, or releases the hold when `credits` is 0. `landed: false`
 * means the charge was not applied: the hold was already gone (released at
 * its TTL, or settled before), or the write failed.
 */
export async function finalizeHold(
  hold: UsageCreditHold,
  credits: number,
  properties: Record<string, unknown>,
): Promise<{ landed: boolean; error?: unknown }> {
  try {
    return await settleCreditHold({
      holdId: hold.lockId,
      organizationId: holdOrganizationId(hold),
      pool: hold.featureId,
      credits,
      details: {
        creditFeature:
          typeof properties.creditFeature === "string"
            ? properties.creditFeature
            : null,
        paths: Array.isArray(properties.paths)
          ? properties.paths.filter((p): p is string => typeof p === "string")
          : undefined,
      },
    });
  } catch (error) {
    return { landed: false, error };
  }
}

/**
 * Settles a hold on the provider's real cost: charges the actual credits
 * (above or below the hold, returning the rest) or releases the hold when
 * nothing was billed. A hold can cover several provider calls; each is
 * credited separately, so a batch is charged exactly what the same calls
 * would cost one by one. Never throws: the customer already has the data, so
 * a settle that fails is logged with everything needed to reconcile it and
 * the hold is released at its TTL.
 */
export async function settleUsageCredits(args: {
  customer: BillingCustomerContext;
  hold: UsageCreditHold;
  /** Resolved from the billed path by the caller; unknown for an unbilled call. */
  creditFeature?: CreditFeature;
  /** Billed provider calls under this hold; empty when none was charged. */
  costs: Array<{ costUsd: number; path: string[] }>;
}): Promise<void> {
  const { customer, hold, creditFeature, costs } = args;
  let actualCredits = 0;
  let totalCostUsd = 0;
  for (const cost of costs) {
    actualCredits += creditsForProviderUsd(cost.costUsd);
    totalCostUsd += applyBillingMarkupUsd(cost.costUsd);
  }
  const paths = [...new Set(costs.map((cost) => cost.path.join("/")))];

  const { landed, error } = await finalizeHold(hold, actualCredits, {
    creditFeature,
    provider: "dataforseo",
    paths,
    totalCostUsd,
    estimatedCredits: hold.estimatedCredits,
  });
  if (!landed) {
    console.error("[billing] finalize failed", {
      organizationId: customer.organizationId,
      lockId: hold.lockId,
      held: hold.estimatedCredits,
      actual: actualCredits,
      error,
    });
    return;
  }
  if (actualCredits <= 0) return;

  const onMonthly = hold.featureId === AUTUMN_SEO_DATA_BALANCE_FEATURE_ID;
  await captureCreditsConsumed(customer, {
    credit_feature: creditFeature,
    monthly_credits: onMonthly ? actualCredits : 0,
    topup_credits: onMonthly ? 0 : actualCredits,
    total_credits: actualCredits,
    cost_usd: totalCostUsd,
    estimated_credits: hold.estimatedCredits,
    paths,
  });

  // The estimate is meant to be an upper bound; an undershoot means a price
  // constant in pricing.ts is stale and the spend bound has a hole.
  if (actualCredits > hold.estimatedCredits) {
    console.error("[billing] estimate undershoot", {
      paths,
      estimated: hold.estimatedCredits,
      actual: actualCredits,
    });
  }
}

function captureCreditsConsumed(
  customer: BillingCustomerContext,
  properties: Record<string, unknown>,
) {
  return captureServerEvent({
    distinctId: customer.userId,
    event: "usage:credits_consume",
    organizationId: customer.organizationId,
    properties: { project_id: customer.projectId, ...properties },
  });
}

/**
 * Deducts a USD provider cost from the org's shared usage-credit pool after
 * the fact: applies the platform markup, converts to credits, spends monthly
 * `usage_credits` first then `topup_credits`, and emits the
 * usage:credits_consume event. LLM research uses this (token cost is
 * unknowable up front); DataForSEO calls reserve-then-settle instead. Pass
 * `monthlyRemaining` from the balance check that gated the call.
 */
export async function trackUsageCreditSpend(args: {
  customer: BillingCustomerContext;
  customerId: string;
  creditFeature: CreditFeature;
  costUsd: number;
  monthlyRemaining: number;
  /**
   * Admitted research spends available top-ups, then overdraws monthly credits.
   * Every hosted org has a monthly balance; a top-up balance may not exist yet.
   */
  overdraft?: { topupRemaining: number };
  properties?: Record<string, unknown>;
}): Promise<{ monthlyCredits: number; topupCredits: number }> {
  const totalCostUsd = applyBillingMarkupUsd(args.costUsd);
  const totalCostCredits = creditsForProviderUsd(args.costUsd);
  if (totalCostCredits <= 0) return { monthlyCredits: 0, topupCredits: 0 };

  // Clamp at 0: balances can read negative after an overdraft, and a
  // negative monthly reading here would inflate the topup deduction.
  let monthlyDeduct = Math.min(
    Math.max(args.monthlyRemaining, 0),
    totalCostCredits,
  );
  let topupDeduct = totalCostCredits - monthlyDeduct;
  if (args.overdraft) {
    topupDeduct = Math.min(
      topupDeduct,
      Math.max(args.overdraft.topupRemaining, 0),
    );
    monthlyDeduct = totalCostCredits - topupDeduct;
  }

  for (const [pool, credits] of [
    [AUTUMN_SEO_DATA_BALANCE_FEATURE_ID, monthlyDeduct],
    [AUTUMN_SEO_DATA_TOPUP_BALANCE_FEATURE_ID, topupDeduct],
  ] as const) {
    if (credits <= 0) continue;
    await deductCredits({
      organizationId: args.customerId,
      pool,
      credits,
      // Research explicitly permits debt; otherwise a pool stops at zero.
      allowNegative: Boolean(args.overdraft),
      details: { creditFeature: args.creditFeature },
    });
  }

  await captureCreditsConsumed(args.customer, {
    credit_feature: args.creditFeature,
    monthly_credits: monthlyDeduct,
    topup_credits: topupDeduct,
    total_credits: totalCostCredits,
    cost_usd: totalCostUsd,
  });
  return { monthlyCredits: monthlyDeduct, topupCredits: topupDeduct };
}

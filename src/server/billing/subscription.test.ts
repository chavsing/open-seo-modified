import { beforeEach, describe, expect, it, vi } from "vitest";
import { creditEvents } from "@/db/schema";
import {
  AUTUMN_SEO_DATA_BALANCE_FEATURE_ID,
  AUTUMN_SEO_DATA_TOPUP_BALANCE_FEATURE_ID,
  FREE_PLAN_CREDITS,
} from "@/shared/billing";

const { testDb, kv } = await vi.hoisted(async () => {
  const { createAiVisibilityTestDb } =
    await import("@/server/features/ai-visibility/aiVisibilityTestDb");
  return {
    testDb: await createAiVisibilityTestDb(),
    kv: { get: vi.fn(), put: vi.fn() },
  };
});
vi.mock("cloudflare:workers", () => ({
  env: { DATABASE_PROVIDER: "d1", KV: kv },
}));
vi.mock("@/db", () => ({ db: testDb.db }));
vi.mock("@/db/runBatch", () => ({ runBatch: testDb.runBatch }));
vi.mock("@/server/lib/posthog", () => ({ captureServerEvent: vi.fn() }));

import { captureServerEvent } from "@/server/lib/posthog";
import { releaseExpiredCreditHolds } from "./creditLedger";
import {
  customerHasPaidPlan,
  getOrCreateOrganizationCustomer,
  getUsageCreditsRemaining,
  holdCredits,
  reserveUsageCredits,
  settleUsageCredits,
  trackUsageCreditSpend,
} from "./subscription";

// The harness seeds organization "organization".
const ORG = "organization";
const customer = {
  organizationId: ORG,
  userId: "user",
  userEmail: "owner@example.com",
};

async function setBalances(monthly: number, topup: number) {
  await getOrCreateOrganizationCustomer(customer);
  await testDb.client.executeMultiple(`
    UPDATE credit_balances SET remaining = ${monthly} WHERE pool = '${AUTUMN_SEO_DATA_BALANCE_FEATURE_ID}';
    UPDATE credit_balances SET remaining = ${topup} WHERE pool = '${AUTUMN_SEO_DATA_TOPUP_BALANCE_FEATURE_ID}';
  `);
}

// creditsForProviderUsd applies the 1.28 markup: $0.1 of provider cost is
// 128 credits.
const COST_USD = 0.1;
const COST_CREDITS = 128;

beforeEach(async () => {
  await testDb.client.executeMultiple(`
    DELETE FROM credit_events;
    DELETE FROM credit_holds;
    DELETE FROM credit_balances;
    DELETE FROM billing_accounts;
  `);
  await testDb.seedProject();
  kv.get.mockResolvedValue(null);
});

describe("billing account", () => {
  it("gives a new org the free plan and its credits once", async () => {
    await getOrCreateOrganizationCustomer(customer);
    expect(await getUsageCreditsRemaining(ORG)).toEqual({
      monthlyRemaining: FREE_PLAN_CREDITS,
      topupRemaining: 0,
    });

    await setBalances(200, 0);
    await getOrCreateOrganizationCustomer(customer);
    expect((await getUsageCreditsRemaining(ORG)).monthlyRemaining).toBe(200);
    expect(await customerHasPaidPlan(ORG)).toBe(false);
  });

  it.each([
    { plan: "pro-plan", status: "active", periodEnd: null, paid: true },
    { plan: "pro-plan", status: "past_due", periodEnd: null, paid: true },
    {
      plan: "pro-plan",
      status: "canceled",
      periodEnd: "2999-01-01",
      paid: true,
    },
    {
      plan: "pro-plan",
      status: "canceled",
      periodEnd: "2000-01-01",
      paid: false,
    },
    { plan: "lifetime-plan", status: "active", periodEnd: null, paid: true },
  ])(
    "$plan $status (period end $periodEnd) has paid access: $paid",
    async ({ plan, status, periodEnd, paid }) => {
      await getOrCreateOrganizationCustomer(customer);
      await testDb.client.execute({
        sql: "UPDATE billing_accounts SET plan_id = ?, plan_status = ?, current_period_end = ?",
        args: [plan, status, periodEnd],
      });
      expect(await customerHasPaidPlan(ORG)).toBe(paid);
    },
  );
});

describe("credit holds", () => {
  it("never lets concurrent holds spend the same credits", async () => {
    await setBalances(1000, 0);
    const hold = () =>
      holdCredits({
        customerId: ORG,
        featureId: AUTUMN_SEO_DATA_BALANCE_FEATURE_ID,
        estimatedCredits: 700,
        callIndexes: [0],
        properties: {},
      });

    const results = await Promise.all([hold(), hold()]);

    expect(results.filter((r) => r.allowed)).toHaveLength(1);
    expect((await getUsageCreditsRemaining(ORG)).monthlyRemaining).toBe(300);
  });

  it("places each call where its own hold would land: monthly first, else top-up, else refused", async () => {
    await setBalances(600, 500);

    const { holds, refusedCalls } = await reserveUsageCredits({
      customer,
      customerId: ORG,
      callCredits: [400, 300, 300, 400],
    });

    expect(holds.map((h) => [h.featureId, h.callIndexes])).toEqual([
      [AUTUMN_SEO_DATA_BALANCE_FEATURE_ID, [0]],
      [AUTUMN_SEO_DATA_TOPUP_BALANCE_FEATURE_ID, [1]],
    ]);
    expect(refusedCalls).toEqual([2, 3]);
    expect(await getUsageCreditsRemaining(ORG)).toEqual({
      monthlyRemaining: 200,
      topupRemaining: 200,
    });
  });

  it("refuses when neither pool covers the estimate and reports it", async () => {
    await setBalances(0, 0);

    await expect(
      reserveUsageCredits({ customer, customerId: ORG, callCredits: [100] }),
    ).rejects.toMatchObject({ code: "INSUFFICIENT_CREDITS" });
    expect(captureServerEvent).toHaveBeenCalledWith(
      expect.objectContaining({ event: "usage:credits_gate_refused" }),
    );
  });

  it("charges the real cost, returns the rest of the hold, and logs the charge", async () => {
    await setBalances(1000, 0);
    const { holds } = await reserveUsageCredits({
      customer,
      customerId: ORG,
      callCredits: [500],
    });

    await settleUsageCredits({
      customer,
      hold: holds[0],
      creditFeature: "keyword_research",
      costs: [{ costUsd: COST_USD, path: ["v3", "keywords"] }],
    });

    expect((await getUsageCreditsRemaining(ORG)).monthlyRemaining).toBe(
      1000 - COST_CREDITS,
    );
    expect(await testDb.db.select().from(creditEvents)).toMatchObject([
      {
        credits: COST_CREDITS,
        creditFeature: "keyword_research",
        paths: JSON.stringify(["v3/keywords"]),
      },
    ]);
  });

  it("returns the whole hold when nothing was billed", async () => {
    await setBalances(1000, 0);
    const { holds } = await reserveUsageCredits({
      customer,
      customerId: ORG,
      callCredits: [500],
    });

    await settleUsageCredits({ customer, hold: holds[0], costs: [] });

    expect((await getUsageCreditsRemaining(ORG)).monthlyRemaining).toBe(1000);
    expect(await testDb.db.select().from(creditEvents)).toEqual([]);
  });

  it("returns an abandoned hold's credits once it expires, and only then", async () => {
    await setBalances(1000, 0);
    await reserveUsageCredits({
      customer,
      customerId: ORG,
      callCredits: [500],
    });

    expect(await releaseExpiredCreditHolds(new Date())).toBe(0);
    expect((await getUsageCreditsRemaining(ORG)).monthlyRemaining).toBe(500);

    const afterTtl = new Date(Date.now() + 31 * 60_000);
    expect(await releaseExpiredCreditHolds(afterTtl)).toBe(1);
    expect((await getUsageCreditsRemaining(ORG)).monthlyRemaining).toBe(1000);
  });

  it("does not charge a hold that was already released", async () => {
    vi.spyOn(console, "error").mockImplementation(() => {});
    await setBalances(1000, 0);
    const { holds } = await reserveUsageCredits({
      customer,
      customerId: ORG,
      callCredits: [500],
    });
    await releaseExpiredCreditHolds(new Date(Date.now() + 31 * 60_000));

    await settleUsageCredits({
      customer,
      hold: holds[0],
      costs: [{ costUsd: COST_USD, path: ["v3", "keywords"] }],
    });

    expect((await getUsageCreditsRemaining(ORG)).monthlyRemaining).toBe(1000);
    expect(console.error).toHaveBeenCalledWith(
      "[billing] finalize failed",
      expect.objectContaining({ actual: COST_CREDITS }),
    );
  });
});

describe("trackUsageCreditSpend", () => {
  const spend = (overdraft?: { topupRemaining: number }) =>
    trackUsageCreditSpend({
      customer,
      customerId: ORG,
      creditFeature: "agent",
      costUsd: COST_USD,
      monthlyRemaining: 100,
      overdraft,
    });

  it("spends monthly credits first, then top-ups, and stops at zero", async () => {
    await setBalances(100, 0);

    await spend();

    expect(await getUsageCreditsRemaining(ORG)).toEqual({
      monthlyRemaining: 0,
      topupRemaining: 0,
    });
  });

  it("lets admitted research overdraw the monthly pool", async () => {
    await setBalances(100, 0);

    await spend({ topupRemaining: 0 });

    expect((await getUsageCreditsRemaining(ORG)).monthlyRemaining).toBe(
      100 - COST_CREDITS,
    );
  });
});

import { beforeEach, describe, expect, it, vi } from "vitest";
import { FREE_PLAN_CREDITS } from "@/shared/billing";

const { testDb } = await vi.hoisted(async () => {
  const { createAiVisibilityTestDb } =
    await import("@/server/features/ai-visibility/aiVisibilityTestDb");
  return { testDb: await createAiVisibilityTestDb() };
});
vi.mock("cloudflare:workers", () => ({ env: { DATABASE_PROVIDER: "d1" } }));
vi.mock("@/db", () => ({ db: testDb.db }));
vi.mock("@/db/runBatch", () => ({ runBatch: testDb.runBatch }));

import { getOrganizationBillingAccount } from "./billing-account";

// The harness seeds organization "organization".
const context = {
  organizationId: "organization",
  userEmail: "owner@example.com",
  userId: "user_1",
};

async function setPlan(args: {
  planId: string;
  planStatus: string;
  currentPeriodEnd?: string;
  monthlyGranted: number;
  nextResetAt?: string;
}) {
  await getOrganizationBillingAccount(context);
  await testDb.client.batch([
    {
      sql: "UPDATE billing_accounts SET plan_id = ?, plan_status = ?, current_period_end = ?",
      args: [args.planId, args.planStatus, args.currentPeriodEnd ?? null],
    },
    {
      sql: "UPDATE credit_balances SET granted = ?, remaining = ?, next_reset_at = ? WHERE pool = 'usage_credits'",
      args: [
        args.monthlyGranted,
        args.monthlyGranted,
        args.nextResetAt ?? null,
      ],
    },
  ]);
}

beforeEach(async () => {
  await testDb.client.executeMultiple(`
    DELETE FROM credit_balances;
    DELETE FROM billing_accounts;
  `);
  await testDb.seedProject();
});

describe("getOrganizationBillingAccount", () => {
  it("starts a new org on the free plan with its free credits", async () => {
    await expect(getOrganizationBillingAccount(context)).resolves.toEqual({
      planStatus: "free",
      paidPlanId: null,
      monthlyCreditsUsd: FREE_PLAN_CREDITS / 1000,
      monthlyRemainingUsd: FREE_PLAN_CREDITS / 1000,
      topUpRemainingUsd: 0,
      hasManagedAccess: true,
      isLifetime: false,
      isPastDue: false,
      monthlyRefillsAt: null,
      invoiceEmailsEnabled: false,
    });
  });

  it("shows a Pro subscriber's monthly credits and refill date", async () => {
    await setPlan({
      planId: "pro-plan",
      planStatus: "active",
      monthlyGranted: 50_000,
      nextResetAt: "2030-01-01T00:00:00.000Z",
    });

    await expect(getOrganizationBillingAccount(context)).resolves.toMatchObject(
      {
        planStatus: "paid",
        paidPlanId: "pro-plan",
        monthlyCreditsUsd: 50,
        isLifetime: false,
        monthlyRefillsAt: Date.parse("2030-01-01T00:00:00.000Z"),
      },
    );
  });

  it("marks lifetime access, which never refills", async () => {
    await setPlan({
      planId: "lifetime-plan",
      planStatus: "active",
      monthlyGranted: 100_000,
    });

    await expect(getOrganizationBillingAccount(context)).resolves.toMatchObject(
      { planStatus: "paid", isLifetime: true, monthlyRefillsAt: null },
    );
  });

  it("gives no refill date for a canceled plan still in its paid period", async () => {
    await setPlan({
      planId: "pro-plan",
      planStatus: "canceled",
      currentPeriodEnd: "2999-01-01T00:00:00.000Z",
      monthlyGranted: 50_000,
      nextResetAt: "2030-01-01T00:00:00.000Z",
    });

    await expect(getOrganizationBillingAccount(context)).resolves.toMatchObject(
      { planStatus: "paid", monthlyRefillsAt: null },
    );
  });
});

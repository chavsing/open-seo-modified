import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { LIFETIME_CREDITS, PRO_MONTHLY_CREDITS } from "@/shared/billing";

const { testDb, adminEmails } = await vi.hoisted(async () => {
  const { createAiVisibilityTestDb } =
    await import("@/server/features/ai-visibility/aiVisibilityTestDb");
  return {
    testDb: await createAiVisibilityTestDb(),
    adminEmails: { value: "admin@example.com" },
  };
});
vi.mock("cloudflare:workers", () => ({ env: { DATABASE_PROVIDER: "d1" } }));
vi.mock("@/db", () => ({ db: testDb.db }));
vi.mock("@/db/runBatch", () => ({ runBatch: testDb.runBatch }));
vi.mock("@/server/lib/runtime-env", () => ({
  isHostedServerAuthMode: async () => true,
  getOptionalEnvValue: async (name: string) =>
    name === "ADMIN_EMAILS" ? adminEmails.value : undefined,
}));

import {
  applyBillingActionAsAdmin,
  listRenewalsDueAsAdmin,
  listWaitingAccountsAsAdmin,
  searchAccountsAsAdmin,
} from "./admin-billing";
import { reportPaypalSubscription } from "./billing-account";
import {
  expireLapsedPlanCredits,
  refillYearlyPlanCredits,
} from "./creditLedger";

// The harness seeds organization "organization"; this member is its owner.
const ORG = "organization";
const OWNER = "owner@example.com";
const ADMIN = "admin@example.com";

const apply = (
  change: Parameters<typeof applyBillingActionAsAdmin>[0]["change"],
  requestId: string = crypto.randomUUID(),
) =>
  applyBillingActionAsAdmin({
    adminEmail: ADMIN,
    requestId,
    organizationId: ORG,
    change,
  });

async function owner() {
  const [row] = await searchAccountsAsAdmin(ADMIN, OWNER);
  return row;
}

beforeEach(async () => {
  vi.spyOn(console, "info").mockImplementation(() => {});
  await testDb.client.executeMultiple(`
    DELETE FROM billing_admin_actions;
    DELETE FROM credit_balances;
    DELETE FROM billing_accounts;
  `);
  await testDb.seedProject();
  await testDb.client.executeMultiple(`
    DELETE FROM user WHERE id = 'owner';
    INSERT INTO user (id, name, email, email_verified, created_at, updated_at)
      VALUES ('owner', 'Owner', '${OWNER}', 1, 0, 0);
    INSERT INTO member (id, organization_id, user_id, role, created_at)
      VALUES ('owner-member', '${ORG}', 'owner', 'owner', 0);
  `);
});

afterEach(() => {
  vi.useRealTimers();
});

describe("admin billing", () => {
  it("refuses anyone not listed in ADMIN_EMAILS", async () => {
    await expect(searchAccountsAsAdmin(OWNER, OWNER)).rejects.toMatchObject({
      code: "FORBIDDEN",
    });
    await expect(
      applyBillingActionAsAdmin({
        adminEmail: OWNER,
        requestId: crypto.randomUUID(),
        organizationId: ORG,
        change: { action: "lifetime" },
      }),
    ).rejects.toMatchObject({ code: "FORBIDDEN" });
    expect((await owner()).planId).toBe("free");
  });

  it("lists the newest signups first when there is no search", async () => {
    await testDb.client.executeMultiple(`
      DELETE FROM user WHERE id = 'newer';
      INSERT INTO user (id, name, email, email_verified, created_at, updated_at)
        VALUES ('newer', 'Newer', 'newer@example.com', 1, 5000, 5000);
      INSERT INTO member (id, organization_id, user_id, role, created_at)
        VALUES ('newer-member', '${ORG}', 'newer', 'member', 5000);
    `);

    const rows = await searchAccountsAsAdmin(ADMIN, null);

    expect(rows.map((row) => row.email)).toEqual(["newer@example.com", OWNER]);
  });

  it("lists a reported PayPal subscription until the admin activates Pro", async () => {
    await reportPaypalSubscription(
      { organizationId: ORG, role: "owner" },
      "I-BW452GLLEP1G",
    );
    expect(await listWaitingAccountsAsAdmin(ADMIN)).toMatchObject([
      { email: OWNER, paypalSubscriptionId: "I-BW452GLLEP1G" },
    ]);

    await apply({ action: "pro_month" });

    expect(await listWaitingAccountsAsAdmin(ADMIN)).toEqual([]);
    expect(await owner()).toMatchObject({
      planId: "pro-plan",
      paypalSubscriptionId: "I-BW452GLLEP1G",
      paypalReportedAt: null,
    });
  });

  it("flags a subscription ID that two accounts reported", async () => {
    await testDb.client.executeMultiple(`
      DELETE FROM user WHERE id = 'other';
      INSERT INTO organization (id, name, slug, created_at)
        VALUES ('other-org', 'Other', 'other', 0);
      INSERT INTO user (id, name, email, email_verified, created_at, updated_at)
        VALUES ('other', 'Other', 'other@example.com', 1, 0, 0);
      INSERT INTO member (id, organization_id, user_id, role, created_at)
        VALUES ('other-member', 'other-org', 'other', 'owner', 0);
    `);
    await reportPaypalSubscription(
      { organizationId: ORG, role: "owner" },
      "I-BW452GLLEP1G",
    );
    expect((await owner()).paypalSubscriptionShared).toBe(false);

    await reportPaypalSubscription(
      { organizationId: "other-org", role: "owner" },
      "I-BW452GLLEP1G",
    );

    const waiting = await listWaitingAccountsAsAdmin(ADMIN);
    expect(waiting.map((a) => a.paypalSubscriptionShared)).toEqual([
      true,
      true,
    ]);
  });

  it("lists Pro for renewal from 3 days before its month ends until 30 days after", async () => {
    vi.useFakeTimers({
      toFake: ["Date"],
      now: new Date("2026-03-10T12:00:00Z"),
    });
    await apply({ action: "pro_month" }); // paid until 2026-04-10
    const due = async () =>
      (await listRenewalsDueAsAdmin(ADMIN)).map((a) => a.email);

    vi.setSystemTime(new Date("2026-04-05T12:00:00Z"));
    expect(await due()).toEqual([]);

    vi.setSystemTime(new Date("2026-04-08T12:00:00Z"));
    expect(await due()).toEqual([OWNER]);

    // In the grace days: still has access, still due.
    vi.setSystemTime(new Date("2026-04-11T12:00:00Z"));
    expect(await due()).toEqual([OWNER]);
    expect((await owner()).accessEndsAt).toBe("2026-04-13T12:00:00.000Z");

    vi.setSystemTime(new Date("2026-05-20T12:00:00Z"));
    expect(await due()).toEqual([]);
  });

  it("drops a customer from the renewal list once the month is recorded", async () => {
    vi.useFakeTimers({
      toFake: ["Date"],
      now: new Date("2026-03-10T12:00:00Z"),
    });
    await apply({ action: "pro_month" });
    vi.setSystemTime(new Date("2026-04-09T12:00:00Z"));
    expect(await listRenewalsDueAsAdmin(ADMIN)).toHaveLength(1);

    await apply({ action: "pro_month" });

    expect(await listRenewalsDueAsAdmin(ADMIN)).toEqual([]);
  });

  it("starts Pro for a month with its monthly credits", async () => {
    vi.useFakeTimers({
      toFake: ["Date"],
      now: new Date("2026-03-10T12:00:00Z"),
    });

    await apply({ action: "pro_month" });

    expect(await owner()).toMatchObject({
      planId: "pro-plan",
      hasPaidAccess: true,
      paidUntil: "2026-04-10T12:00:00.000Z",
      monthlyRemainingUsd: PRO_MONTHLY_CREDITS / 1000,
    });
  });

  it("refuses a Pro month or year that would replace Lifetime", async () => {
    await apply({ action: "lifetime" });

    await expect(apply({ action: "pro_month" })).rejects.toMatchObject({
      code: "VALIDATION_ERROR",
    });
    await expect(apply({ action: "pro_year" })).rejects.toMatchObject({
      code: "VALIDATION_ERROR",
    });
    expect((await owner()).planId).toBe("lifetime-plan");
  });

  it("empties a lapsed Pro month's credits after the grace days and keeps bought extras", async () => {
    vi.useFakeTimers({
      toFake: ["Date"],
      now: new Date("2026-03-10T12:00:00Z"),
    });
    await apply({ action: "pro_month" }); // paid until 2026-04-10
    await apply({ action: "add_credits", credits: 5000 });

    // Still in the grace days.
    expect(
      await expireLapsedPlanCredits(new Date("2026-04-12T12:00:00Z")),
    ).toBe(0);

    expect(
      await expireLapsedPlanCredits(new Date("2026-04-14T12:00:00Z")),
    ).toBe(1);
    expect(await owner()).toMatchObject({
      monthlyRemainingUsd: 0,
      extraRemainingUsd: 5,
    });
  });

  it("extends Pro from the end of the paid month, clamping to the month's last day", async () => {
    vi.useFakeTimers({
      toFake: ["Date"],
      now: new Date("2026-01-31T09:00:00Z"),
    });

    await apply({ action: "pro_month" });
    await apply({ action: "pro_month" });

    // Jan 31 -> Feb 28 -> Mar 28: the second month counts from Feb 28.
    expect((await owner()).paidUntil).toBe("2026-03-28T09:00:00.000Z");
  });

  it("never applies the same request twice", async () => {
    vi.useFakeTimers({
      toFake: ["Date"],
      now: new Date("2026-03-10T12:00:00Z"),
    });
    const requestId = crypto.randomUUID();

    expect(await apply({ action: "pro_month" }, requestId)).toEqual({
      applied: true,
    });
    expect(await apply({ action: "pro_month" }, requestId)).toEqual({
      applied: false,
    });

    expect((await owner()).paidUntil).toBe("2026-04-10T12:00:00.000Z");
  });

  it("ends Pro access once the paid month and its grace days are over", async () => {
    vi.useFakeTimers({
      toFake: ["Date"],
      now: new Date("2026-03-10T12:00:00Z"),
    });
    await apply({ action: "pro_month" });

    vi.setSystemTime(new Date("2026-04-12T12:00:00Z"));
    expect((await owner()).hasPaidAccess).toBe(true);

    vi.setSystemTime(new Date("2026-04-14T12:00:00Z"));
    expect((await owner()).hasPaidAccess).toBe(false);
  });

  it("starts Pro yearly for 12 months with its first month of credits", async () => {
    vi.useFakeTimers({
      toFake: ["Date"],
      now: new Date("2026-03-10T12:00:00Z"),
    });

    await apply({ action: "pro_year" });

    expect(await owner()).toMatchObject({
      planId: "pro-yearly-plan",
      hasPaidAccess: true,
      paidUntil: "2027-03-10T12:00:00.000Z",
      monthlyRemainingUsd: PRO_MONTHLY_CREDITS / 1000,
    });
  });

  it("refills Pro yearly credits once a month, 12 grants in all", async () => {
    vi.useFakeTimers({
      toFake: ["Date"],
      now: new Date("2026-03-10T12:00:00Z"),
    });
    await apply({ action: "pro_year" });
    await testDb.client.execute(
      "UPDATE credit_balances SET remaining = 0 WHERE pool = 'usage_credits'",
    );

    // Not due yet.
    expect(
      await refillYearlyPlanCredits(new Date("2026-04-09T12:00:00Z")),
    ).toBe(0);
    expect((await owner()).monthlyRemainingUsd).toBe(0);

    // Due: refills once, even when the cron runs twice.
    const due = new Date("2026-04-10T12:05:00Z");
    expect(await refillYearlyPlanCredits(due)).toBe(1);
    expect(await refillYearlyPlanCredits(due)).toBe(0);
    expect((await owner()).monthlyRemainingUsd).toBe(
      PRO_MONTHLY_CREDITS / 1000,
    );

    // The other 10 monthly refills, then nothing once the year is over.
    let refills = 1;
    for (let month = 5; month <= 15; month++) {
      const at = new Date(Date.UTC(2026, month - 1, 10, 12, 5));
      refills += await refillYearlyPlanCredits(at);
    }
    expect(refills).toBe(11);
    expect(
      await refillYearlyPlanCredits(new Date("2027-06-10T12:05:00Z")),
    ).toBe(0);
  });

  it("extends a running year from its end without a second month of credits", async () => {
    vi.useFakeTimers({
      toFake: ["Date"],
      now: new Date("2026-03-10T12:00:00Z"),
    });
    await apply({ action: "pro_year" });
    await testDb.client.execute(
      "UPDATE credit_balances SET remaining = 1000 WHERE pool = 'usage_credits'",
    );

    vi.setSystemTime(new Date("2027-02-20T12:00:00Z"));
    await apply({ action: "pro_year" });

    expect(await owner()).toMatchObject({
      paidUntil: "2028-03-10T12:00:00.000Z",
      monthlyRemainingUsd: 1,
    });
    // The refills carry on into the new year.
    expect(
      await refillYearlyPlanCredits(new Date("2027-03-10T12:05:00Z")),
    ).toBe(1);
  });

  it("lists Pro yearly for renewal two weeks before the year ends", async () => {
    vi.useFakeTimers({
      toFake: ["Date"],
      now: new Date("2026-03-10T12:00:00Z"),
    });
    await apply({ action: "pro_year" }); // paid until 2027-03-10
    const due = async () =>
      (await listRenewalsDueAsAdmin(ADMIN)).map((a) => a.email);

    vi.setSystemTime(new Date("2027-02-20T12:00:00Z"));
    expect(await due()).toEqual([]);

    vi.setSystemTime(new Date("2027-02-28T12:00:00Z"));
    expect(await due()).toEqual([OWNER]);
  });

  it("activates Lifetime and adds its credits to what is left", async () => {
    await apply({ action: "lifetime" });

    expect(await owner()).toMatchObject({
      planId: "lifetime-plan",
      hasPaidAccess: true,
      paidUntil: null,
      // The free plan's $1 plus Lifetime's credits.
      monthlyRemainingUsd: 1 + LIFETIME_CREDITS / 1000,
    });
  });

  it("adds extra credits", async () => {
    await apply({ action: "add_credits", credits: 25_000 });
    await apply({ action: "add_credits", credits: 5_000 });

    expect((await owner()).extraRemainingUsd).toBe(30);
  });

  it("downgrades to free with no credits left", async () => {
    await apply({ action: "lifetime" });
    await apply({ action: "add_credits", credits: 25_000 });

    await apply({ action: "downgrade" });

    expect(await owner()).toMatchObject({
      planId: "free",
      hasPaidAccess: false,
      monthlyRemainingUsd: 0,
      extraRemainingUsd: 0,
    });
  });
});

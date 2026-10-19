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
  searchAccountsAsAdmin,
} from "./admin-billing";

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

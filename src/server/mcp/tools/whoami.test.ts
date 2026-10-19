import { beforeEach, describe, expect, it, vi } from "vitest";
import {
  AUTUMN_SEO_DATA_BALANCE_FEATURE_ID,
  AUTUMN_SEO_DATA_TOPUP_BALANCE_FEATURE_ID,
  FREE_PLAN_CREDITS,
} from "@/shared/billing";

const { testDb, isHosted } = await vi.hoisted(async () => {
  const { createAiVisibilityTestDb } =
    await import("@/server/features/ai-visibility/aiVisibilityTestDb");
  return { testDb: await createAiVisibilityTestDb(), isHosted: vi.fn() };
});
vi.mock("cloudflare:workers", () => ({
  env: {
    DATABASE_PROVIDER: "d1",
    KV: { get: async () => null, put: async () => undefined },
  },
}));
vi.mock("@/db", () => ({ db: testDb.db }));
vi.mock("@/db/runBatch", () => ({ runBatch: testDb.runBatch }));
vi.mock("@/server/lib/runtime-env", () => ({
  isHostedServerAuthMode: isHosted,
}));
vi.mock("@/server/lib/posthog", () => ({ captureServerEvent: vi.fn() }));

import { whoamiTool } from "./whoami";
import { makeToolContext, textContent } from "./tool-test-support";

const context = makeToolContext({ orgScope: "user" });

beforeEach(async () => {
  isHosted.mockResolvedValue(true);
  await testDb.client.executeMultiple(`
    DELETE FROM credit_balances;
    DELETE FROM billing_accounts;
    DELETE FROM organization;
  `);
  await testDb.client.execute({
    sql: "INSERT INTO organization (id, name, slug, created_at) VALUES (?, 'Org', 'org', 0)",
    args: [context.auth.organizationId],
  });
});

describe("whoami", () => {
  it("initializes a fresh hosted org before reading its trial balance", async () => {
    const result = await whoamiTool.handler({}, context);

    expect(result.structuredContent.creditsRemaining).toBe(FREE_PLAN_CREDITS);
    expect(result._meta?.creditsRemaining).toBe(FREE_PLAN_CREDITS);
    expect(textContent(result)).toContain(
      `Credits remaining: ${FREE_PLAN_CREDITS.toLocaleString()}`,
    );
  });

  it.each([
    { monthly: 0, topup: 0, expected: 0 },
    { monthly: 200, topup: 75, expected: 275 },
    { monthly: 0, topup: 75, expected: 75 },
  ])(
    "reports $expected credits for $monthly base and $topup top-up",
    async ({ monthly, topup, expected }) => {
      await whoamiTool.handler({}, context);
      await testDb.client.executeMultiple(`
        UPDATE credit_balances SET remaining = ${monthly} WHERE pool = '${AUTUMN_SEO_DATA_BALANCE_FEATURE_ID}';
        UPDATE credit_balances SET remaining = ${topup} WHERE pool = '${AUTUMN_SEO_DATA_TOPUP_BALANCE_FEATURE_ID}';
      `);

      const result = await whoamiTool.handler({}, context);

      expect(result.structuredContent.creditsRemaining).toBe(expected);
    },
  );

  it("keeps account identity available when billing fails", async () => {
    // Without the org row, creating its billing account fails.
    await testDb.client.execute("DELETE FROM organization");

    const result = await whoamiTool.handler({}, context);

    expect(result.structuredContent).toMatchObject({
      userEmail: context.auth.userEmail,
      scopes: context.auth.scopes,
      mode: "hosted",
      creditsRemaining: null,
    });
    expect(result._meta).toBeUndefined();
    expect(textContent(result)).toContain("Credits remaining: unknown");
  });

  it("skips billing in self-hosted mode", async () => {
    isHosted.mockResolvedValue(false);

    const result = await whoamiTool.handler({}, context);

    expect(result.structuredContent).toMatchObject({
      mode: "self-hosted",
      creditsRemaining: null,
    });
    expect(
      await testDb.client.execute("SELECT * FROM billing_accounts"),
    ).toMatchObject({
      rows: [],
    });
  });
});

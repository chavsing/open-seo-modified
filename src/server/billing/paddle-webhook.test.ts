import { createHmac } from "node:crypto";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { z } from "zod";
import { PADDLE_PRICE_IDS } from "@/shared/billing";

const { testDb } = await vi.hoisted(async () => {
  const { createAiVisibilityTestDb } =
    await import("@/server/features/ai-visibility/aiVisibilityTestDb");
  return { testDb: await createAiVisibilityTestDb() };
});
vi.mock("cloudflare:workers", () => ({ env: { DATABASE_PROVIDER: "d1" } }));
vi.mock("@/db", () => ({ db: testDb.db }));
vi.mock("@/db/runBatch", () => ({ runBatch: testDb.runBatch }));
vi.mock("@/server/lib/runtime-env", () => ({
  isHostedServerAuthMode: async () => true,
  getOptionalEnvValue: async (name: string) =>
    ({ PADDLE_WEBHOOK_SECRET: "pdl_ntfset_test" })[name],
}));

import { handlePaddleWebhook } from "./paddle-webhook";

const SECRET = "pdl_ntfset_test";
// The harness seeds organization "organization".
const ORG = "organization";
const PRICES = PADDLE_PRICE_IDS.production!;

let eventCount = 0;
function deliver(
  eventType: string,
  data: unknown,
  options: { occurredAt?: string; secret?: string } = {},
) {
  const body = JSON.stringify({
    event_id: `evt_${++eventCount}`,
    event_type: eventType,
    occurred_at: options.occurredAt ?? new Date().toISOString(),
    data,
  });
  const ts = Math.floor(Date.now() / 1000);
  const h1 = createHmac("sha256", options.secret ?? SECRET)
    .update(`${ts}:${body}`)
    .digest("hex");
  return handlePaddleWebhook(
    new Request("https://app.example/api/paddle/webhook", {
      method: "POST",
      headers: { "paddle-signature": `ts=${ts};h1=${h1}` },
      body,
    }),
  );
}

const transaction = (
  id: string,
  priceId: string,
  customData: Record<string, string> | null,
) => ({
  id,
  status: "completed",
  customer_id: "ctm_1",
  subscription_id: priceId === PRICES.lifetime ? null : "sub_1",
  custom_data: customData,
  currency_code: "USD",
  items: [{ price: { id: priceId } }],
  // $197 plus tax: the amount isn't what identifies the product.
  details: { totals: { grand_total: "21473" } },
});

async function account() {
  const { rows } = await testDb.client.execute(
    `SELECT plan_id, plan_status, current_period_end, paddle_subscription_id FROM billing_accounts WHERE organization_id = '${ORG}'`,
  );
  return rows[0] ?? null;
}

beforeEach(async () => {
  vi.spyOn(console, "info").mockImplementation(() => {});
  vi.spyOn(console, "warn").mockImplementation(() => {});
  await testDb.client.executeMultiple(`
    DELETE FROM paypal_payments;
    DELETE FROM billing_admin_actions;
    DELETE FROM credit_balances;
    DELETE FROM billing_accounts;
  `);
  await testDb.seedProject();
});

describe("Paddle webhook", () => {
  it("turns Pro on for the first payment, once per transaction", async () => {
    const first = transaction("txn_1", PRICES.pro_month, {
      organizationId: ORG,
    });
    expect((await deliver("transaction.completed", first)).status).toBe(200);
    const paid = await account();
    expect(paid).toMatchObject({
      plan_id: "pro-plan",
      paddle_subscription_id: "sub_1",
    });

    // Paddle redelivers the same transaction: the paid month must not grow.
    await deliver("transaction.completed", first);
    expect((await account())?.current_period_end).toBe(
      paid?.current_period_end,
    );
  });

  it("renews from the subscription when the renewal carries no account", async () => {
    await deliver(
      "transaction.completed",
      transaction("txn_1", PRICES.pro_month, { organizationId: ORG }),
    );
    const firstEnd = z.string().parse((await account())?.current_period_end);
    await deliver(
      "transaction.completed",
      transaction("txn_2", PRICES.pro_month, null),
    );
    const renewedEnd = z.string().parse((await account())?.current_period_end);
    expect(Date.parse(renewedEnd)).toBe(
      new Date(firstEnd).setUTCMonth(new Date(firstEnd).getUTCMonth() + 1),
    );
  });

  it("rejects an event Paddle didn't sign", async () => {
    const response = await deliver(
      "transaction.completed",
      transaction("txn_1", PRICES.lifetime, { organizationId: ORG }),
      { secret: "someone-else" },
    );
    expect(response.status).toBe(401);
    expect(await account()).toBeNull();
  });

  it("marks Pro canceled, and a late older event doesn't undo it", async () => {
    await deliver(
      "transaction.completed",
      transaction("txn_1", PRICES.pro_month, { organizationId: ORG }),
    );
    const now = Date.now();
    await deliver(
      "subscription.updated",
      { id: "sub_1", status: "active", scheduled_change: { action: "cancel" } },
      { occurredAt: new Date(now).toISOString() },
    );
    await deliver(
      "subscription.updated",
      { id: "sub_1", status: "active", scheduled_change: null },
      { occurredAt: new Date(now - 60_000).toISOString() },
    );
    expect((await account())?.plan_status).toBe("canceled");
  });

  it("never cancels Lifetime, even with an old subscription linked", async () => {
    await testDb.client.execute(
      `INSERT INTO billing_accounts (organization_id, plan_id, paddle_subscription_id, paddle_customer_id) VALUES ('${ORG}', 'lifetime-plan', 'sub_1', 'ctm_1')`,
    );
    await deliver("subscription.canceled", { id: "sub_1", status: "canceled" });
    expect((await account())?.plan_status).toBe("active");
  });
});

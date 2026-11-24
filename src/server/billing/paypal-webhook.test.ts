import { beforeEach, describe, expect, it, vi } from "vitest";
import { z } from "zod";
import { PAYPAL_PRO_PLAN_ID } from "@/shared/billing";

const { testDb, paypal } = await vi.hoisted(async () => {
  const { createAiVisibilityTestDb } =
    await import("@/server/features/ai-visibility/aiVisibilityTestDb");
  return {
    testDb: await createAiVisibilityTestDb(),
    // What the stubbed PayPal API answers.
    paypal: {
      verification: "SUCCESS",
      subscription: {} as Record<string, unknown>,
      order: {} as Record<string, unknown>,
      transactions: [] as unknown[],
    },
  };
});
vi.mock("cloudflare:workers", () => ({ env: { DATABASE_PROVIDER: "d1" } }));
vi.mock("@/db", () => ({ db: testDb.db }));
vi.mock("@/db/runBatch", () => ({ runBatch: testDb.runBatch }));
vi.mock("@/server/lib/runtime-env", () => ({
  isHostedServerAuthMode: async () => true,
  getOptionalEnvValue: async (name: string) =>
    ({ PAYPAL_CLIENT_SECRET: "secret", PAYPAL_WEBHOOK_ID: "WH-1" })[name],
}));

import { captureCheckoutOrder } from "./paypal-checkout";
import { reconcilePaypalSubscriptions } from "./paypal-reconcile";
import { handlePaypalWebhook } from "./paypal-webhook";

// The harness seeds organization "organization".
const ORG = "organization";

const json = (body: unknown) => Response.json(body);

function paypalApi(url: string) {
  const path = new URL(url).pathname;
  if (path === "/v1/oauth2/token") {
    return json({ access_token: "token", expires_in: 3600 });
  }
  if (path === "/v1/notifications/verify-webhook-signature") {
    return json({ verification_status: paypal.verification });
  }
  if (path.endsWith("/transactions")) {
    return json({ transactions: paypal.transactions });
  }
  if (path.startsWith("/v1/billing/subscriptions/")) {
    return json(paypal.subscription);
  }
  if (path.startsWith("/v2/checkout/orders/")) return json(paypal.order);
  return new Response("not stubbed", { status: 500 });
}

const deliver = (eventType: string, resource: unknown) =>
  handlePaypalWebhook(
    new Request("https://app.example/api/paypal/webhook", {
      method: "POST",
      headers: Object.fromEntries(
        [
          "paypal-auth-algo",
          "paypal-cert-url",
          "paypal-transmission-id",
          "paypal-transmission-sig",
          "paypal-transmission-time",
        ].map((name) => [name, "signed"]),
      ),
      body: JSON.stringify({ id: "WH-EVENT", event_type: eventType, resource }),
    }),
  );

const sale = (id: string) => ({
  id,
  state: "completed",
  amount: { total: "197.00", currency: "USD" },
  billing_agreement_id: "I-SUBSCRIPTION1",
});

const charge = (id: string, time: string) => ({
  id,
  status: "COMPLETED",
  time,
  amount_with_breakdown: {
    gross_amount: { currency_code: "USD", value: "197.00" },
  },
});

// The account's browser reported this subscription after the Subscribe button.
const reportSubscription = () =>
  testDb.client.execute(
    `INSERT INTO billing_accounts (organization_id, paypal_subscription_id, paypal_subscription_reported_at) VALUES ('${ORG}', 'I-SUBSCRIPTION1', '${new Date().toISOString()}')`,
  );

const capture = (customId: string | undefined, value: string) => ({
  id: "CAPTURE-1",
  status: "COMPLETED",
  amount: { currency_code: "USD", value },
  custom_id: customId,
});

async function plan() {
  const { rows } = await testDb.client.execute(
    `SELECT plan_id, current_period_end FROM billing_accounts WHERE organization_id = '${ORG}'`,
  );
  return rows[0] ?? null;
}

async function payments() {
  const { rows } = await testDb.client.execute(
    "SELECT id, status, organization_id FROM paypal_payments",
  );
  return rows;
}

beforeEach(async () => {
  vi.spyOn(console, "info").mockImplementation(() => {});
  vi.spyOn(console, "warn").mockImplementation(() => {});
  vi.stubGlobal(
    "fetch",
    vi.fn((input: string | URL | Request) =>
      Promise.resolve(
        paypalApi(input instanceof Request ? input.url : `${input}`),
      ),
    ),
  );
  paypal.verification = "SUCCESS";
  paypal.subscription = { plan_id: PAYPAL_PRO_PLAN_ID, custom_id: ORG };
  paypal.order = {};
  paypal.transactions = [];
  await testDb.client.executeMultiple(`
    DELETE FROM paypal_payments;
    DELETE FROM billing_admin_actions;
    DELETE FROM credit_balances;
    DELETE FROM billing_accounts;
  `);
  await testDb.seedProject();
});

describe("PayPal webhook", () => {
  it("turns Pro on for a monthly charge, once per PayPal payment", async () => {
    expect(
      (await deliver("PAYMENT.SALE.COMPLETED", sale("SALE-1"))).status,
    ).toBe(200);
    const first = await plan();
    expect(first?.plan_id).toBe("pro-plan");

    // PayPal redelivers the same event: the paid month must not grow.
    await deliver("PAYMENT.SALE.COMPLETED", sale("SALE-1"));
    expect((await plan())?.current_period_end).toBe(first?.current_period_end);
    expect(await payments()).toMatchObject([
      { id: "SALE-1", status: "applied" },
    ]);
  });

  it("rejects an event PayPal didn't send", async () => {
    paypal.verification = "FAILURE";
    const response = await deliver("PAYMENT.SALE.COMPLETED", sale("SALE-1"));
    expect(response.status).toBe(401);
    expect(await plan()).toBeNull();
    expect(await payments()).toEqual([]);
  });

  it("ignores the client's other PayPal sales", async () => {
    paypal.subscription = { plan_id: "P-SOMEONE-ELSES-PLAN" };
    await deliver("PAYMENT.SALE.COMPLETED", sale("SALE-1"));
    await deliver("PAYMENT.CAPTURE.COMPLETED", capture(undefined, "12.00"));
    expect(await payments()).toEqual([]);
  });

  it("holds a payment link payment for the admin", async () => {
    await deliver("PAYMENT.CAPTURE.COMPLETED", capture(undefined, "4799.00"));
    expect(await payments()).toMatchObject([
      { id: "CAPTURE-1", status: "needs_review", organization_id: null },
    ]);
  });

  it("doesn't apply a checkout payment for the wrong amount", async () => {
    await deliver(
      "PAYMENT.CAPTURE.COMPLETED",
      capture(`ags:lifetime:${ORG}`, "1.00"),
    );
    expect((await plan())?.plan_id ?? "free").toBe("free");
    expect(await payments()).toMatchObject([{ status: "needs_review" }]);
  });
});

describe("PayPal checkout capture", () => {
  it("refuses to capture another account's order", async () => {
    paypal.order = {
      id: "ORDER1",
      status: "APPROVED",
      purchase_units: [{ custom_id: "ags:lifetime:another-organization" }],
    };
    await expect(
      captureCheckoutOrder({ organizationId: ORG, role: "owner" }, "ORDER1"),
    ).rejects.toMatchObject({ code: "NOT_FOUND" });
  });
});

const paidAt = () => new Date(Date.now() - 60 * 60_000).toISOString();

describe("PayPal subscription check", () => {
  it("turns Pro on when the webhook never arrived", async () => {
    await reportSubscription();
    paypal.transactions = [charge("TX-1", paidAt())];
    await reconcilePaypalSubscriptions();
    expect((await plan())?.plan_id).toBe("pro-plan");
  });

  it("counts a charge once when the webhook and the check give it different ids", async () => {
    await reportSubscription();
    const time = paidAt();
    await deliver("PAYMENT.SALE.COMPLETED", {
      ...sale("SALE-1"),
      create_time: time,
    });
    const paidUntil = z.string().parse((await plan())?.current_period_end);

    paypal.transactions = [charge("TX-1", time)];
    await reconcilePaypalSubscriptions(
      new Date(Date.parse(paidUntil) - 12 * 60 * 60_000),
    );
    expect((await plan())?.current_period_end).toBe(paidUntil);
  });

  it("ignores a subscription started from another account", async () => {
    await reportSubscription();
    paypal.subscription = {
      plan_id: PAYPAL_PRO_PLAN_ID,
      custom_id: "another-organization",
    };
    paypal.transactions = [charge("TX-1", paidAt())];
    await reconcilePaypalSubscriptions();
    expect((await plan())?.plan_id).toBe("free");
  });
});

import { beforeEach, describe, expect, it, vi } from "vitest";

const { testDb, sendNoticeEmail } = await vi.hoisted(async () => {
  const { createAiVisibilityTestDb } =
    await import("@/server/features/ai-visibility/aiVisibilityTestDb");
  return {
    testDb: await createAiVisibilityTestDb(),
    sendNoticeEmail:
      vi.fn<(notice: { email: string; title: string }) => Promise<boolean>>(),
  };
});
vi.mock("cloudflare:workers", () => ({ env: { DATABASE_PROVIDER: "d1" } }));
vi.mock("@/db", () => ({ db: testDb.db }));
vi.mock("@/db/runBatch", () => ({ runBatch: testDb.runBatch }));
vi.mock("@/server/email/loops", () => ({ sendNoticeEmail }));
vi.mock("@/server/lib/runtime-env", () => ({
  isHostedServerAuthMode: async () => true,
  getOptionalEnvValue: async (name: string) =>
    name === "ADMIN_EMAILS" ? ADMIN : undefined,
}));

import { applyBillingActionAsAdmin } from "./admin-billing";
import { sendBillingReminders } from "./billingNotices";

// The harness seeds organization "organization"; this member is its owner.
const ORG = "organization";
const OWNER = "owner@example.com";
const ADMIN = "admin@example.com";
const DAY_MS = 24 * 60 * 60_000;

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

const titles = () => sendNoticeEmail.mock.calls.map(([notice]) => notice.title);

beforeEach(async () => {
  sendNoticeEmail.mockResolvedValue(true);
  vi.spyOn(console, "info").mockImplementation(() => {});
  vi.spyOn(console, "log").mockImplementation(() => {});
  await testDb.client.executeMultiple(`
    DELETE FROM billing_notices;
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

describe("billing notices", () => {
  it("emails the owner once when the admin records a payment", async () => {
    const requestId = crypto.randomUUID();
    await apply({ action: "pro_month" }, requestId);
    await apply({ action: "pro_month" }, requestId);

    expect(titles()).toEqual(["Your Pro plan is active"]);
    expect(sendNoticeEmail.mock.calls[0][0]).toMatchObject({ email: OWNER });
  });

  it("reminds a Pro year once per stage, and retries a failed send", async () => {
    await apply({ action: "pro_year" });
    sendNoticeEmail.mockClear();
    const end = new Date(Date.now() + 10 * DAY_MS).toISOString();
    await testDb.client.execute({
      sql: "UPDATE billing_accounts SET current_period_end = ?",
      args: [end],
    });

    sendNoticeEmail.mockResolvedValueOnce(false);
    await sendBillingReminders();
    await sendBillingReminders();
    await sendBillingReminders();
    expect(titles()).toEqual([
      "Your Pro Yearly plan ends soon",
      "Your Pro Yearly plan ends soon",
    ]);

    await sendBillingReminders(new Date(Date.parse(end) - DAY_MS));
    await sendBillingReminders(new Date(Date.parse(end) + DAY_MS));
    await sendBillingReminders(new Date(Date.parse(end) + DAY_MS));
    expect(titles().slice(2)).toEqual([
      "Your Pro Yearly plan ends in a few days",
      "Your Pro Yearly plan has ended",
    ]);
  });

  it("warns about low credits once until they are topped up", async () => {
    await apply({ action: "pro_month" });
    await testDb.client.execute(
      "UPDATE credit_balances SET remaining = 1000 WHERE pool = 'usage_credits'",
    );
    sendNoticeEmail.mockClear();

    await sendBillingReminders();
    await sendBillingReminders();
    expect(titles()).toEqual(["Your AGS MASTER credits are running low"]);

    await apply({ action: "add_credits", credits: 2000 });
    await sendBillingReminders();
    expect(titles()).toEqual([
      "Your AGS MASTER credits are running low",
      "Credits added",
      "Your AGS MASTER credits are running low",
    ]);
  });
});

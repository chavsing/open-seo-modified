import { beforeEach, describe, expect, it, vi } from "vitest";

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
    name === "ADMIN_EMAILS" ? "admin@example.com" : undefined,
}));

import {
  addAllowedEmailAsAdmin,
  canEmailSignUp,
  getSignupAccessAsAdmin,
  removeAllowedEmailAsAdmin,
  setInviteOnlyAsAdmin,
} from "./signup-access";

const ADMIN = "admin@example.com";

beforeEach(async () => {
  await testDb.client.executeMultiple(`
    DELETE FROM signup_allowed_emails;
    DELETE FROM signup_settings;
    DELETE FROM invitation;
    DELETE FROM billing_accounts;
  `);
});

async function seedInvitation() {
  await testDb.seedProject();
  await testDb.client.executeMultiple(`
    DELETE FROM user WHERE id = 'inviter';
    INSERT INTO user (id, name, email, email_verified, created_at, updated_at)
      VALUES ('inviter', 'Inviter', 'inviter@example.com', 1, 0, 0);
    INSERT INTO invitation (id, organization_id, email, role, status, expires_at, created_at, inviter_id)
      VALUES ('invite', 'organization', 'teammate@example.com', 'admin', 'pending', ${Date.now() + 86_400_000}, 0, 'inviter');
  `);
}

describe("invite-only sign-up", () => {
  it("is on by default and refuses an email nobody allowed", async () => {
    expect((await getSignupAccessAsAdmin(ADMIN)).inviteOnly).toBe(true);
    expect(await canEmailSignUp("stranger@example.com")).toBe(false);
  });

  it("allows a listed email, whatever its case, until it is removed", async () => {
    await addAllowedEmailAsAdmin(ADMIN, " Customer@Example.com ");
    expect(await canEmailSignUp("customer@example.com")).toBe(true);

    await removeAllowedEmailAsAdmin(ADMIN, "customer@example.com");
    expect(await canEmailSignUp("customer@example.com")).toBe(false);
  });

  it("always allows an admin email", async () => {
    expect(await canEmailSignUp("Admin@Example.com")).toBe(true);
  });

  it("allows an email invited by a paying account", async () => {
    await seedInvitation();
    await testDb.client.execute(
      "INSERT INTO billing_accounts (organization_id, plan_id, created_at, updated_at) VALUES ('organization', 'lifetime-plan', '2026-01-01', '2026-01-01')",
    );
    expect(await canEmailSignUp("teammate@example.com")).toBe(true);
  });

  it("refuses an email invited by a free account", async () => {
    await seedInvitation();
    expect(await canEmailSignUp("teammate@example.com")).toBe(false);
  });

  it("allows anyone once invite-only is switched off", async () => {
    await setInviteOnlyAsAdmin(ADMIN, false);
    expect(await canEmailSignUp("stranger@example.com")).toBe(true);
  });

  it("refuses the admin actions to anyone else", async () => {
    await expect(
      addAllowedEmailAsAdmin("customer@example.com", "friend@example.com"),
    ).rejects.toMatchObject({ code: "FORBIDDEN" });
    await expect(
      setInviteOnlyAsAdmin("customer@example.com", false),
    ).rejects.toMatchObject({ code: "FORBIDDEN" });
  });
});

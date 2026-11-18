import { beforeEach, describe, expect, it, vi } from "vitest";

const { testDb, create, listCompetitors } = await vi.hoisted(async () => {
  const { createAiVisibilityTestDb } =
    await import("@/server/features/ai-visibility/aiVisibilityTestDb");
  return {
    testDb: await createAiVisibilityTestDb(),
    create: vi.fn(),
    listCompetitors: vi.fn(),
  };
});
vi.mock("cloudflare:workers", () => ({
  env: { DATABASE_PROVIDER: "d1", SITE_SETUP_WORKFLOW: { create } },
}));
vi.mock("@/db", () => ({ db: testDb.db }));
vi.mock("@/server/lib/runtime-env", () => ({
  isHostedServerAuthMode: async () => true,
}));
vi.mock("@/server/billing/subscription", () => ({
  checkUsageCreditsDepleted: async () => ({ depleted: false }),
}));
vi.mock(
  "@/server/features/project-context/repositories/ProjectContextRepository",
  () => ({
    ProjectContextRepository: {
      listSections: async () => [],
      listCompetitors,
    },
  }),
);

import { startAutomaticSetup } from "./automaticSetup";

const project = { id: "project", domain: "openseo.so" };
const customer = {
  organizationId: "organization",
  userId: "user",
  userEmail: "owner@example.com",
  projectId: "project",
};

beforeEach(async () => {
  listCompetitors.mockResolvedValue([]);
  await testDb.client.execute("DELETE FROM project_activation_state");
  await testDb.seedProject();
});

describe("automatic site setup", () => {
  it("starts once per project, even when two requests race", async () => {
    await Promise.all([
      startAutomaticSetup(project, customer),
      startAutomaticSetup(project, customer),
    ]);
    await startAutomaticSetup(project, customer);
    expect(create).toHaveBeenCalledTimes(1);
  });

  it("leaves a site that was already set up alone", async () => {
    listCompetitors.mockResolvedValue([{ domain: "rival.com" }]);
    await startAutomaticSetup(project, customer);
    expect(create).not.toHaveBeenCalled();
  });
});

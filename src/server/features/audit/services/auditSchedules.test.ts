import { beforeEach, expect, it, vi } from "vitest";

const { testDb, mocks } = await vi.hoisted(async () => {
  const { createAiVisibilityTestDb } =
    await import("@/server/features/ai-visibility/aiVisibilityTestDb");
  return {
    testDb: await createAiVisibilityTestDb(),
    mocks: {
      startAudit: vi.fn<(input: unknown) => Promise<{ auditId: string }>>(),
      resolveAuditLimitTier: vi.fn<() => Promise<string>>(),
      sendNoticeEmail:
        vi.fn<
          (notice: { title: string; message: string }) => Promise<boolean>
        >(),
    },
  };
});
vi.mock("cloudflare:workers", () => ({ env: { DATABASE_PROVIDER: "d1" } }));
vi.mock("@/db", () => ({ db: testDb.db }));
vi.mock("@/server/features/audit/services/AuditService", () => ({
  AuditService: {
    startAudit: mocks.startAudit,
    resolveAuditLimitTier: mocks.resolveAuditLimitTier,
  },
}));
vi.mock("@/server/email/loops", () => ({
  sendNoticeEmail: mocks.sendNoticeEmail,
}));
vi.mock("@/server/lib/runtime-env", () => ({
  getOptionalEnvValue: async () => "https://app.example.com",
}));

import {
  compareWithPreviousAudit,
  notifyScheduledAuditDone,
  runScheduledAudits,
} from "./auditSchedules";

const DUE = "2026-11-10T03:00:00.000Z";
const NOW = new Date("2026-11-10T03:05:00.000Z");

beforeEach(async () => {
  mocks.startAudit.mockResolvedValue({ auditId: "audit-new" });
  mocks.resolveAuditLimitTier.mockResolvedValue("paid");
  mocks.sendNoticeEmail.mockResolvedValue(true);
  await testDb.seedProject();
  await testDb.client.executeMultiple(`
    DELETE FROM audit_schedules;
    DELETE FROM audits;
    DELETE FROM user WHERE id = 'owner';
    INSERT INTO user (id, name, email, email_verified, created_at, updated_at)
      VALUES ('owner', 'Owner', 'owner@example.com', 1, 0, 0);
    INSERT INTO member (id, organization_id, user_id, role, created_at)
      VALUES ('m', 'organization', 'owner', 'owner', 0);
    INSERT INTO audit_schedules
      (project_id, start_url, interval, max_pages, created_by_user_id, next_run_at, updated_at)
      VALUES ('project', 'https://openseo.so/', 'weekly', 50, 'owner', '${DUE}', '${DUE}');
  `);
});

const schedule = async () =>
  (
    await testDb.client.execute(
      "SELECT next_run_at, last_audit_id, last_error FROM audit_schedules",
    )
  ).rows[0];

it("starts a due audit once and moves the schedule on a week", async () => {
  expect(await runScheduledAudits(NOW)).toBe(1);
  expect(await runScheduledAudits(NOW)).toBe(0);

  expect(mocks.startAudit).toHaveBeenCalledTimes(1);
  // Lighthouse bills per page, so a schedule never turns it on.
  expect(mocks.startAudit).toHaveBeenCalledWith(
    expect.objectContaining({ maxPages: 50, lighthouseStrategy: "none" }),
  );
  expect(await schedule()).toMatchObject({
    next_run_at: "2026-11-17T03:00:00.000Z",
    last_audit_id: "audit-new",
    last_error: null,
  });
});

it("doesn't start an audit for a free plan", async () => {
  mocks.resolveAuditLimitTier.mockResolvedValue("free");

  await runScheduledAudits(NOW);

  expect(mocks.startAudit).not.toHaveBeenCalled();
  expect((await schedule()).last_error).toMatch(/paid plan/);
});

async function seedTwoAudits() {
  await testDb.client.executeMultiple(`
    INSERT INTO audits (id, project_id, started_by_user_id, start_url, status, pages_crawled, started_at)
      VALUES ('old', 'project', 'owner', 'https://openseo.so/', 'completed', 10, '2026-11-03T03:00:00.000Z'),
             ('audit-new', 'project', 'owner', 'https://openseo.so/', 'completed', 12, '2026-11-10T03:00:00.000Z');
    INSERT INTO audit_issues (id, audit_id, page_url, issue_type) VALUES
      ('1', 'old', '/a', 'missing-title'),
      ('2', 'old', '/b', 'missing-title'),
      ('3', 'audit-new', '/b', 'missing-title'),
      ('4', 'audit-new', '/c', 'broken-link');
  `);
}

it("counts new and fixed issues against the previous audit", async () => {
  await seedTwoAudits();

  const comparison = await compareWithPreviousAudit("audit-new", "project");

  expect(comparison).toMatchObject({
    previousAuditId: "old",
    added: 1,
    fixed: 1,
  });
  expect(comparison?.byType).toEqual(
    expect.arrayContaining([
      expect.objectContaining({
        issueType: "broken-link",
        added: 1,
        before: 0,
        now: 1,
      }),
      expect.objectContaining({
        issueType: "missing-title",
        fixed: 1,
        before: 2,
        now: 1,
      }),
    ]),
  );
});

it("emails the owner once when the scheduled audit finishes", async () => {
  await seedTwoAudits();
  await runScheduledAudits(NOW);

  await notifyScheduledAuditDone("project", "audit-new");
  await notifyScheduledAuditDone("project", "audit-new");
  // An audit someone started by hand sends nothing.
  await notifyScheduledAuditDone("project", "old");

  expect(mocks.sendNoticeEmail).toHaveBeenCalledTimes(1);
  expect(mocks.sendNoticeEmail.mock.calls[0][0].message).toContain(
    "1 new and 1 fixed",
  );
});

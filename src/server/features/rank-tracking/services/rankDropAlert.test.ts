import { beforeEach, expect, it, vi } from "vitest";
import { alertRankDrops } from "./rankDropAlert";

const mocks = vi.hoisted(() => ({
  sendNoticeEmail:
    vi.fn<(notice: { email: string; message: string }) => Promise<boolean>>(),
}));
vi.mock("@/server/email/loops", () => ({
  sendNoticeEmail: mocks.sendNoticeEmail,
}));
vi.mock("@/server/auth/repositories/AuthRepository", () => ({
  AuthRepository: { listOwnerEmails: async () => ["owner@example.com"] },
}));
vi.mock("@/server/lib/runtime-env", () => ({
  getOptionalEnvValue: async () => "https://app.example.com",
}));

const snap = (id: string, position: number | null) => ({
  trackingKeywordId: id,
  device: "mobile",
  keyword: `keyword ${id}`,
  position,
});

const alert = (
  before: ReturnType<typeof snap>[],
  after: ReturnType<typeof snap>[],
) =>
  alertRankDrops({
    organizationId: "org",
    projectId: "project",
    domain: "acme.com",
    before,
    after,
  });

beforeEach(() => {
  mocks.sendNoticeEmail.mockResolvedValue(true);
});

it("emails only big drops from the first two pages", async () => {
  await alert(
    [snap("a", 4), snap("b", 3), snap("c", 30)],
    [snap("a", 12), snap("b", 6), snap("c", 60)],
  );

  expect(mocks.sendNoticeEmail).toHaveBeenCalledTimes(1);
  const { message } = mocks.sendNoticeEmail.mock.calls[0][0];
  expect(message).toContain('"keyword a" was at 4 and fell to 12 (mobile)');
  expect(message).not.toContain("keyword b");
  expect(message).not.toContain("keyword c");
});

it("sends nothing when no keyword dropped", async () => {
  await alert([snap("a", 4)], [snap("a", 2)]);

  expect(mocks.sendNoticeEmail).not.toHaveBeenCalled();
});

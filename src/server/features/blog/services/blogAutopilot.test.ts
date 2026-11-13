import { beforeEach, describe, expect, it, vi } from "vitest";

const {
  addAutopilotImages,
  listDueAutoPosts,
  claimDueAutoPost,
  listTopicIdeas,
  upsertSettings,
  getSettings,
  testWordpress,
  sendToWordpress,
  writeBlogArticle,
  chooseBlogTopic,
  setTopicStatus,
} = vi.hoisted(() => ({
  addAutopilotImages: vi.fn(),
  listDueAutoPosts: vi.fn(),
  claimDueAutoPost: vi.fn(),
  listTopicIdeas: vi.fn(),
  upsertSettings:
    vi.fn<
      (projectId: string, settings: { lastRunMessage: string }) => Promise<void>
    >(),
  getSettings: vi.fn(),
  testWordpress: vi.fn(),
  sendToWordpress: vi.fn(),
  writeBlogArticle: vi.fn(),
  chooseBlogTopic: vi.fn(),
  setTopicStatus: vi.fn(),
}));
vi.mock("@/server/features/blog/repositories/BlogRepository", () => ({
  BlogRepository: {
    listDueAutoPosts,
    claimDueAutoPost,
    listTopicIdeas,
    upsertSettings,
    setTopicStatus,
  },
}));
vi.mock("@/server/features/blog/services/BlogService", () => ({
  BlogService: { getSettings, testWordpress, sendToWordpress },
}));
vi.mock("@/server/features/blog/services/blogImagePublishing", () => ({
  addAutopilotImages,
}));
vi.mock("@/server/auth/repositories/AuthRepository", () => ({
  AuthRepository: { listOwnerEmails: vi.fn().mockResolvedValue([]) },
}));
vi.mock("@/server/email/loops", () => ({ sendNoticeEmail: vi.fn() }));
vi.mock("@/server/lib/runtime-env", () => ({
  getOptionalEnvValue: vi.fn().mockResolvedValue(null),
}));
vi.mock("@/server/features/blog/services/blogWriting", () => ({
  fileArticle: vi.fn(),
}));
vi.mock("@/server/features/blog/services/blogWriter", () => ({
  writeBlogArticle,
  chooseBlogTopic,
}));
vi.mock("@/server/features/blog/services/blogResearch", () => ({
  findBlogTopics: vi.fn(),
  createBlogBrief: vi.fn().mockResolvedValue({ articleId: "a1" }),
}));
vi.mock("@/server/features/projects/repositories/ProjectRepository", () => ({
  ProjectRepository: {
    getProjectForOrganization: vi.fn().mockResolvedValue({ id: "p1" }),
  },
}));

import { runScheduledBlogPosts } from "./blogAutopilot";

beforeEach(() => {
  listDueAutoPosts.mockResolvedValue([
    {
      projectId: "p1",
      organizationId: "o1",
      postsPerWeek: 2,
      nextPostAt: "2026-01-01T00:00:00.000Z",
    },
  ]);
  claimDueAutoPost.mockResolvedValue(true);
  addAutopilotImages.mockResolvedValue({ added: 3, missing: 0 });
  listTopicIdeas.mockResolvedValue([
    { id: "t1", keyword: "chemex brewing", searchVolume: 1600 },
    { id: "t2", keyword: "hungry ghost coffee", searchVolume: 27100 },
  ]);
  chooseBlogTopic.mockResolvedValue({
    choice: "chemex brewing",
    reject: ["hungry ghost coffee"],
  });
  upsertSettings.mockResolvedValue(undefined);
  getSettings.mockResolvedValue({
    publishMode: "auto",
    wordpress: { url: "https://acme.com/", username: "editor" },
  });
  testWordpress.mockResolvedValue({ ok: true, name: "Editor" });
  sendToWordpress.mockResolvedValue({ status: "draft", link: null });
});

describe("runScheduledBlogPosts", () => {
  it("keeps an Auto-publish article below the publishing bar out of WordPress", async () => {
    writeBlogArticle.mockResolvedValueOnce({
      title: "Coffee roasters",
      aiScore: 8,
      passedAllChecks: true,
    });

    await runScheduledBlogPosts();

    expect(sendToWordpress).not.toHaveBeenCalled();
    expect(upsertSettings.mock.calls[0]?.[1].lastRunMessage).toContain(
      "kept it in the Blog Generator",
    );
  });

  it("keeps an Auto-publish article out of WordPress when a picture failed", async () => {
    writeBlogArticle.mockResolvedValueOnce({
      title: "Coffee roasters",
      aiScore: 9,
      passedAllChecks: true,
    });
    addAutopilotImages.mockResolvedValueOnce({ added: 2, missing: 1 });

    await runScheduledBlogPosts();

    expect(sendToWordpress).not.toHaveBeenCalled();
    expect(upsertSettings.mock.calls[0]?.[1].lastRunMessage).toContain(
      "kept it in the Blog Generator",
    );
  });

  it("skips the ideas the AI rejects, such as other brands' names", async () => {
    writeBlogArticle.mockResolvedValueOnce({
      title: "Chemex brewing",
      aiScore: 10,
      passedAllChecks: true,
    });

    await runScheduledBlogPosts();

    expect(setTopicStatus).toHaveBeenCalledWith("p1", "t2", "skipped");
    expect(setTopicStatus).not.toHaveBeenCalledWith("p1", "t1", "skipped");
  });

  it("writes nothing when WordPress refuses the saved login", async () => {
    testWordpress.mockResolvedValueOnce({
      ok: false,
      message: "WordPress refused the login.",
    });

    await runScheduledBlogPosts();

    expect(writeBlogArticle).not.toHaveBeenCalled();
    const saved = upsertSettings.mock.calls[0]?.[1];
    expect(saved?.lastRunMessage).toContain("Nothing was written or charged");
  });

  it("writes nothing when another run already claimed the site", async () => {
    claimDueAutoPost.mockResolvedValueOnce(false);

    await runScheduledBlogPosts();

    expect(writeBlogArticle).not.toHaveBeenCalled();
  });
});

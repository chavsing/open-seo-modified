import { beforeEach, describe, expect, it, vi } from "vitest";

const {
  listDueAutoPosts,
  claimDueAutoPost,
  listTopicIdeas,
  upsertSettings,
  getSettings,
  sendToWordpress,
  writeBlogArticle,
  chooseBlogTopic,
  setTopicStatus,
} = vi.hoisted(() => ({
  listDueAutoPosts: vi.fn(),
  claimDueAutoPost: vi.fn(),
  listTopicIdeas: vi.fn(),
  upsertSettings: vi.fn(),
  getSettings: vi.fn(),
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
  BlogService: { getSettings, sendToWordpress },
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
  sendToWordpress.mockResolvedValue({ status: "draft", link: null });
});

describe("runScheduledBlogPosts", () => {
  it("sends an Auto-publish article below 10/10 as a draft, never live", async () => {
    writeBlogArticle.mockResolvedValueOnce({
      title: "Coffee roasters",
      aiScore: 9,
      passedAllChecks: true,
    });

    await runScheduledBlogPosts();

    expect(sendToWordpress).toHaveBeenCalledWith(
      { id: "p1" },
      { articleId: "a1", publish: false },
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

  it("writes nothing when another run already claimed the site", async () => {
    claimDueAutoPost.mockResolvedValueOnce(false);

    await runScheduledBlogPosts();

    expect(writeBlogArticle).not.toHaveBeenCalled();
  });
});

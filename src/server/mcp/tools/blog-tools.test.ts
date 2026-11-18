import { beforeEach, describe, expect, it, vi } from "vitest";
import {
  sendBlogArticleToWordpressTool,
  startBlogArticleTool,
} from "./blog-tools";
import { makeToolContext } from "./tool-test-support";

const mocks = vi.hoisted(() => ({
  getProjectForOrganization: vi.fn(),
  sendToWordpress: vi.fn(),
  createBlogBrief: vi.fn(),
  createBlogBriefFromKeyword: vi.fn(),
}));

vi.mock("cloudflare:workers", () => ({ env: {} }));
vi.mock("@/server/features/projects/services/ProjectService", () => ({
  ProjectService: {
    getProjectForOrganization: mocks.getProjectForOrganization,
  },
}));
vi.mock("@/server/features/projects/repositories/ProjectRepository", () => ({
  ProjectRepository: {
    getProjectForOrganization: mocks.getProjectForOrganization,
  },
}));
vi.mock("@/server/features/blog/services/BlogService", () => ({
  BlogService: { sendToWordpress: mocks.sendToWordpress },
}));
vi.mock("@/server/features/blog/services/blogResearch", () => ({
  createBlogBrief: mocks.createBlogBrief,
  createBlogBriefFromKeyword: mocks.createBlogBriefFromKeyword,
}));
vi.mock("@/server/features/blog/services/blogWriting", () => ({
  startArticleWriting: vi.fn(),
}));

const projectId = "6f1c2a1e-5b4d-4c3e-9a8b-7d6e5f4a3b2c";
const articleId = "0d9c8b7a-6e5f-4d3c-8b2a-1f0e9d8c7b6a";

beforeEach(() => {
  mocks.getProjectForOrganization.mockResolvedValue({ id: projectId });
  mocks.sendToWordpress.mockResolvedValue({ status: "draft", link: null });
});

describe("blog tools", () => {
  // An AI app must never publish live unless the user asked it to.
  it("sends to WordPress as a draft unless publish is set", async () => {
    await sendBlogArticleToWordpressTool.handler(
      { projectId, articleId },
      makeToolContext(),
    );
    expect(mocks.sendToWordpress).toHaveBeenCalledWith(expect.anything(), {
      articleId,
      publish: false,
    });
  });

  it("starts an article from a topic or a keyword, not both", async () => {
    await expect(
      startBlogArticleTool.handler(
        { projectId, topicId: articleId, keyword: "cold brew" },
        makeToolContext(),
      ),
    ).rejects.toMatchObject({ code: "VALIDATION_ERROR" });
    expect(mocks.createBlogBrief).not.toHaveBeenCalled();
    expect(mocks.createBlogBriefFromKeyword).not.toHaveBeenCalled();
  });
});

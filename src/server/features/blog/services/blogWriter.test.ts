import { beforeEach, describe, expect, it, vi } from "vitest";

const { generateText, getArticle, updateArticle } = vi.hoisted(() => ({
  generateText: vi.fn(),
  getArticle: vi.fn(),
  updateArticle: vi.fn(),
}));
vi.mock("ai", () => ({
  generateText,
  Output: { object: (value: unknown) => value },
}));
vi.mock("@/server/features/blog/repositories/BlogRepository", () => ({
  BlogRepository: {
    getArticle,
    updateArticle,
    listOtherTitles: vi.fn().mockResolvedValue([]),
  },
}));
vi.mock("@/server/lib/scrape", () => ({
  discoverSiteUrls: vi.fn().mockResolvedValue({ urls: [] }),
}));
vi.mock("@/server/lib/runtime-env", () => ({
  getOptionalEnvValue: vi.fn(),
  isHostedServerAuthMode: vi.fn().mockResolvedValue(false),
}));
vi.mock("@/server/lib/openrouter", () => ({
  buildChatAgentModel: vi.fn(),
  requireOpenRouterApiKey: vi.fn().mockResolvedValue("key"),
}));
vi.mock("@/server/lib/chatAgent", () => ({
  requireOpenRouterCostUsd: vi.fn().mockReturnValue(0.01),
}));
vi.mock("@/server/billing/researchSpend", () => ({
  billResearchSpend: vi.fn(),
}));
vi.mock("@/server/billing/subscription", () => ({
  checkUsageCreditsDepleted: vi.fn(),
}));

import { writeBlogArticle } from "./blogWriter";
import { customer } from "@/server/features/ai-visibility/services/aiVisibilityTestFixtures";
import { checkArticle } from "@/shared/blog-quality";

const project = { id: "p1", domain: "acme.com", languageCode: "en" };
const article = {
  id: "a1",
  keyword: "coffee roasters",
  brief: "brief",
  content: null,
  status: "brief",
};
const paragraph = `${"Fresh beans taste better when roasted with care. ".repeat(12)}\n\n`;
/** A draft that passes every check. */
const goodBody = [
  "Coffee roasters in your area roast beans weekly.\n\n",
  "## Choosing coffee roasters\n\n",
  paragraph.repeat(3),
  "## Roast levels\n\n",
  paragraph.repeat(3),
  "## Where to buy\n\n",
  paragraph.repeat(3),
  "See [our shop](https://acme.com/).\n",
].join("");
const goodTitle = "How to Choose Coffee Roasters Near You";
const reply = (title: string, content: string) => ({
  output: { title, content },
  providerMetadata: {},
});

beforeEach(() => {
  getArticle.mockResolvedValue(article);
});

describe("writeBlogArticle", () => {
  it("revises a draft that fails checks, and saves no body H1", async () => {
    generateText
      .mockResolvedValueOnce(reply("Coffee", "# Coffee roasters\n\nToo short."))
      .mockResolvedValueOnce(
        reply(goodTitle, `# Coffee roasters intro\n\n${goodBody}`),
      );

    const saved = await writeBlogArticle(
      project,
      { articleId: "a1", replace: false },
      customer,
    );

    expect(generateText).toHaveBeenCalledTimes(2);
    expect(saved.content).not.toMatch(/^#\s/m);
    expect(
      checkArticle({
        ...saved,
        keyword: article.keyword,
        domain: "acme.com",
        otherTitles: [],
      }).passed,
    ).toBe(11);
    expect(updateArticle).toHaveBeenCalledWith("p1", "a1", {
      ...saved,
      status: "ready",
    });
  });

  it("doesn't save over an article deleted while writing", async () => {
    getArticle.mockResolvedValueOnce(article).mockResolvedValueOnce(undefined);
    generateText.mockResolvedValue(reply(goodTitle, goodBody));

    await expect(
      writeBlogArticle(project, { articleId: "a1", replace: false }, customer),
    ).rejects.toMatchObject({ code: "NOT_FOUND" });
    expect(updateArticle).not.toHaveBeenCalled();
  });
});

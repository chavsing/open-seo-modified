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
vi.mock("@/server/features/blog/services/blogBusiness", () => ({
  businessContext: vi.fn().mockResolvedValue(null),
  sitePages: vi.fn().mockResolvedValue(["https://acme.com/"]),
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
const metaDescription =
  "How to pick coffee roasters near you: what roast dates mean, which roast level suits you, and where to buy fresh beans each week.";
const reply = (title: string, content: string) => ({
  output: { title, content, metaDescription },
  providerMetadata: {},
});
const review = (score: number, problems: string[] = []) => ({
  output: { score, problems },
  providerMetadata: {},
});

beforeEach(() => {
  getArticle.mockResolvedValue(article);
});

describe("writeBlogArticle", () => {
  it("revises until every check passes and the AI gives 10/10", async () => {
    generateText
      .mockResolvedValueOnce(reply("Coffee", "# Coffee roasters\n\nToo short."))
      .mockResolvedValueOnce(review(4, ["Far too short"]))
      .mockResolvedValueOnce(
        reply(goodTitle, `# Coffee roasters intro\n\n${goodBody}`),
      )
      .mockResolvedValueOnce(review(10));

    const saved = await writeBlogArticle(
      project,
      { articleId: "a1", replace: false },
      customer,
    );

    expect(generateText).toHaveBeenCalledTimes(4);
    expect(saved.content).not.toMatch(/^#\s/m);
    expect(saved).toMatchObject({ aiScore: 10, passedAllChecks: true });
    expect(updateArticle).toHaveBeenCalledWith(
      "p1",
      "a1",
      expect.objectContaining({
        aiScore: 10,
        aiFeedback: null,
        status: "ready",
      }),
    );
  });

  it("never counts a 10 that still lists fixes as a 10", async () => {
    // Three drafts, each reviewed: the "10" never ends the loop early.
    for (let draft = 0; draft < 3; draft++)
      generateText
        .mockResolvedValueOnce(reply(goodTitle, goodBody))
        .mockResolvedValueOnce(review(10, ["Cut the off-topic section"]));

    const saved = await writeBlogArticle(
      project,
      { articleId: "a1", replace: false },
      customer,
    );

    expect(saved.aiScore).toBe(9);
    expect(saved.aiFeedback).toBe("Cut the off-topic section");
  });

  it("doesn't save over an article deleted while writing", async () => {
    getArticle.mockResolvedValueOnce(article).mockResolvedValueOnce(undefined);
    generateText
      .mockResolvedValueOnce(reply(goodTitle, goodBody))
      .mockResolvedValueOnce(review(10));

    await expect(
      writeBlogArticle(project, { articleId: "a1", replace: false }, customer),
    ).rejects.toMatchObject({ code: "NOT_FOUND" });
    expect(updateArticle).not.toHaveBeenCalled();
  });
});

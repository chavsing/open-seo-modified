import { describe, expect, it } from "vitest";
import { checkArticle } from "./blog-quality";

const paragraph = (count: number) =>
  Array.from({ length: count }, (_, i) => `word${i}`).join(" ");

function article(overrides: Partial<Parameters<typeof checkArticle>[0]> = {}) {
  const content = [
    `Choosing a coffee grinder starts here. ${paragraph(100)}`,
    "## How a coffee grinder works",
    paragraph(140),
    "## Burr or blade",
    `${paragraph(140)} A burr grinder beats a cheap grinder. See [our guide](https://www.example.com/guide).`,
    "## Cleaning",
    paragraph(140),
    "## Buying advice",
    paragraph(140),
    paragraph(140),
    paragraph(140),
  ].join("\n\n");
  return checkArticle({
    title: "How to Choose a Coffee Grinder for Home",
    content,
    metaDescription:
      "How to choose a coffee grinder for home: burr or blade, what to spend, and how to keep it clean so every cup tastes right.",
    keyword: "Coffee  grinder",
    brief: [
      "- **Target length:** about 1,000 words",
      "",
      "## Related searches",
      "- burr grinder",
      "- cheap grinder",
      "- grinder settings",
      "",
      "## Must include",
    ].join("\n"),
    domain: "example.com",
    otherTitles: [],
    ...overrides,
  });
}

const failed = (result: ReturnType<typeof checkArticle>) =>
  result.checks.filter((check) => !check.passed).map((check) => check.id);

describe("checkArticle", () => {
  it("scores 10 when every rule passes", () => {
    const result = article();
    expect(failed(result)).toEqual([]);
    expect(result.score).toBe(10);
  });

  it("rejects leftover placeholders and model chatter", () => {
    expect(
      failed(article({ title: "Coffee Grinder Guide [INSERT YEAR] Edition" })),
    ).toContain("no_placeholders");
    expect(
      failed(article({ content: "As an AI language model, I can't." })),
    ).toContain("no_placeholders");
  });

  it("rejects typical AI phrases, so articles read as human-written", () => {
    expect(
      failed(article({ title: "Let's Dive Into the Coffee Grinder Basics" })),
    ).toEqual(["human_voice"]);
    expect(
      failed(
        article({ metaDescription: "", content: "Grind fresh — always." }),
      ),
    ).toContain("human_voice");
  });

  it("rejects keyword stuffing", () => {
    const stuffed = `Coffee grinder ${paragraph(20)} coffee grinder coffee grinder.`;
    expect(failed(article({ content: stuffed }))).toContain("keyword_density");
  });

  it("holds the article to the brief's target length", () => {
    const brief = [
      "- **Target length:** about 2,000 words",
      "",
      "## Related searches",
      "- grinder for espresso",
      "- quiet grinder",
    ].join("\n");
    expect(failed(article({ brief }))).toEqual(["word_count"]);
  });

  it("requires a link to the project's own site", () => {
    expect(failed(article({ domain: "other.com" }))).toEqual(["internal_link"]);
    expect(failed(article({ domain: null }))).toEqual(["internal_link"]);
  });

  it("flags a title another article already uses, ignoring case", () => {
    expect(
      failed(
        article({ otherTitles: ["how to choose a coffee grinder  for home"] }),
      ),
    ).toEqual(["unique_title"]);
  });
});

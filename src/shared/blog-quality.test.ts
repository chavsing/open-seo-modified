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
    `${paragraph(140)} See [our guide](https://www.example.com/guide).`,
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
    keyword: "Coffee  grinder",
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

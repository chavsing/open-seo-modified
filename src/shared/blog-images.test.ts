import { describe, expect, it } from "vitest";
import {
  articleWords,
  blogImageIdsIn,
  blogImageUrl,
  insertSectionImage,
  markdownSections,
  replaceBlogImageLinks,
} from "./blog-images";

const PROJECT = "11111111-1111-4111-8111-111111111111";
const IMAGE = "22222222-2222-4222-8222-222222222222";
const article =
  "Intro.\n\n## Grind size\n\nMedium coarse.\n\n## Water\n\nJust off the boil.";

describe("article pictures in Markdown", () => {
  it("puts a section picture under its own heading", () => {
    const markdown = insertSectionImage(article, 1, {
      alt: "A kettle [pouring]",
      url: blogImageUrl(PROJECT, IMAGE),
    });

    expect(markdown).toContain(
      `## Water\n\n![A kettle pouring](${blogImageUrl(PROJECT, IMAGE)})\n\nJust off the boil.`,
    );
    expect(markdownSections(markdown).map((s) => s.hasImage)).toEqual([
      false,
      true,
    ]);
  });

  it("swaps app picture links for WordPress ones, even HTML-escaped", () => {
    const escaped = `![Kettle](/api/blog-image?projectId=${PROJECT}&amp;id=${IMAGE})`;
    const other = `![Other](/api/blog-image?projectId=${PROJECT}&id=${PROJECT})`;

    expect(blogImageIdsIn(`${escaped}\n${other}`)).toEqual([IMAGE, PROJECT]);
    expect(
      replaceBlogImageLinks(`${escaped}\n${other}`, (id) =>
        id === IMAGE ? "https://acme.com/kettle.jpg" : undefined,
      ),
    ).toBe(`![Kettle](https://acme.com/kettle.jpg)\n${other}`);
  });

  it("treats formatting and pictures as no change to the words", () => {
    const formatted =
      "## Grind **size**\n\n![Burr](/x.jpg)\n\n- *Medium* [coarse](https://acme.com).";

    expect(articleWords(formatted)).toBe(
      articleWords("Grind size\n\nMedium coarse."),
    );
    expect(articleWords(formatted)).not.toBe(articleWords("Grind size. Fine."));
  });
});

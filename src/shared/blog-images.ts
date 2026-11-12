// Article pictures live in the Markdown as ordinary image links to the app,
// e.g. ![alt](/api/blog-image?projectId=...&id=...). Sending to WordPress
// swaps each link for the picture's WordPress media URL.

const BLOG_IMAGE_PATH = "/api/blog-image";

// Kept small: a style example only needs to show colour and mood.
export const MAX_REFERENCE_IMAGE_BYTES = 4 * 1024 * 1024;

export function blogImageUrl(projectId: string, imageId: string) {
  return `${BLOG_IMAGE_PATH}?projectId=${projectId}&id=${imageId}`;
}

const IMAGE_LINK =
  /!\[([^\]]*)\]\(\/api\/blog-image\?projectId=[0-9a-f-]{36}&(?:amp;)?id=([0-9a-f-]{36})\)/g;

/** The ids of the app pictures the Markdown shows, in order. */
export function blogImageIdsIn(markdown: string): string[] {
  return [...markdown.matchAll(IMAGE_LINK)].map((match) => match[2]);
}

/** Replaces each app picture link through `urlFor`; unknown ids stay. */
export function replaceBlogImageLinks(
  markdown: string,
  urlFor: (imageId: string) => string | undefined,
): string {
  return markdown.replace(IMAGE_LINK, (link, alt: string, id: string) => {
    const url = urlFor(id);
    return url ? `![${alt}](${url})` : link;
  });
}

/** The Markdown without any pictures, for comparing and reviewing text. */
export function withoutImages(markdown: string): string {
  return markdown
    .replace(/!\[[^\]]*\]\([^)]*\)/g, "")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

const wordCount = (text: string) =>
  text.match(/[\p{L}\p{N}][\p{L}\p{N}'’-]*/gu)?.length ?? 0;

export type MarkdownSection = {
  /** Position among the article's ## headings. */
  index: number;
  heading: string;
  /** The section's own text, up to the next ## heading. */
  body: string;
  words: number;
  hasImage: boolean;
};

/** The article's ## sections, for choosing which get a picture. */
export function markdownSections(markdown: string): MarkdownSection[] {
  const lines = markdown.split("\n");
  const sections: MarkdownSection[] = [];
  let current: { heading: string; body: string[] } | null = null;
  const close = () => {
    if (!current) return;
    const body = current.body.join("\n");
    sections.push({
      index: sections.length,
      heading: current.heading,
      body: withoutImages(body),
      words: wordCount(withoutImages(body)),
      hasImage: /!\[[^\]]*\]\([^)]*\)/.test(body),
    });
  };
  for (const line of lines) {
    const heading = /^##\s+(.+)$/.exec(line);
    if (heading) {
      close();
      current = { heading: heading[1].trim(), body: [] };
    } else if (/^#\s/.test(line)) {
      close();
      current = null;
    } else current?.body.push(line);
  }
  close();
  return sections;
}

/** Puts a picture right under the section's ## heading. */
export function insertSectionImage(
  markdown: string,
  sectionIndex: number,
  image: { alt: string; url: string },
): string {
  const lines = markdown.split("\n");
  let seen = -1;
  const at = lines.findIndex(
    (line) => /^##\s+/.test(line) && ++seen === sectionIndex,
  );
  if (at === -1) return markdown;
  const alt = image.alt.replace(/[[\]]/g, "");
  lines.splice(at + 1, 0, "", `![${alt}](${image.url})`);
  return lines.join("\n");
}

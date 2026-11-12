import { env } from "cloudflare:workers";
import type { BillingCustomerContext } from "@/server/billing/subscription";
import {
  BlogImageRepository,
  type BlogImage,
} from "@/server/features/blog/repositories/BlogImageRepository";
import { BlogRepository } from "@/server/features/blog/repositories/BlogRepository";
import { createArticleImage } from "@/server/features/blog/services/blogImages";
import {
  uploadWordpressMedia,
  type WordpressConnection,
} from "@/server/features/blog/services/wordpressClient";
import {
  blogImageIdsIn,
  insertSectionImage,
  markdownSections,
  replaceBlogImageLinks,
} from "@/shared/blog-images";

// Automatic articles get a header picture and pictures for their longest
// sections. Short sections read fine without one.
const AUTO_SECTION_IMAGES = 2;
const MIN_SECTION_WORDS = 40;

function filename(image: BlogImage) {
  const slug =
    image.alt
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/^-|-$/g, "")
      .slice(0, 60) || "picture";
  const extension = image.r2Key.split(".").pop() ?? "jpg";
  return `${slug}-${image.id.slice(0, 8)}.${extension}`;
}

/** The picture's URL on this WordPress site, uploading it the first time. */
async function wordpressUrlFor(
  connection: WordpressConnection,
  image: BlogImage,
) {
  if (
    image.wordpressSite === connection.siteUrl &&
    image.wordpressMediaId &&
    image.wordpressUrl
  )
    return { id: image.wordpressMediaId, url: image.wordpressUrl };
  const object = await env.R2.get(image.r2Key);
  // A missing file leaves the app link; the send still goes through.
  if (!object) return null;
  const media = await uploadWordpressMedia(connection, {
    bytes: new Uint8Array(await object.arrayBuffer()),
    mediaType: image.mediaType,
    filename: filename(image),
    alt: image.alt,
  });
  await BlogImageRepository.setWordpressMedia(image.projectId, image.id, {
    site: connection.siteUrl,
    mediaId: media.id,
    url: media.url,
  });
  return media;
}

/**
 * Uploads the article's pictures to WordPress (once per site) and returns the
 * Markdown with each picture pointing at its WordPress copy, each copy's
 * media id by URL, and the header picture's media id for the post.
 */
export async function prepareWordpressImages(
  connection: WordpressConnection,
  projectId: string,
  articleId: string,
  markdown: string,
): Promise<{
  markdown: string;
  mediaIds: Map<string, number>;
  featuredMedia: number | null;
}> {
  const rows = await BlogImageRepository.listArticleImages(
    projectId,
    articleId,
  );
  const byId = new Map(rows.map((row) => [row.id, row]));
  const urls = new Map<string, string>();
  const mediaIds = new Map<string, number>();
  for (const id of new Set(blogImageIdsIn(markdown))) {
    // A picture copied from another article of the same project still works.
    const image =
      byId.get(id) ?? (await BlogImageRepository.getImage(projectId, id));
    if (!image) continue;
    const media = await wordpressUrlFor(connection, image);
    if (!media) continue;
    urls.set(id, media.url);
    mediaIds.set(media.url, media.id);
  }
  const featured = rows.find((row) => row.kind === "featured");
  const featuredMedia = featured
    ? ((await wordpressUrlFor(connection, featured))?.id ?? null)
    : null;
  return {
    markdown: replaceBlogImageLinks(markdown, (id) => urls.get(id)),
    mediaIds,
    featuredMedia,
  };
}

/**
 * Adds a header picture and pictures for the longest sections to a freshly
 * written automatic article. A picture that fails is skipped and counted as
 * missing; the caller decides whether the article can still go live.
 */
export async function addAutopilotImages(
  projectId: string,
  articleId: string,
  customer: BillingCustomerContext,
): Promise<{ added: number; missing: number }> {
  const article = await BlogRepository.getArticle(projectId, articleId);
  if (!article?.content) return { added: 0, missing: 1 };
  const candidates = markdownSections(article.content).filter(
    (section) => !section.hasImage && section.words >= MIN_SECTION_WORDS,
  );
  candidates.sort((a, b) => b.words - a.words);
  const sections = candidates.slice(0, AUTO_SECTION_IMAGES);
  const [featured, ...pictures] = await Promise.allSettled([
    createArticleImage(projectId, { articleId, kind: "featured" }, customer),
    ...sections.map((section) =>
      createArticleImage(
        projectId,
        {
          articleId,
          kind: "section",
          heading: section.heading,
          context: section.body,
        },
        customer,
      ),
    ),
  ]);
  // Re-read: the text is only changed by adding the pictures to it.
  const current = await BlogRepository.getArticle(projectId, articleId);
  let content = current?.content ?? null;
  let added = featured.status === "fulfilled" ? 1 : 0;
  pictures.forEach((result, i) => {
    if (result.status !== "fulfilled" || !content) return;
    content = insertSectionImage(content, sections[i].index, result.value);
    added += 1;
  });
  if (content && content !== current?.content)
    await BlogRepository.updateArticle(projectId, articleId, { content });
  return { added, missing: 1 + sections.length - added };
}

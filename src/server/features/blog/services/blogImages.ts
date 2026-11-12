import { env } from "cloudflare:workers";
import { z } from "zod";
import { resolveUserContextFromHeaders } from "@/middleware/ensure-user/resolve";
import {
  billResearchSpend,
  type ResearchSpend,
} from "@/server/billing/researchSpend";
import {
  checkUsageCreditsDepleted,
  type BillingCustomerContext,
} from "@/server/billing/subscription";
import { BlogImageRepository } from "@/server/features/blog/repositories/BlogImageRepository";
import { BlogRepository } from "@/server/features/blog/repositories/BlogRepository";
import {
  featuredImagePrompt,
  generateImage,
  sectionImagePrompt,
} from "@/server/features/blog/services/blogImageGeneration";
import { ProjectRepository } from "@/server/features/projects/repositories/ProjectRepository";
import { AppError } from "@/server/lib/errors";
import { requireOpenRouterApiKey } from "@/server/lib/openrouter";
import { isHostedServerAuthMode } from "@/server/lib/runtime-env";
import { blogImageUrl, MAX_REFERENCE_IMAGE_BYTES } from "@/shared/blog-images";

// Pictures are stored in R2 under blog-images/<project>/<article>/, so
// deleting an article or a project can remove its files by prefix.

const EXTENSIONS: Record<string, string> = {
  "image/jpeg": "jpg",
  "image/png": "png",
  "image/webp": "webp",
};

type BlogImageView = { id: string; url: string; alt: string };

const articlePrefix = (projectId: string, articleId: string) =>
  `blog-images/${projectId}/${articleId}/`;

function toView(row: { id: string; projectId: string; alt: string }) {
  return { id: row.id, url: blogImageUrl(row.projectId, row.id), alt: row.alt };
}

function toBase64(bytes: Uint8Array) {
  let binary = "";
  for (let i = 0; i < bytes.length; i += 0x8000)
    binary += String.fromCharCode(...bytes.subarray(i, i + 0x8000));
  return btoa(binary);
}

async function requireArticle(projectId: string, articleId: string) {
  const article = await BlogRepository.getArticle(projectId, articleId);
  if (!article)
    throw new AppError("NOT_FOUND", "That article no longer exists.");
  return article;
}

async function storeImage(input: {
  projectId: string;
  articleId: string;
  kind: "featured" | "section" | "reference";
  bytes: Uint8Array;
  mediaType: string;
  alt: string;
}) {
  const id = crypto.randomUUID();
  const r2Key = `${articlePrefix(input.projectId, input.articleId)}${id}.${EXTENSIONS[input.mediaType] ?? "img"}`;
  await env.R2.put(r2Key, input.bytes, {
    httpMetadata: { contentType: input.mediaType },
  });
  const row = {
    id,
    projectId: input.projectId,
    articleId: input.articleId,
    kind: input.kind,
    r2Key,
    mediaType: input.mediaType,
    alt: input.alt,
    wordpressSite: null,
    wordpressMediaId: null,
    wordpressUrl: null,
    createdAt: new Date().toISOString(),
  };
  await BlogImageRepository.insertImage(row);
  return row;
}

/** Drops the article's other images of this kind; one header, one reference. */
async function replaceOthers(
  projectId: string,
  articleId: string,
  kind: "featured" | "reference",
  keepId: string,
) {
  const stale = (
    await BlogImageRepository.listArticleImages(projectId, articleId)
  ).filter((row) => row.kind === kind && row.id !== keepId);
  if (!stale.length) return;
  await BlogImageRepository.deleteImages(
    projectId,
    stale.map((row) => row.id),
  );
  await env.R2.delete(stale.map((row) => row.r2Key));
}

async function referenceDataUrl(projectId: string, articleId: string) {
  const reference = (
    await BlogImageRepository.listArticleImages(projectId, articleId)
  ).find((row) => row.kind === "reference");
  if (!reference) return null;
  const object = await env.R2.get(reference.r2Key);
  if (!object) return null;
  const bytes = new Uint8Array(await object.arrayBuffer());
  return `data:${reference.mediaType};base64,${toBase64(bytes)}`;
}

/** The OpenRouter key, after the same credit check as article writing. */
async function admitImageSpend(customer: BillingCustomerContext) {
  const apiKey = await requireOpenRouterApiKey();
  if (
    (await isHostedServerAuthMode()) &&
    (await checkUsageCreditsDepleted(customer)).depleted
  )
    throw new AppError(
      "INSUFFICIENT_CREDITS",
      "You need usage credits to create pictures with AI.",
    );
  return apiKey;
}

/**
 * Creates the article's header picture, or a picture for one section from its
 * heading and text (sent by the editor, which may hold unsaved text). A new
 * header replaces the old one. Billed at what OpenRouter charged.
 */
export async function createArticleImage(
  projectId: string,
  input: {
    articleId: string;
    kind: "featured" | "section";
    heading?: string;
    context?: string;
    customPrompt?: string;
  },
  customer: BillingCustomerContext,
): Promise<BlogImageView> {
  const article = await requireArticle(projectId, input.articleId);
  const apiKey = await admitImageSpend(customer);
  const prompt =
    input.kind === "featured"
      ? featuredImagePrompt({
          title: article.title,
          keyword: article.keyword,
          customPrompt: input.customPrompt?.trim() || null,
        })
      : sectionImagePrompt({
          title: article.title,
          heading: input.heading ?? article.title,
          context: input.context ?? "",
        });
  const spend: ResearchSpend[] = [];
  let image;
  try {
    image = await generateImage(
      apiKey,
      prompt,
      await referenceDataUrl(projectId, article.id),
    );
    spend.push({
      provider: "openrouter",
      creditFeature: "agent",
      operation: `blog_image_${input.kind}`,
      costUsd: image.costUsd,
    });
  } finally {
    await billResearchSpend(customer, spend);
  }
  const row = await storeImage({
    projectId,
    articleId: article.id,
    kind: input.kind,
    bytes: image.bytes,
    mediaType: image.mediaType,
    alt: input.kind === "featured" ? article.title : (input.heading ?? ""),
  });
  if (input.kind === "featured")
    await replaceOthers(projectId, article.id, "featured", row.id);
  return toView(row);
}

/** Saves a person's style example for the article's pictures. */
export async function setReferenceImage(
  projectId: string,
  input: { articleId: string; mediaType: string; base64: string },
): Promise<BlogImageView> {
  const article = await requireArticle(projectId, input.articleId);
  if (!EXTENSIONS[input.mediaType])
    throw new AppError(
      "VALIDATION_ERROR",
      "Use a JPEG, PNG or WebP picture as the style example.",
    );
  let bytes: Uint8Array;
  try {
    bytes = Uint8Array.from(atob(input.base64), (char) => char.charCodeAt(0));
  } catch {
    throw new AppError("VALIDATION_ERROR", "That picture couldn't be read.");
  }
  if (bytes.length > MAX_REFERENCE_IMAGE_BYTES)
    throw new AppError(
      "VALIDATION_ERROR",
      "Use a picture under 4 MB as the style example.",
    );
  const row = await storeImage({
    projectId,
    articleId: article.id,
    kind: "reference",
    bytes,
    mediaType: input.mediaType,
    alt: "Style example",
  });
  await replaceOthers(projectId, article.id, "reference", row.id);
  return toView(row);
}

/** Removes the header picture or the style example. Body pictures are
 *  removed by deleting them from the text. */
export async function removeArticleImage(
  projectId: string,
  input: { articleId: string; imageId: string },
) {
  const row = await BlogImageRepository.getImage(projectId, input.imageId);
  if (!row || row.articleId !== input.articleId || row.kind === "section")
    throw new AppError("NOT_FOUND", "That picture no longer exists.");
  await BlogImageRepository.deleteImages(projectId, [row.id]);
  await env.R2.delete(row.r2Key);
}

/** The header picture and style example shown beside the editor. */
export async function articleImageViews(projectId: string, articleId: string) {
  const rows = await BlogImageRepository.listArticleImages(
    projectId,
    articleId,
  );
  const pick = (kind: "featured" | "reference") => {
    const row = rows.find((item) => item.kind === kind);
    return row ? toView(row) : null;
  };
  return { featuredImage: pick("featured"), referenceImage: pick("reference") };
}

async function deletePrefix(bucket: R2Bucket, prefix: string) {
  let cursor: string | undefined;
  let deleted = 0;
  do {
    const page = await bucket.list({ prefix, cursor });
    const keys = page.objects.map((object) => object.key);
    if (keys.length) await bucket.delete(keys);
    deleted += keys.length;
    cursor = page.truncated ? page.cursor : undefined;
  } while (cursor);
  return deleted;
}

/** The article's picture files; its rows go with the article by cascade. */
export function deleteArticleImageFiles(projectId: string, articleId: string) {
  return deletePrefix(env.R2, articlePrefix(projectId, articleId));
}

/** Every picture of a project, for erasing an account's data. */
export function deleteProjectBlogImages(bucket: R2Bucket, projectId: string) {
  return deletePrefix(bucket, `blog-images/${projectId}/`);
}

/** GET /api/blog-image: serves a picture to members of its project. */
export async function handleBlogImageRequest(
  request: Request,
): Promise<Response> {
  if (request.method !== "GET")
    return new Response("Method not allowed", { status: 405 });
  const url = new URL(request.url);
  const projectId = z
    .string()
    .uuid()
    .safeParse(url.searchParams.get("projectId"));
  const imageId = z.string().uuid().safeParse(url.searchParams.get("id"));
  if (!projectId.success || !imageId.success)
    return new Response("Not found", { status: 404 });
  let auth;
  try {
    auth = await resolveUserContextFromHeaders(request.headers);
  } catch {
    return new Response("Unauthorized", { status: 401 });
  }
  const project = await ProjectRepository.getProjectForOrganization(
    projectId.data,
    auth.organizationId,
  );
  if (!project) return new Response("Not found", { status: 404 });
  const row = await BlogImageRepository.getImage(project.id, imageId.data);
  const object = row ? await env.R2.get(row.r2Key) : null;
  if (!row || !object) return new Response("Not found", { status: 404 });
  return new Response(object.body, {
    headers: {
      "Content-Type": row.mediaType,
      // A picture never changes under its id.
      "Cache-Control": "private, max-age=31536000, immutable",
      "X-Content-Type-Options": "nosniff",
    },
  });
}

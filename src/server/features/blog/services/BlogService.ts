import { symmetricDecrypt, symmetricEncrypt } from "better-auth/crypto";
import { BlogRepository } from "@/server/features/blog/repositories/BlogRepository";
import {
  saveWordpressPost,
  verifyWordpressLogin,
  type WordpressConnection,
} from "@/server/features/blog/services/wordpressClient";
import { markdownToHtml } from "@/server/features/blog/services/markdownToHtml";
import { normalizeAndValidateStartUrl } from "@/server/lib/audit/url-policy";
import { AppError } from "@/server/lib/errors";
import { getOptionalEnvValue } from "@/server/lib/runtime-env";
import { checkArticle } from "@/shared/blog-quality";
import type { EnsuredProject } from "@/middleware/ensure-user/types";
import type {
  ConnectWordpress,
  UpdateBlogSettings,
} from "@/types/schemas/blog";

async function getEncryptionKey(): Promise<string> {
  const secret = await getOptionalEnvValue("BETTER_AUTH_SECRET");
  if (!secret)
    throw new AppError(
      "AUTH_CONFIG_MISSING",
      "BETTER_AUTH_SECRET must be set to store WordPress logins.",
    );
  return secret;
}

/**
 * Runs the SSRF guard on every use, not just when saved: DNS can change after
 * the connection is stored. Plain http is refused because Basic auth would
 * send the application password readable on the wire.
 */
async function validateSiteUrl(input: string): Promise<string> {
  let url: string;
  try {
    url = await normalizeAndValidateStartUrl(input);
  } catch {
    throw new AppError(
      "VALIDATION_ERROR",
      "Enter your WordPress site's public address, like https://example.com.",
    );
  }
  const parsed = new URL(url);
  if (parsed.protocol !== "https:")
    throw new AppError(
      "VALIDATION_ERROR",
      "Your site must use https:// so the password is sent encrypted.",
    );
  parsed.search = "";
  return parsed.toString();
}

async function openConnection(projectId: string): Promise<WordpressConnection> {
  const settings = await BlogRepository.getSettings(projectId);
  if (
    !settings?.wordpressUrl ||
    !settings.wordpressUsername ||
    !settings.wordpressPassword
  )
    throw new AppError(
      "VALIDATION_ERROR",
      "Connect your WordPress site in the blog settings first.",
    );
  let password: string;
  try {
    password = await symmetricDecrypt({
      key: await getEncryptionKey(),
      data: settings.wordpressPassword,
    });
  } catch {
    throw new AppError(
      "VALIDATION_ERROR",
      "The saved WordPress password can't be read anymore. Connect WordPress again.",
    );
  }
  return {
    siteUrl: await validateSiteUrl(settings.wordpressUrl),
    username: settings.wordpressUsername,
    password,
  };
}

/** Settings as the client sees them: never the password. */
async function getSettings(projectId: string) {
  const settings = await BlogRepository.getSettings(projectId);
  return {
    publishMode: settings?.publishMode ?? "draft",
    postsPerWeek: settings?.postsPerWeek ?? 0,
    nextPostAt: settings?.nextPostAt ?? null,
    lastRunAt: settings?.lastRunAt ?? null,
    lastRunMessage: settings?.lastRunMessage ?? null,
    wordpress:
      settings?.wordpressUrl && settings.wordpressUsername
        ? { url: settings.wordpressUrl, username: settings.wordpressUsername }
        : null,
  };
}

async function updateSettings(projectId: string, input: UpdateBlogSettings) {
  let nextPostAt: string | null | undefined;
  if (input.postsPerWeek === 0) nextPostAt = null;
  else if (input.postsPerWeek !== undefined) {
    // Switching on starts the first article at the next run; changing the
    // pace keeps the date already set.
    const current = await BlogRepository.getSettings(projectId);
    if (!current?.nextPostAt) nextPostAt = new Date().toISOString();
  }
  await BlogRepository.upsertSettings(projectId, {
    ...input,
    ...(nextPostAt !== undefined ? { nextPostAt } : {}),
  });
  return getSettings(projectId);
}

/**
 * The client only receives error codes, and one code can't tell a wrong
 * password from a wrong address or a blocked API. So the reasons WordPress
 * refuses come back as a result, in our own wording; anything else still throws.
 */
function wordpressRefusal(error: unknown) {
  if (
    error instanceof AppError &&
    (error.code === "VALIDATION_ERROR" || error.code === "UPSTREAM_UNAVAILABLE")
  )
    return { ok: false as const, message: error.message };
  throw error;
}

/** Saves the login only after WordPress accepts it. */
async function connectWordpress(projectId: string, input: ConnectWordpress) {
  try {
    const connection = {
      siteUrl: await validateSiteUrl(input.url),
      username: input.username.trim(),
      // WordPress shows application passwords in groups of four; either form works.
      password: input.password.replace(/\s+/g, ""),
    };
    const user = await verifyWordpressLogin(connection);
    await BlogRepository.upsertSettings(projectId, {
      wordpressUrl: connection.siteUrl,
      wordpressUsername: connection.username,
      wordpressPassword: await symmetricEncrypt({
        key: await getEncryptionKey(),
        data: connection.password,
      }),
    });
    return { ok: true as const, name: user.name };
  } catch (error) {
    return wordpressRefusal(error);
  }
}

async function testWordpress(projectId: string) {
  try {
    const user = await verifyWordpressLogin(await openConnection(projectId));
    return { ok: true as const, name: user.name };
  } catch (error) {
    return wordpressRefusal(error);
  }
}

async function disconnectWordpress(projectId: string) {
  await BlogRepository.upsertSettings(projectId, {
    wordpressUrl: null,
    wordpressUsername: null,
    wordpressPassword: null,
  });
}

async function setTopicSkipped(
  projectId: string,
  topicId: string,
  skipped: boolean,
) {
  const topic = await BlogRepository.getTopic(projectId, topicId);
  if (!topic) throw new AppError("NOT_FOUND");
  // A used topic belongs to an article; it isn't toggled from here.
  if (topic.status === "used") return;
  await BlogRepository.setTopicStatus(
    projectId,
    topicId,
    skipped ? "skipped" : "idea",
  );
}

async function requireArticle(projectId: string, articleId: string) {
  const article = await BlogRepository.getArticle(projectId, articleId);
  if (!article)
    throw new AppError("NOT_FOUND", "That article no longer exists.");
  return article;
}

async function qualityFor(
  project: EnsuredProject,
  article: { id: string; title: string; content: string; keyword: string },
) {
  return checkArticle({
    title: article.title,
    content: article.content,
    keyword: article.keyword,
    domain: project.domain,
    otherTitles: await BlogRepository.listOtherTitles(project.id, article.id),
  });
}

async function getArticle(project: EnsuredProject, articleId: string) {
  const article = await requireArticle(project.id, articleId);
  return {
    ...article,
    projectDomain: project.domain,
    otherTitles: await BlogRepository.listOtherTitles(project.id, article.id),
  };
}

async function updateArticle(
  projectId: string,
  input: { articleId: string; title: string; content: string },
) {
  const article = await requireArticle(projectId, input.articleId);
  const hasContent = input.content.trim().length > 0;
  const title = input.title.trim();
  const content = hasContent ? input.content : null;
  const changed = title !== article.title || content !== article.content;
  await BlogRepository.updateArticle(projectId, article.id, {
    title,
    content,
    // The AI score was for the old text; it needs reviewing again.
    ...(changed ? { aiScore: null, aiFeedback: null } : {}),
    // Editing doesn't change what's on WordPress until it's sent again.
    status:
      article.status === "brief" || article.status === "ready"
        ? hasContent
          ? "ready"
          : "brief"
        : article.status,
  });
}

async function deleteArticle(projectId: string, articleId: string) {
  const article = await requireArticle(projectId, articleId);
  await BlogRepository.deleteArticle(projectId, article.id);
  // Its topic becomes an idea again, so it can be briefed afresh.
  if (article.topicId)
    await BlogRepository.setTopicStatus(projectId, article.topicId, "idea");
}

/**
 * Sends the article to WordPress as a draft or live post. Re-sending updates
 * the same post. Going live needs every quality check to pass; a person can
 * still send a draft and publish it from WordPress.
 */
async function sendToWordpress(
  project: EnsuredProject,
  input: { articleId: string; publish: boolean },
) {
  const article = await requireArticle(project.id, input.articleId);
  if (!article.content?.trim())
    throw new AppError(
      "VALIDATION_ERROR",
      "Write the article before sending it.",
    );
  if (input.publish) {
    const quality = await qualityFor(project, {
      ...article,
      content: article.content,
    });
    if (quality.passed < quality.total)
      throw new AppError(
        "VALIDATION_ERROR",
        `Fix the ${quality.total - quality.passed} failing quality checks before publishing, or send it as a draft.`,
      );
    if (article.aiScore !== 10)
      throw new AppError(
        "VALIDATION_ERROR",
        "Publishing needs a 10/10 AI review of the current text. Review it with AI, or send it as a draft.",
      );
  }
  try {
    // Inside the try, so a missing or broken connection is recorded too.
    const connection = await openConnection(project.id);
    const post = await saveWordpressPost(connection, {
      postId: article.wordpressPostId,
      title: article.title,
      html: markdownToHtml(article.content),
      status: input.publish ? "publish" : "draft",
    });
    const live = post.status === "publish";
    await BlogRepository.updateArticle(project.id, article.id, {
      status: live ? "published" : "wp_draft",
      wordpressPostId: post.id,
      wordpressLink: post.link,
      error: null,
      publishedAt: live
        ? (article.publishedAt ?? new Date().toISOString())
        : null,
    });
    return { status: post.status, link: post.link };
  } catch (error) {
    await BlogRepository.updateArticle(project.id, article.id, {
      error:
        error instanceof AppError
          ? error.message
          : "Sending to WordPress failed.",
    });
    throw error;
  }
}

export const BlogService = {
  getSettings,
  updateSettings,
  connectWordpress,
  testWordpress,
  disconnectWordpress,
  listTopics: BlogRepository.listTopics,
  setTopicSkipped,
  listArticles: BlogRepository.listArticles,
  getArticle,
  updateArticle,
  deleteArticle,
  sendToWordpress,
} as const;

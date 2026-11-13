import { BlogArticleExtrasRepository } from "@/server/features/blog/repositories/BlogArticleExtrasRepository";
import { BlogRepository } from "@/server/features/blog/repositories/BlogRepository";
import { AppError } from "@/server/lib/errors";
import { articleWords } from "@/shared/blog-images";

// Autosave writes over the article seconds after each edit, so the text from
// before an editing session is kept here. Saves within EDIT_SESSION_MS of the
// last kept version belong to the same session and keep nothing new; an AI
// rewrite always keeps the text it replaces.
const EDIT_SESSION_MS = 10 * 60_000;
const KEEP_VERSIONS = 30;

type ArticleText = {
  title: string;
  content: string | null;
  metaDescription: string | null;
  aiScore: number | null;
  aiFeedback: string | null;
  aiSuggestions: string | null;
};

/**
 * Keeps `before`, the article as it is about to be replaced. `edit` skips it
 * when this editing session already kept one; `ai` always keeps it.
 */
export async function keepVersion(
  projectId: string,
  articleId: string,
  before: ArticleText,
  source: "edit" | "ai",
) {
  if (!before.content?.trim()) return;
  const versions = await BlogArticleExtrasRepository.listVersions(
    projectId,
    articleId,
  );
  const latest = versions[0];
  const same =
    latest &&
    latest.title === before.title &&
    latest.content === before.content &&
    latest.metaDescription === before.metaDescription;
  if (same) return;
  if (
    source === "edit" &&
    latest &&
    Date.now() - Date.parse(latest.createdAt) < EDIT_SESSION_MS
  )
    return;
  await BlogArticleExtrasRepository.insertVersion({
    id: crypto.randomUUID(),
    projectId,
    articleId,
    source,
    title: before.title,
    content: before.content,
    metaDescription: before.metaDescription,
    aiScore: before.aiScore,
    aiFeedback: before.aiFeedback,
    aiSuggestions: before.aiSuggestions,
    createdAt: new Date().toISOString(),
  });
  await BlogArticleExtrasRepository.deleteVersions(
    projectId,
    versions.slice(KEEP_VERSIONS - 1).map((version) => version.id),
  );
}

/** The kept versions, newest first, without their text. */
export async function listVersionSummaries(
  projectId: string,
  articleId: string,
) {
  const versions = await BlogArticleExtrasRepository.listVersions(
    projectId,
    articleId,
  );
  return versions.map((version) => ({
    id: version.id,
    source: version.source,
    title: version.title,
    words: version.content.split(/\s+/).filter(Boolean).length,
    excerpt: articleWords(version.content).slice(0, 200),
    createdAt: version.createdAt,
  }));
}

/**
 * Puts a kept version back as the article's text, keeping the current text
 * as a version first so the restore can itself be undone.
 */
export async function restoreVersion(
  projectId: string,
  articleId: string,
  versionId: string,
) {
  const [article, version] = await Promise.all([
    BlogRepository.getArticle(projectId, articleId),
    BlogArticleExtrasRepository.getVersion(projectId, articleId, versionId),
  ]);
  if (!article || !version)
    throw new AppError("NOT_FOUND", "That version no longer exists.");
  await keepVersion(projectId, articleId, article, "ai");
  // The version's own review comes back with its text. A version kept
  // without one keeps the current review only if the words are the same.
  const sameWords =
    version.title === article.title &&
    version.metaDescription === article.metaDescription &&
    articleWords(version.content) === articleWords(article.content ?? "");
  const review =
    version.aiScore !== null
      ? {
          aiScore: version.aiScore,
          aiFeedback: version.aiFeedback,
          aiSuggestions: version.aiSuggestions,
        }
      : sameWords
        ? {}
        : { aiScore: null, aiFeedback: null, aiSuggestions: null };
  await BlogRepository.updateArticle(projectId, articleId, {
    title: version.title,
    content: version.content,
    metaDescription: version.metaDescription,
    ...review,
    status: article.status === "brief" ? "ready" : article.status,
  });
  return {
    title: version.title,
    content: version.content,
    metaDescription: version.metaDescription ?? "",
  };
}

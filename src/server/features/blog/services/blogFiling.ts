import { BlogArticleExtrasRepository } from "@/server/features/blog/repositories/BlogArticleExtrasRepository";
import { BlogRepository } from "@/server/features/blog/repositories/BlogRepository";
import { BlogService } from "@/server/features/blog/services/BlogService";
import {
  listWordpressCategories,
  normalizeTags,
} from "@/server/features/blog/services/blogTaxonomy";
import { AppError } from "@/server/lib/errors";

// Where the post is filed on WordPress, as the person chooses it in the
// editor. AI writing picks a first choice (see blogWriting).

/** The connected site's categories, or none when it isn't connected. */
export async function listSiteCategories(projectId: string) {
  const settings = await BlogService.getSettings(projectId);
  if (!settings.wordpress) return [];
  return listWordpressCategories(await BlogService.openConnection(projectId));
}

export async function saveArticleFiling(
  projectId: string,
  input: {
    articleId: string;
    category: { id: number; name: string } | null;
    tags: string[];
  },
) {
  const article = await BlogRepository.getArticle(projectId, input.articleId);
  if (!article)
    throw new AppError("NOT_FOUND", "That article no longer exists.");
  await BlogRepository.updateArticle(projectId, article.id, {
    wordpressCategoryId: input.category?.id ?? null,
    wordpressCategoryName: input.category?.name ?? null,
  });
  await BlogArticleExtrasRepository.setTags(
    projectId,
    article.id,
    normalizeTags(input.tags),
  );
}

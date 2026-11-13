import { env } from "cloudflare:workers";
import {
  checkUsageCreditsDepleted,
  type BillingCustomerContext,
} from "@/server/billing/subscription";
import { BlogRepository } from "@/server/features/blog/repositories/BlogRepository";
import { BlogService } from "@/server/features/blog/services/BlogService";
import {
  listWordpressCategories,
  suggestArticleTaxonomy,
} from "@/server/features/blog/services/blogTaxonomy";
import { keepVersion } from "@/server/features/blog/services/blogVersions";
import { writeBlogArticle } from "@/server/features/blog/services/blogWriter";
import { ProjectRepository } from "@/server/features/projects/repositories/ProjectRepository";
import { AppError } from "@/server/lib/errors";
import { isHostedServerAuthMode } from "@/server/lib/runtime-env";
import { WRITING_STALE_MS } from "@/shared/blog-writing";

// Writing takes one to three minutes, longer than a page should wait or a
// request may live once the tab closes. So it runs as a background job, and
// the article page watches the article until the text arrives.

export type BlogWritePayload = {
  projectId: string;
  articleId: string;
  replace: boolean;
  customer: BillingCustomerContext;
};

/** Starts writing the article in the background. */
export async function startArticleWriting(
  projectId: string,
  input: { articleId: string; replace: boolean },
  customer: BillingCustomerContext,
) {
  const article = await BlogRepository.getArticle(projectId, input.articleId);
  if (!article)
    throw new AppError("NOT_FOUND", "That article no longer exists.");
  if (article.content?.trim() && !input.replace)
    throw new AppError(
      "CONFLICT",
      "This article already has text. Confirm to replace it.",
    );
  // Checked here too, so an empty balance says so now, not minutes later.
  if (
    (await isHostedServerAuthMode()) &&
    (await checkUsageCreditsDepleted(customer)).depleted
  )
    throw new AppError(
      "INSUFFICIENT_CREDITS",
      "You need usage credits to write articles with AI.",
    );
  const staleBefore = new Date(Date.now() - WRITING_STALE_MS).toISOString();
  if (!(await BlogRepository.claimWriting(projectId, article.id, staleBefore)))
    throw new AppError("CONFLICT", "This article is already being written.");
  try {
    await env.BLOG_WRITE_WORKFLOW.create({
      id: `blog-write-${article.id}-${Date.now()}`,
      // Only the billing fields: the request context is not serializable.
      params: {
        projectId,
        articleId: article.id,
        replace: input.replace,
        customer: {
          organizationId: customer.organizationId,
          userId: customer.userId,
          userEmail: customer.userEmail,
          projectId,
        },
      },
    });
  } catch (error) {
    await BlogRepository.updateArticle(projectId, article.id, {
      writingStartedAt: null,
    });
    throw error;
  }
}

/** Our own wording for why writing failed; never a raw error. */
function failureMessage(error: unknown) {
  if (error instanceof AppError) {
    if (error.code === "INSUFFICIENT_CREDITS")
      return "This account ran out of usage credits.";
    if (error.code === "UPSTREAM_UNAVAILABLE")
      return "AI writing isn't available right now. Please try again later.";
    if (error.message !== error.code) return error.message;
  }
  return "Something went wrong while writing. Please try again.";
}

/**
 * Category and tags from the site's list. Skipped without a working
 * WordPress connection; the person can still pick them by hand.
 */
export async function fileArticle(
  projectId: string,
  articleId: string,
  customer: BillingCustomerContext,
) {
  const settings = await BlogService.getSettings(projectId);
  const categories = settings.wordpress
    ? await BlogService.openConnection(projectId)
        .then(listWordpressCategories)
        .catch(() => [])
    : [];
  await suggestArticleTaxonomy(projectId, articleId, categories, customer);
}

/** The job's body: keeps the old text, writes, files it, then clears the mark. */
export async function runArticleWriting(payload: BlogWritePayload) {
  const { projectId, articleId, customer } = payload;
  try {
    const project = await ProjectRepository.getProjectForOrganization(
      projectId,
      customer.organizationId,
    );
    if (!project) throw new AppError("NOT_FOUND", "The project was removed.");
    const before = await BlogRepository.getArticle(projectId, articleId);
    if (!before) return;
    await keepVersion(projectId, articleId, before, "ai");
    await writeBlogArticle(
      project,
      { articleId, replace: payload.replace },
      customer,
    );
    await fileArticle(projectId, articleId, customer);
    await BlogRepository.updateArticle(projectId, articleId, {
      writingStartedAt: null,
      writeError: null,
    });
  } catch (error) {
    if (!(error instanceof AppError))
      console.error("[blog] background writing failed", { articleId, error });
    await BlogRepository.updateArticle(projectId, articleId, {
      writingStartedAt: null,
      writeError: failureMessage(error),
    });
  }
}

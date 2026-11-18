import { env } from "cloudflare:workers";
import {
  finalizeHold,
  reserveUsageCredits,
  type BillingCustomerContext,
  type UsageCreditHold,
} from "@/server/billing/subscription";
import { BlogRepository } from "@/server/features/blog/repositories/BlogRepository";
import { BlogService } from "@/server/features/blog/services/BlogService";
import { createBlogBrief } from "@/server/features/blog/services/blogResearch";
import type { EnsuredProject } from "@/middleware/ensure-user/types";
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
  /** Credits set aside while writing; missing on jobs started before. */
  holds?: UsageCreditHold[];
};

// Set aside when writing starts, above an article's usual 2 to 3 cents, so
// several articles started at once can't all pass on the same small balance
// and leave it below zero. The real cost is charged as each AI call finishes;
// the hold is returned when the job ends, or by the ledger's cleanup if the
// job dies.
const ARTICLE_HOLD_CREDITS = 50;

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
  const staleBefore = new Date(Date.now() - WRITING_STALE_MS).toISOString();
  if (!(await BlogRepository.claimWriting(projectId, article.id, staleBefore)))
    throw new AppError("CONFLICT", "This article is already being written.");
  let holds: UsageCreditHold[] = [];
  try {
    // Checked here too, so a short balance says so now, not minutes later.
    if (await isHostedServerAuthMode()) {
      holds = (
        await reserveUsageCredits({
          customer,
          customerId: customer.organizationId,
          callCredits: [ARTICLE_HOLD_CREDITS],
          creditFeature: "agent",
        })
      ).holds;
    }
    await env.BLOG_WRITE_WORKFLOW.create({
      id: `blog-write-${article.id}-${Date.now()}`,
      // Only the billing fields: the request context is not serializable.
      params: {
        projectId,
        articleId: article.id,
        replace: input.replace,
        holds,
        customer: {
          organizationId: customer.organizationId,
          userId: customer.userId,
          userEmail: customer.userEmail,
          projectId,
        },
      },
    });
  } catch (error) {
    await releaseHolds(holds);
    await BlogRepository.updateArticle(projectId, article.id, {
      writingStartedAt: null,
    });
    throw error;
  }
}

async function releaseHolds(holds: UsageCreditHold[] = []) {
  for (const hold of holds) await finalizeHold(hold, 0, {});
}

/**
 * Several topics at once: each gets its brief, then background writing. One
 * topic failing (no credits left, already being written) doesn't stop the
 * others, and each failure is named so the person knows what to retry.
 */
export async function startTopicsWriting(
  project: EnsuredProject,
  topicIds: string[],
  customer: BillingCustomerContext,
) {
  let started = 0;
  const failed: { topicId: string; message: string }[] = [];
  for (const topicId of new Set(topicIds)) {
    try {
      const { articleId } = await createBlogBrief(project, topicId, customer);
      await startArticleWriting(
        project.id,
        { articleId, replace: false },
        customer,
      );
      started += 1;
    } catch (error) {
      failed.push({ topicId, message: failureMessage(error) });
    }
  }
  return { started, failed };
}

/** Our own wording for why writing failed; never a raw error. */
function failureMessage(error: unknown) {
  if (error instanceof AppError) {
    if (error.code === "INSUFFICIENT_CREDITS")
      return "This account is out of usage credits.";
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
      {
        articleId,
        replace: payload.replace,
        creditsHeld: (payload.holds?.length ?? 0) > 0,
      },
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
  } finally {
    await releaseHolds(payload.holds);
  }
}

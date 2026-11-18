import { env } from "cloudflare:workers";
import {
  checkUsageCreditsDepleted,
  type BillingCustomerContext,
} from "@/server/billing/subscription";
import { ActivationRepository } from "@/server/features/activation/repositories/ActivationRepository";
import { ProjectContextRepository } from "@/server/features/project-context/repositories/ProjectContextRepository";
import { setUpFromWebsite } from "@/server/features/project-context/services/websiteSetup";
import { ProjectRepository } from "@/server/features/projects/repositories/ProjectRepository";
import { RankTrackingRepository } from "@/server/features/rank-tracking/repositories/RankTrackingRepository";
import { RankTrackingService } from "@/server/features/rank-tracking/services/RankTrackingService";
import type { EnsuredProject } from "@/middleware/ensure-user/types";
import { AppError } from "@/server/lib/errors";
import { isHostedServerAuthMode } from "@/server/lib/runtime-env";

// When a site is added, the app sets it up on its own: reads the website to
// fill in the Context page, finds competitors, researches blog topic ideas
// and starts tracking the searches customers use to find the business. It
// runs once per project, in the background, and the dashboard shows what it
// did. Costs about 10 to 20 cents of the customer's credits.

export type SiteSetupPayload = {
  projectId: string;
  customer: BillingCustomerContext;
};

// The draft offers 5 to 8 searches; all of them fit, checked weekly.
const TRACKED_KEYWORDS = 8;
// Matches the rank tracking dialog's default depth.
const SERP_DEPTH = 40;

/**
 * Starts the automatic setup for a site that was just added, unless it was
 * set up already (by hand or an earlier run) or the account has no credits.
 * Never throws: adding the site must not fail because of it.
 */
export async function startAutomaticSetup(
  project: { id: string; domain: string | null },
  customer: BillingCustomerContext,
) {
  try {
    if (!project.domain || !(await isHostedServerAuthMode())) return;
    const [sections, competitors] = await Promise.all([
      ProjectContextRepository.listSections(project.id),
      ProjectContextRepository.listCompetitors(project.id),
    ]);
    const hasOverview = sections.some(
      (row) => row.key === "business_overview" && row.content.trim(),
    );
    if (hasOverview || competitors.length) return;
    if ((await checkUsageCreditsDepleted(customer)).depleted) return;
    if (!(await ActivationRepository.claimAutoSetup(project.id))) return;
    try {
      await env.SITE_SETUP_WORKFLOW.create({
        id: `site-setup-${project.id}`,
        // Only the billing fields: the request context is not serializable.
        params: {
          projectId: project.id,
          customer: {
            organizationId: customer.organizationId,
            userId: customer.userId,
            userEmail: customer.userEmail,
            projectId: project.id,
          },
        },
      });
    } catch (error) {
      await ActivationRepository.finishAutoSetup(project.id, NOT_FINISHED);
      throw error;
    }
  } catch (error) {
    console.error("[setup] automatic setup didn't start", {
      projectId: project.id,
      error,
    });
  }
}

const NOT_FINISHED =
  "Automatic setup didn't finish. You can run it from the Context page with Set up from website.";

/** The background job's body. Records how it ended for the dashboard. */
export async function runAutomaticSetup(payload: SiteSetupPayload) {
  const { projectId, customer } = payload;
  let error: string | null = null;
  try {
    const project = await ProjectRepository.getProjectForOrganization(
      projectId,
      customer.organizationId,
    );
    if (!project) return;
    const result = await setUpFromWebsite(project, customer);
    // Rankings are a bonus: the rest of the setup stands without them.
    await startRankTracking(project, result.seedKeywords, customer).catch(
      (failure: unknown) =>
        console.error("[setup] rank tracking didn't start", {
          projectId,
          error: failure,
        }),
    );
  } catch (failure) {
    if (!(failure instanceof AppError))
      console.error("[setup] automatic setup failed", {
        projectId,
        error: failure,
      });
    error = failureMessage(failure);
  }
  await ActivationRepository.finishAutoSetup(projectId, error);
}

/** Our own wording for why setup stopped; never a raw error. */
function failureMessage(error: unknown) {
  if (error instanceof AppError) {
    if (error.code === "INSUFFICIENT_CREDITS")
      return "Automatic setup stopped because the account ran out of usage credits.";
    if (error.code === "VALIDATION_ERROR" && error.message !== error.code)
      return error.message;
  }
  return NOT_FINISHED;
}

async function startRankTracking(
  project: EnsuredProject,
  keywords: string[],
  customer: BillingCustomerContext,
) {
  if (!project.domain || keywords.length === 0) return;
  // Someone already set up tracking: leave it as they chose.
  if ((await RankTrackingRepository.getConfigsForProject(project.id)).length)
    return;
  const config = await RankTrackingService.createConfig({
    projectId: project.id,
    projectMarket: project,
    domain: project.domain,
    serpDepth: SERP_DEPTH,
  });
  const { addedIds } = await RankTrackingService.addKeywords(
    config.id,
    project.id,
    keywords.slice(0, TRACKED_KEYWORDS),
    { kind: "direct_user_action" },
  );
  if (addedIds.length === 0) return;
  try {
    await RankTrackingService.triggerAutoCheck({
      configId: config.id,
      projectId: project.id,
      billingCustomer: customer,
      keywordIds: addedIds,
    });
  } catch (error) {
    // The free plan can't run checks: the keywords wait for an upgrade.
    if (!(error instanceof AppError && error.code === "PAYMENT_REQUIRED"))
      throw error;
  }
  await RankTrackingService.refreshKeywordMetrics(
    config.id,
    project.id,
    customer,
  );
}

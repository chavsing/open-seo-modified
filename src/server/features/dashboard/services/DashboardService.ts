import { ProjectRepository } from "@/server/features/projects/repositories/ProjectRepository";
import { sort } from "remeda";
import { safeHostname } from "@/shared/safe-url";
import { ActivationRepository } from "@/server/features/activation/repositories/ActivationRepository";
import { AuditRepository } from "@/server/features/audit/repositories/AuditRepository";
import { getIssueTypePageCountsForAudit } from "@/server/features/audit/repositories/auditSummaryQueries";
import { Ga4ConnectionRepository } from "@/server/features/ga4/repositories/Ga4ConnectionRepository";
import { GscConnectionRepository } from "@/server/features/gsc/repositories/GscConnectionRepository";
import { BlogRepository } from "@/server/features/blog/repositories/BlogRepository";
import { ProjectContextRepository } from "@/server/features/project-context/repositories/ProjectContextRepository";
import { RankTrackingRepository } from "@/server/features/rank-tracking/repositories/RankTrackingRepository";

export type DashboardActivation = {
  domain: string | null;
  ga4: {
    connected: boolean;
    propertyDisplayName: string | null;
    cardDismissedAt: string | null;
  };
  gsc: { connected: boolean; siteUrl: string | null };
  mcp: {
    authorizedAt: string | null;
    firstToolCallAt: string | null;
    cardDismissedAt: string | null;
  };
  competitorClickedAt: string | null;
  keywordsClickedAt: string | null;
  hasAudit: boolean;
  hasMultipleProjects: boolean;
  hasTeammate: boolean;
  dismissedSteps: string[];
  /** What the automatic setup did for this site; null if it never ran. */
  autoSetup: AutoSetupSummary | null;
};

type AutoSetupSummary = {
  status: "running" | "done" | "failed";
  error: string | null;
  contextSections: number;
  competitors: number;
  topicIdeas: number;
  trackedKeywords: number;
};

// The setup job times out at 15 minutes; past this it isn't coming back.
const AUTO_SETUP_STALE_MS = 20 * 60_000;

export type DashboardAuditSummary = {
  id: string;
  status: "running" | "completed" | "failed";
  pagesCrawled: number;
  // The crawl's page limit; small sites finish below it.
  pagesTotal: number;
  currentPhase: string | null;
  lighthouseCompleted: number;
  lighthouseFailed: number;
  lighthouseTotal: number;
  startedAt: string;
  // Top issue types by severity then affected-page count, for the card's list.
  topIssues: {
    issueType: string;
    severity: "critical" | "warning" | "info";
    count: number;
  }[];
};

type DashboardOverview = { audit: DashboardAuditSummary | null };

async function getActivation(input: {
  userId: string;
  projectId: string;
  organizationId: string;
  domain: string | null;
}): Promise<DashboardActivation> {
  const [
    ga4,
    gsc,
    orgActivation,
    projectActivation,
    projectCount,
    hasTeammate,
    dismissed,
    latestAudit,
  ] = await Promise.all([
    Ga4ConnectionRepository.getByProjectId(input.projectId),
    GscConnectionRepository.getByProjectId(input.projectId),
    ActivationRepository.getOrganizationActivation(input.organizationId),
    ActivationRepository.getProjectActivation(input.projectId),
    ProjectRepository.countProjects(input.organizationId),
    ActivationRepository.hasTeammate(input.organizationId),
    ActivationRepository.getDismissedSteps(input.userId, input.projectId),
    AuditRepository.getLatestAuditForProject(input.projectId),
  ]);

  return {
    domain: input.domain,
    hasMultipleProjects: projectCount > 1,
    hasTeammate,
    dismissedSteps: dismissed.map((row) => row.step),
    ga4: {
      connected: ga4 !== null,
      propertyDisplayName: ga4?.propertyDisplayName ?? null,
      cardDismissedAt: projectActivation?.ga4CardDismissedAt ?? null,
    },
    gsc: { connected: gsc !== null, siteUrl: gsc?.siteUrl ?? null },
    mcp: {
      authorizedAt: orgActivation?.firstMcpAuthorizedAt ?? null,
      firstToolCallAt: orgActivation?.firstMcpToolCallAt ?? null,
      cardDismissedAt: projectActivation?.mcpCardDismissedAt ?? null,
    },
    competitorClickedAt: projectActivation?.competitorStepClickedAt ?? null,
    keywordsClickedAt: projectActivation?.keywordStepClickedAt ?? null,
    hasAudit: latestAudit != null,
    autoSetup: projectActivation?.autoSetupStartedAt
      ? await getAutoSetupSummary(input.projectId, projectActivation)
      : null,
  };
}

/** Counts what exists now, so it stays true after the customer edits it. */
async function getAutoSetupSummary(
  projectId: string,
  state: {
    autoSetupStartedAt: string | null;
    autoSetupFinishedAt: string | null;
    autoSetupError: string | null;
  },
): Promise<AutoSetupSummary> {
  const [sections, competitors, topics, configs] = await Promise.all([
    ProjectContextRepository.listSections(projectId),
    ProjectContextRepository.listCompetitors(projectId),
    BlogRepository.listTopics(projectId),
    RankTrackingRepository.getConfigsForProject(projectId),
  ]);
  const keywordCounts = await RankTrackingRepository.getKeywordCountsForConfigs(
    configs.map((config) => config.id),
  );
  const stale =
    !state.autoSetupFinishedAt &&
    Date.parse(state.autoSetupStartedAt ?? "") <
      Date.now() - AUTO_SETUP_STALE_MS;
  return {
    status: state.autoSetupFinishedAt
      ? state.autoSetupError
        ? "failed"
        : "done"
      : stale
        ? "failed"
        : "running",
    error:
      state.autoSetupError ??
      (stale
        ? "Automatic setup didn't finish. You can run it from the Context page with Set up from website."
        : null),
    contextSections: sections.filter((row) => row.content.trim()).length,
    competitors: competitors.length,
    topicIdeas: topics.length,
    trackedKeywords: [...keywordCounts.values()].reduce(
      (sum, count) => sum + count,
      0,
    ),
  };
}

async function getOverview(input: {
  projectId: string;
  domain: string | null;
}): Promise<DashboardOverview> {
  return { audit: await getAuditSummary(input.projectId, input.domain) };
}

async function getAuditSummary(
  projectId: string,
  domain: string | null,
): Promise<DashboardAuditSummary | null> {
  const hostname = domain ? safeHostname(`https://${domain}`) : null;
  if (!hostname) return null;

  const audits = await AuditRepository.getAuditsByProject(projectId);
  const audit = audits.find(
    (candidate) => safeHostname(candidate.startUrl) === hostname,
  );
  if (!audit) return null;

  const typeRows = await getIssueTypePageCountsForAudit(audit.id);

  const severityRank = { critical: 0, warning: 1, info: 2 };
  const sorted = sort(
    typeRows.map((row) => ({
      issueType: row.issueType,
      severity: row.severity,
      count: row.pages,
    })),
    (a, b) =>
      severityRank[a.severity] - severityRank[b.severity] || b.count - a.count,
  );

  return {
    id: audit.id,
    status: audit.status,
    pagesCrawled: audit.pagesCrawled,
    pagesTotal: audit.pagesTotal,
    currentPhase: audit.currentPhase,
    lighthouseCompleted: audit.lighthouseCompleted,
    lighthouseFailed: audit.lighthouseFailed,
    lighthouseTotal: audit.lighthouseTotal,
    startedAt: audit.startedAt,
    topIssues: sorted.slice(0, 3),
  };
}

export const DashboardService = {
  setStepDismissed: ActivationRepository.setStepDismissed,
  getActivation,
  getOverview,
};

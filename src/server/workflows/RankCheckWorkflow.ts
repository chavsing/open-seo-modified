import {
  WorkflowEntrypoint,
  type WorkflowEvent,
  type WorkflowStep,
} from "cloudflare:workers";
import { NonRetryableError } from "cloudflare:workflows";
import { withPgClient } from "@/db";
import {
  getUsageCreditsRemaining,
  type BillingCustomerContext,
} from "@/server/billing/subscription";
import { RankTrackingRepository } from "@/server/features/rank-tracking/repositories/RankTrackingRepository";
import { failRunIfActive } from "@/server/features/rank-tracking/services/rankCheckRunGuards";
import { alertRankDrops } from "@/server/features/rank-tracking/services/rankDropAlert";
import {
  runLiveCheck,
  runQueuedCheck,
} from "@/server/workflows/rankCheckPaths";
import { retryRankChecks } from "@/server/workflows/rankCheckRetries";
import { pgStep } from "@/server/workflows/pgStep";
import { createDataforseoClient } from "@/server/lib/dataforseo";
import { captureServerEvent } from "@/server/lib/posthog";
import { AppError } from "@/server/lib/errors";
import {
  estimateRankCheckCredits,
  rankCheckCostApprovalError,
} from "@/shared/rank-tracking";
import { isHostedServerAuthMode } from "@/server/lib/runtime-env";

const SINGLE_ATTEMPT_STEP_CONFIG = {
  retries: { limit: 0, delay: "1 second" as const },
  timeout: "2 minutes" as const,
};

interface RankCheckParams {
  runId: string;
  configId: string;
  billingCustomer: BillingCustomerContext;
  projectId: string;
  domain: string;
  locationCode: number;
  languageCode: string;
  locationName?: string;
  devices: "both" | "desktop" | "mobile";
  serpDepth: number;
  trigger: "manual" | "scheduled";
  keywordIds?: string[];
  maxCostCredits?: number;
}

async function prepareRankCheckKeywords(input: {
  runId: string;
  configId: string;
  billingCustomer: BillingCustomerContext;
  devices: RankCheckParams["devices"];
  serpDepth: number;
  trigger: RankCheckParams["trigger"];
  keywordIds?: string[];
  maxCostCredits?: number;
}) {
  // If stale-cleanup marked our run failed before we got here, bail out
  // rather than resurrecting a superseded run.
  const run = await RankTrackingRepository.getRunById(input.runId);
  if (!run || run.status === "failed" || run.status === "completed") {
    throw new NonRetryableError(
      `Run ${input.runId} is no longer active (status=${run?.status ?? "missing"})`,
    );
  }

  await RankTrackingRepository.updateRun(input.runId, {
    status: "running",
  });

  let trackingKeywords = await RankTrackingRepository.getKeywordsForConfig(
    input.configId,
  );

  if (input.keywordIds && input.keywordIds.length > 0) {
    const idSet = new Set(input.keywordIds);
    trackingKeywords = trackingKeywords.filter((kw) => idSet.has(kw.id));
  }

  if (trackingKeywords.length === 0) {
    throw new AppError("INTERNAL_ERROR", "No keywords to track");
  }

  const { costCredits } = estimateRankCheckCredits(
    trackingKeywords.map((kw) => kw.keyword),
    input.devices,
    input.serpDepth,
    input.trigger === "scheduled" ? "queued" : "live",
  );
  if (input.maxCostCredits != null && costCredits > input.maxCostCredits) {
    throw new AppError(
      "VALIDATION_ERROR",
      rankCheckCostApprovalError(costCredits, input.maxCostCredits),
    );
  }

  // Verify the user has enough credits for the full check before starting.
  // Scheduled checks go through the cheaper task queue, so estimate at queued
  // pricing — a live-price estimate would skip checks the user can afford.
  // The estimate is the worst case, so it covers every retry.
  if (await isHostedServerAuthMode()) {
    const { monthlyRemaining, topupRemaining } = await getUsageCreditsRemaining(
      input.billingCustomer.organizationId,
    );
    const available = monthlyRemaining + topupRemaining;
    if (available < costCredits) {
      throw new AppError(
        "INSUFFICIENT_CREDITS",
        "Insufficient credits for rank check",
      );
    }
  }

  await RankTrackingRepository.updateRun(input.runId, {
    keywordsTotal: trackingKeywords.length,
  });

  return {
    keywords: trackingKeywords.map((kw) => ({
      id: kw.id,
      keyword: kw.keyword,
    })),
  };
}

async function finalizeRankCheckRun(input: {
  runId: string;
  configId: string;
  projectId: string;
  domain: string;
  billingCustomer: BillingCustomerContext;
  trigger: RankCheckParams["trigger"];
  devices: RankCheckParams["devices"];
  keywords: Array<{ id: string; keyword: string }>;
  batchError: string | null;
}) {
  // If stale-cleanup already marked our run failed, don't overwrite that
  // decision with a completed status — a replacement run may already be
  // underway.
  const run = await RankTrackingRepository.getRunById(input.runId);
  if (!run || run.status === "failed" || run.status === "completed") {
    console.warn(
      `[rank-check] ${input.runId} no longer active (status=${run?.status ?? "missing"}), skipping finalization`,
    );
    return;
  }

  const nowIso = new Date().toISOString();

  // Snapshots were written incrementally by each batch step. Count from the
  // DB: a keyword is checked when any device has a snapshot, but the run is
  // partial when any device is missing one, so a lost device still shows.
  const snapshots = await RankTrackingRepository.getSnapshotsForRun(
    input.runId,
  );
  // Read while this run is still active, so these are the earlier positions.
  const positionsBefore =
    input.trigger === "scheduled"
      ? await RankTrackingRepository.getLatestSnapshotsForKeywords(
          input.configId,
        )
      : [];
  const keywordsChecked = new Set(snapshots.map((s) => s.trackingKeywordId))
    .size;
  const devices: Array<"desktop" | "mobile"> =
    input.devices === "both" ? ["desktop", "mobile"] : [input.devices];
  const checkedByDevice = devices.map((device) => ({
    device,
    count: new Set(
      snapshots
        .filter((s) => s.device === device)
        .map((s) => s.trackingKeywordId),
    ).size,
  }));

  const keywordsTotal = run.keywordsTotal || keywordsChecked;
  const isPartial = checkedByDevice.some((d) => d.count < keywordsTotal);

  // Batch steps record the first per-keyword rejection on the run as it
  // happens, so a failed run shows the vendor's reason rather than a count.
  const keywordError = run.errorMessage ?? input.batchError;
  const status =
    keywordsChecked === 0 && keywordsTotal > 0 ? "failed" : "completed";
  const checkedSummary =
    checkedByDevice.length > 1
      ? checkedByDevice
          .map(({ device, count }) => `${count} of ${keywordsTotal} ${device}`)
          .join(" and ")
      : `${keywordsChecked} of ${keywordsTotal}`;
  const errorMessage =
    status === "failed"
      ? (keywordError ?? "No keywords could be checked.")
      : isPartial
        ? [
            `Checked ${checkedSummary} keyword(s)${keywordError ? `: ${keywordError}` : ""}`.replace(
              /\.?$/,
              ".",
            ),
            describeUnchecked(input.keywords, devices, snapshots),
          ]
            .filter(Boolean)
            .join(" ")
        : null;

  // Flipping status away from 'pending'/'running' is what releases the
  // partial-index slot for the next run.
  await RankTrackingRepository.updateRun(input.runId, {
    status,
    keywordsChecked,
    completedAt: nowIso,
    errorMessage,
  });

  // Clear any previous skip reason on success. A failed run must not advance
  // lastCheckedAt — nothing was actually checked.
  // Note: nextCheckAt is NOT set here — the cron handler advances it eagerly
  // before starting the workflow to prevent retry storms.
  if (status === "completed") {
    await RankTrackingRepository.updateConfig(input.configId, input.projectId, {
      lastCheckedAt: nowIso,
      lastSkipReason: null,
    });
    if (input.trigger === "scheduled")
      await alertRankDrops({
        organizationId: input.billingCustomer.organizationId,
        projectId: input.projectId,
        domain: input.domain,
        before: positionsBefore,
        after: snapshots,
      });
  }

  // One-line summary per run, visible in Workers Logs.
  // Error text can echo vendor/user content — keep it one line and bounded.
  const errorSummary = errorMessage
    ? ` error="${errorMessage.replace(/\s+/g, " ").slice(0, 200)}"`
    : "";
  console.log(
    `[rank-check] ${input.runId} ${status} org=${input.billingCustomer.organizationId} project=${input.projectId} trigger=${input.trigger} keywords=${keywordsChecked}/${keywordsTotal}${errorSummary}`,
  );

  await captureServerEvent({
    distinctId: input.billingCustomer.userId,
    event: "rank_tracking:check_complete",
    organizationId: input.billingCustomer.organizationId,
    properties: {
      project_id: input.projectId,
      status,
      trigger: input.trigger,
      keywords_checked: keywordsChecked,
    },
  });
}

/** Names a partial run's unchecked keywords, so users see which ones failed. */
function describeUnchecked(
  keywords: Array<{ id: string; keyword: string }>,
  devices: Array<"desktop" | "mobile">,
  snapshots: Array<{ trackingKeywordId: string; device: string }>,
) {
  const checked = new Set(
    snapshots.map((s) => `${s.trackingKeywordId}:${s.device}`),
  );
  const unchecked = keywords.flatMap((kw) => {
    const missing = devices.filter((d) => !checked.has(`${kw.id}:${d}`));
    if (missing.length === 0) return [];
    // Name the device only when the other one got a result.
    return missing.length < devices.length
      ? [`"${kw.keyword}" (${missing[0]})`]
      : [`"${kw.keyword}"`];
  });
  if (unchecked.length === 0) return "";
  const shown = unchecked.slice(0, UNCHECKED_KEYWORDS_SHOWN).join(", ");
  const more = unchecked.length - UNCHECKED_KEYWORDS_SHOWN;
  return `Not checked: ${shown}${more > 0 ? ` and ${more} more` : ""}.`;
}

/** Keeps a partial run's message readable on a large tracker. */
const UNCHECKED_KEYWORDS_SHOWN = 10;

async function markRankCheckRunFailed(input: {
  runId: string;
  configId: string;
  projectId: string;
  billingCustomer: BillingCustomerContext;
  error: unknown;
}) {
  const errorMessage =
    input.error instanceof Error ? input.error.message : "Unknown error";
  await failRunIfActive(input.runId, errorMessage);

  // Flag the config so the UI can show why the scheduled check was skipped
  const isInsufficientCredits =
    input.error instanceof AppError &&
    input.error.code === "INSUFFICIENT_CREDITS";
  if (isInsufficientCredits) {
    await RankTrackingRepository.updateConfig(input.configId, input.projectId, {
      lastSkipReason: "insufficient_credits",
    });
  }

  await captureServerEvent({
    distinctId: input.billingCustomer.userId,
    event: "rank_tracking:check_complete",
    organizationId: input.billingCustomer.organizationId,
    properties: {
      project_id: input.projectId,
      status: "failed",
      error: errorMessage,
    },
  });
}

export class RankCheckWorkflow extends WorkflowEntrypoint<
  Env,
  RankCheckParams
> {
  async run(event: WorkflowEvent<RankCheckParams>, step: WorkflowStep) {
    // Scope a per-request Postgres client for this workflow invocation (no-op in
    // D1 mode). The socket is reclaimed when the invocation ends, so there is
    // nothing to tear down here.
    return withPgClient(() => this.runScoped(event, step));
  }

  private async runScoped(
    event: WorkflowEvent<RankCheckParams>,
    step: WorkflowStep,
  ) {
    const {
      runId,
      configId,
      billingCustomer,
      projectId,
      domain,
      locationCode,
      languageCode,
      locationName,
      devices,
      serpDepth,
      trigger,
      keywordIds,
      maxCostCredits,
    } = event.payload;

    // Guard: skip if config was archived after the workflow was triggered
    const configCheck = await pgStep(
      step,
      "check-active",
      { retries: { limit: 0, delay: "1 second" } },
      async () => {
        const cfg = await RankTrackingRepository.getConfigById({
          configId,
          projectId,
        });
        return { isActive: cfg?.isActive ?? false };
      },
    );
    if (!configCheck.isActive) {
      await failRunIfActive(runId, "Config has been archived");
      return;
    }

    try {
      console.log(
        `[rank-check] ${runId} starting (trigger=${trigger}, devices=${devices})`,
      );

      const prepareResult = await pgStep(
        step,
        "prepare",
        { retries: { limit: 0, delay: "1 second" } },
        async () =>
          prepareRankCheckKeywords({
            runId,
            configId,
            billingCustomer,
            devices,
            serpDepth,
            trigger,
            keywordIds,
            maxCostCredits,
          }),
      );

      const keywords = prepareResult.keywords;
      const client = createDataforseoClient(billingCustomer);

      console.log(`[rank-check] ${runId} loaded ${keywords.length} keywords`);

      let batchError: string | null = null;

      try {
        const checkContext = {
          client,
          keywords,
          devices,
          serpDepth,
          domain,
          locationCode,
          languageCode,
          locationName,
          runId,
        };
        // Scheduled checks use DataForSEO's task queue (~30% of live cost);
        // manual checks stay on the live endpoint for instant results.
        // Retries always go through the queue.
        if (trigger === "scheduled") {
          await runQueuedCheck(step, checkContext);
        } else {
          await runLiveCheck(step, checkContext);
        }
        await retryRankChecks(step, checkContext, configId, trigger);
      } catch (error) {
        // Batch failure — snapshots for completed batches are already
        // persisted incrementally. Continue to finalization.
        batchError = error instanceof Error ? error.message : String(error);
        console.warn(`[rank-check] ${runId} partial failure: ${batchError}`);
      }

      await pgStep(step, "finalize", SINGLE_ATTEMPT_STEP_CONFIG, async () =>
        finalizeRankCheckRun({
          runId,
          configId,
          projectId,
          domain,
          billingCustomer,
          trigger,
          devices,
          keywords,
          batchError,
        }),
      );
    } catch (error) {
      console.error(`Rank check ${runId} failed:`, error);
      await pgStep(step, "mark-failed", SINGLE_ATTEMPT_STEP_CONFIG, async () =>
        markRankCheckRunFailed({
          runId,
          configId,
          projectId,
          billingCustomer,
          error,
        }),
      );
      throw error;
    }
  }
}

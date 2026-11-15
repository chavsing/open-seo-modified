import { AuthRepository } from "@/server/auth/repositories/AuthRepository";
import { AuditScheduleRepository } from "@/server/features/audit/repositories/auditScheduleRepository";
import { AuditService } from "@/server/features/audit/services/AuditService";
import { ProjectRepository } from "@/server/features/projects/repositories/ProjectRepository";
import { sendNoticeEmail } from "@/server/email/loops";
import { AppError } from "@/server/lib/errors";
import { getOptionalEnvValue } from "@/server/lib/runtime-env";
import { getIssueDescriptor } from "@/shared/audit-issues";
import type { BillingCustomerContext } from "@/server/billing/subscription";

// Repeating site audits. The cron starts a project's audit when it is due,
// with the page limit chosen when the schedule was set; when that audit
// finishes, the owners get one email saying what changed since the last one.

const DAY_MS = 24 * 60 * 60_000;
// Audits take minutes each, so a tick starts only a few.
const STARTS_PER_TICK = 5;

type Interval = "weekly" | "monthly";

/** The next run after `from`, skipping any already in the past. */
function nextRunAfter(interval: Interval, from: Date, now: Date) {
  let next = from.getTime();
  while (next <= now.getTime()) {
    const date = new Date(next);
    if (interval === "weekly") next += 7 * DAY_MS;
    else next = date.setUTCMonth(date.getUTCMonth() + 1);
  }
  return new Date(next).toISOString();
}

const countsByType = (rows: { issueType: string; count: number }[]) =>
  new Map(rows.map((row) => [row.issueType, Number(row.count)]));

export async function getAuditSchedule(projectId: string) {
  const schedule = await AuditScheduleRepository.getSchedule(projectId);
  if (!schedule) return null;
  return {
    startUrl: schedule.startUrl,
    interval: schedule.interval,
    maxPages: schedule.maxPages,
    nextRunAt: schedule.nextRunAt,
    lastError: schedule.lastError,
  };
}

/** Sets the schedule (the first audit runs a day later), or removes it. */
export async function saveAuditSchedule(
  input: {
    projectId: string;
    startUrl: string;
    interval: Interval | "off";
    maxPages: number;
  },
  customer: BillingCustomerContext,
) {
  if (input.interval === "off") {
    await AuditScheduleRepository.deleteSchedule(input.projectId);
    return null;
  }
  if ((await AuditService.resolveAuditLimitTier(customer)) === "free")
    throw new AppError(
      "VALIDATION_ERROR",
      "Scheduled audits need a paid plan. You can still run audits by hand.",
    );
  const now = new Date();
  await AuditScheduleRepository.upsertSchedule({
    projectId: input.projectId,
    startUrl: input.startUrl,
    interval: input.interval,
    maxPages: input.maxPages,
    createdByUserId: customer.userId,
    nextRunAt: new Date(now.getTime() + DAY_MS).toISOString(),
    updatedAt: now.toISOString(),
  });
  return getAuditSchedule(input.projectId);
}

function startFailure(error: unknown) {
  if (error instanceof AppError) {
    if (error.code === "AUDIT_ALREADY_RUNNING")
      return "Skipped: another audit was still running.";
    if (
      error.code === "AUDIT_CAPACITY_REACHED" ||
      error.code === "AUDIT_PAGE_LIMIT_EXCEEDED"
    )
      return "Skipped: the page limit is more than your plan allows now. Lower it and save the schedule again.";
    if (error.message !== error.code) return error.message;
  }
  return "The audit couldn't start. It will try again at the next scheduled time.";
}

/** Cron body: starts the audits that are due. */
export async function runScheduledAudits(now = new Date()) {
  const due = await AuditScheduleRepository.listDue(
    now.toISOString(),
    STARTS_PER_TICK,
  );
  let started = 0;
  for (const schedule of due) {
    const claimed = await AuditScheduleRepository.claimRun(
      schedule.projectId,
      schedule.nextRunAt,
      nextRunAfter(schedule.interval, new Date(schedule.nextRunAt), now),
    );
    if (!claimed) continue;
    const customer = {
      userId: schedule.createdByUserId,
      userEmail: schedule.userEmail ?? "system@openseo.so",
      organizationId: schedule.organizationId,
      projectId: schedule.projectId,
    };
    try {
      const limitTier = await AuditService.resolveAuditLimitTier(customer);
      if (limitTier === "free") {
        await AuditScheduleRepository.recordRun(schedule.projectId, {
          lastError: "Paused: scheduled audits need a paid plan.",
        });
        continue;
      }
      const { auditId } = await AuditService.startAudit({
        actorUserId: schedule.createdByUserId,
        billingCustomer: customer,
        projectId: schedule.projectId,
        startUrl: schedule.startUrl,
        maxPages: schedule.maxPages,
        // Lighthouse bills per page; the audit form leaves it off too.
        lighthouseStrategy: "none",
        limitTier,
      });
      await AuditScheduleRepository.recordRun(schedule.projectId, {
        lastAuditId: auditId,
        lastError: null,
      });
      started += 1;
    } catch (error) {
      if (!(error instanceof AppError))
        console.error("[cron] scheduled audit failed to start", {
          projectId: schedule.projectId,
          error,
        });
      await AuditScheduleRepository.recordRun(schedule.projectId, {
        lastError: startFailure(error),
      });
    }
  }
  return started;
}

/**
 * What changed since the previous completed audit of the same start page:
 * per issue type, how many there are now and before, and how many are new
 * or fixed (matched by type and page). Null when there is nothing to compare.
 */
export async function compareWithPreviousAudit(
  auditId: string,
  projectId: string,
) {
  const audit = await AuditScheduleRepository.getAudit(auditId, projectId);
  if (!audit || audit.status !== "completed") return null;
  const previous = await AuditScheduleRepository.getPreviousAudit(audit);
  if (!previous) return null;
  const [now, before, added, fixed] = await Promise.all([
    AuditScheduleRepository.countIssuesByType(audit.id),
    AuditScheduleRepository.countIssuesByType(previous.id),
    AuditScheduleRepository.countIssuesNotIn(audit.id, previous.id),
    AuditScheduleRepository.countIssuesNotIn(previous.id, audit.id),
  ]);
  const [nowBy, beforeBy, addedBy, fixedBy] = [now, before, added, fixed].map(
    countsByType,
  );
  const types = [...new Set([...nowBy.keys(), ...beforeBy.keys()])];
  const byType = types
    .map((issueType) => ({
      issueType,
      title: getIssueDescriptor(issueType)?.title ?? issueType,
      now: nowBy.get(issueType) ?? 0,
      before: beforeBy.get(issueType) ?? 0,
      added: addedBy.get(issueType) ?? 0,
      fixed: fixedBy.get(issueType) ?? 0,
    }))
    .filter((row) => row.added > 0 || row.fixed > 0);
  byType.sort((a, b) => b.added - a.added || b.fixed - a.fixed);
  const sum = (key: "added" | "fixed") =>
    byType.reduce((total, row) => total + row[key], 0);
  return {
    previousAuditId: previous.id,
    previousStartedAt: previous.startedAt,
    pagesNow: audit.pagesCrawled,
    pagesBefore: previous.pagesCrawled,
    added: sum("added"),
    fixed: sum("fixed"),
    byType,
  };
}

/**
 * Called when an audit finishes. For the schedule's own audit, emails the
 * owners once with what changed. Best effort: never fails the audit.
 */
export async function notifyScheduledAuditDone(
  projectId: string,
  auditId: string,
) {
  try {
    if (!(await AuditScheduleRepository.claimNotice(projectId, auditId)))
      return;
    const [audit, comparison, project] = await Promise.all([
      AuditScheduleRepository.getAudit(auditId, projectId),
      compareWithPreviousAudit(auditId, projectId),
      ProjectRepository.getProjectById(projectId),
    ]);
    if (!audit || !project) return;
    const site = new URL(audit.startUrl).hostname;
    const issues = (
      await AuditScheduleRepository.countIssuesByType(auditId)
    ).reduce((total, row) => total + Number(row.count), 0);
    const changes = comparison
      ? comparison.added === 0 && comparison.fixed === 0
        ? " Nothing changed since the last audit."
        : ` Since the last audit: ${comparison.added} new and ${comparison.fixed} fixed.${
            comparison.byType.length
              ? ` ${comparison.byType
                  .slice(0, 3)
                  .map(
                    (row) =>
                      `${row.title}: ${row.before} before, ${row.now} now`,
                  )
                  .join("; ")}.`
              : ""
          }`
      : "";
    const appUrl = (await getOptionalEnvValue("BETTER_AUTH_URL")) ?? "";
    const linkUrl = `${appUrl.replace(/\/$/, "")}/p/${projectId}/audit?auditId=${auditId}`;
    for (const email of await AuthRepository.listOwnerEmails(
      project.organizationId,
    ))
      await sendNoticeEmail({
        email,
        title: `Site audit finished for ${site}`,
        message: `Your scheduled audit of ${site} checked ${audit.pagesCrawled} pages and found ${issues} issues.${changes}`,
        linkUrl,
      });
  } catch (error) {
    console.error("[audit] scheduled audit email failed", { auditId, error });
  }
}

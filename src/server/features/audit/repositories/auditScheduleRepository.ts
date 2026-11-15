import {
  and,
  count,
  desc,
  eq,
  isNull,
  lt,
  lte,
  ne,
  or,
  sql,
} from "drizzle-orm";
import { db } from "@/db";
import {
  auditIssues,
  audits,
  auditSchedules,
  projects,
  user,
} from "@/db/schema";

// Repeating audits, and the "what changed since the last audit" counts.

async function getSchedule(projectId: string) {
  const rows = await db
    .select()
    .from(auditSchedules)
    .where(eq(auditSchedules.projectId, projectId))
    .limit(1);
  return rows[0] ?? null;
}

async function upsertSchedule(row: typeof auditSchedules.$inferInsert) {
  await db
    .insert(auditSchedules)
    .values(row)
    .onConflictDoUpdate({
      target: auditSchedules.projectId,
      set: {
        startUrl: row.startUrl,
        interval: row.interval,
        maxPages: row.maxPages,
        createdByUserId: row.createdByUserId,
        nextRunAt: row.nextRunAt,
        lastError: null,
        updatedAt: row.updatedAt,
      },
    });
}

async function deleteSchedule(projectId: string) {
  await db
    .delete(auditSchedules)
    .where(eq(auditSchedules.projectId, projectId));
}

/** Schedules due by `nowIso`, oldest first, with the org and owner's email. */
async function listDue(nowIso: string, limit: number) {
  return db
    .select({
      projectId: auditSchedules.projectId,
      startUrl: auditSchedules.startUrl,
      interval: auditSchedules.interval,
      maxPages: auditSchedules.maxPages,
      createdByUserId: auditSchedules.createdByUserId,
      nextRunAt: auditSchedules.nextRunAt,
      organizationId: projects.organizationId,
      userEmail: user.email,
    })
    .from(auditSchedules)
    .innerJoin(projects, eq(projects.id, auditSchedules.projectId))
    .leftJoin(user, eq(user.id, auditSchedules.createdByUserId))
    .where(lte(auditSchedules.nextRunAt, nowIso))
    .orderBy(auditSchedules.nextRunAt)
    .limit(limit);
}

/** Moves the schedule on, unless another tick already did. */
async function claimRun(
  projectId: string,
  observedNextRunAt: string,
  nextRunAt: string,
) {
  const rows = await db
    .update(auditSchedules)
    .set({ nextRunAt })
    .where(
      and(
        eq(auditSchedules.projectId, projectId),
        eq(auditSchedules.nextRunAt, observedNextRunAt),
      ),
    )
    .returning({ projectId: auditSchedules.projectId });
  return rows.length > 0;
}

async function recordRun(
  projectId: string,
  result: { lastAuditId?: string; lastError: string | null },
) {
  await db
    .update(auditSchedules)
    .set(result)
    .where(eq(auditSchedules.projectId, projectId));
}

/**
 * Marks the scheduled audit's email as sent. False when the audit isn't the
 * schedule's latest one or its email already went out.
 */
async function claimNotice(projectId: string, auditId: string) {
  const rows = await db
    .update(auditSchedules)
    .set({ notifiedAuditId: auditId })
    .where(
      and(
        eq(auditSchedules.projectId, projectId),
        eq(auditSchedules.lastAuditId, auditId),
        or(
          isNull(auditSchedules.notifiedAuditId),
          ne(auditSchedules.notifiedAuditId, auditId),
        ),
      ),
    )
    .returning({ projectId: auditSchedules.projectId });
  return rows.length > 0;
}

async function getAudit(auditId: string, projectId: string) {
  const rows = await db
    .select()
    .from(audits)
    .where(and(eq(audits.id, auditId), eq(audits.projectId, projectId)))
    .limit(1);
  return rows[0] ?? null;
}

/** The completed audit of the same start page just before this one. */
async function getPreviousAudit(audit: {
  projectId: string;
  startUrl: string;
  startedAt: string;
}) {
  const rows = await db
    .select()
    .from(audits)
    .where(
      and(
        eq(audits.projectId, audit.projectId),
        eq(audits.startUrl, audit.startUrl),
        eq(audits.status, "completed"),
        lt(audits.startedAt, audit.startedAt),
      ),
    )
    .orderBy(desc(audits.startedAt))
    .limit(1);
  return rows[0] ?? null;
}

async function countIssuesByType(auditId: string) {
  return db
    .select({ issueType: auditIssues.issueType, count: count() })
    .from(auditIssues)
    .where(eq(auditIssues.auditId, auditId))
    .groupBy(auditIssues.issueType);
}

/** Issues in `auditId` with no issue of the same type and page in `otherId`. */
async function countIssuesNotIn(auditId: string, otherId: string) {
  return db
    .select({ issueType: auditIssues.issueType, count: count() })
    .from(auditIssues)
    .where(
      and(
        eq(auditIssues.auditId, auditId),
        sql`not exists (select 1 from audit_issues other_issues where other_issues.audit_id = ${otherId} and other_issues.issue_type = ${auditIssues.issueType} and other_issues.page_url = ${auditIssues.pageUrl})`,
      ),
    )
    .groupBy(auditIssues.issueType);
}

export const AuditScheduleRepository = {
  getSchedule,
  upsertSchedule,
  deleteSchedule,
  listDue,
  claimRun,
  recordRun,
  claimNotice,
  getAudit,
  getPreviousAudit,
  countIssuesByType,
  countIssuesNotIn,
};

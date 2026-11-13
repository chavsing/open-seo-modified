import {
  and,
  asc,
  desc,
  eq,
  gt,
  isNotNull,
  isNull,
  lt,
  lte,
  ne,
  or,
} from "drizzle-orm";
import { db } from "@/db";
import { blogArticles, blogSettings, blogTopics, projects } from "@/db/schema";

// Every query is scoped by projectId. The server functions resolve the project
// through requireProjectContext, which already checked it belongs to the
// caller's organization.

async function getSettings(projectId: string) {
  const rows = await db
    .select()
    .from(blogSettings)
    .where(eq(blogSettings.projectId, projectId))
    .limit(1);
  return rows[0] ?? null;
}

async function upsertSettings(
  projectId: string,
  values: Partial<
    Pick<
      typeof blogSettings.$inferInsert,
      | "publishMode"
      | "postsPerWeek"
      | "wordpressUrl"
      | "wordpressUsername"
      | "wordpressPassword"
      | "nextPostAt"
      | "lastRunAt"
      | "lastRunMessage"
    >
  >,
) {
  const updatedAt = new Date().toISOString();
  await db
    .insert(blogSettings)
    .values({ projectId, ...values, updatedAt })
    .onConflictDoUpdate({
      target: blogSettings.projectId,
      set: { ...values, updatedAt },
    });
}

async function listTopics(projectId: string) {
  return db
    .select()
    .from(blogTopics)
    .where(eq(blogTopics.projectId, projectId))
    .orderBy(asc(blogTopics.status), desc(blogTopics.searchVolume));
}

async function getTopic(projectId: string, topicId: string) {
  const rows = await db
    .select()
    .from(blogTopics)
    .where(and(eq(blogTopics.projectId, projectId), eq(blogTopics.id, topicId)))
    .limit(1);
  return rows[0] ?? null;
}

/**
 * Inserts new ideas and refreshes the numbers on ones already found. Status is
 * left alone, so a skipped or used idea stays that way across re-runs.
 */
async function upsertTopics(rows: (typeof blogTopics.$inferInsert)[]) {
  for (const row of rows) {
    await db
      .insert(blogTopics)
      .values(row)
      .onConflictDoUpdate({
        target: [blogTopics.projectId, blogTopics.keyword],
        set: {
          searchVolume: row.searchVolume,
          keywordDifficulty: row.keywordDifficulty,
          competitorDomain: row.competitorDomain,
          competitorUrl: row.competitorUrl,
          competitorPosition: row.competitorPosition,
        },
      });
  }
}

async function setTopicStatus(
  projectId: string,
  topicId: string,
  status: "idea" | "used" | "skipped",
) {
  await db
    .update(blogTopics)
    .set({ status })
    .where(
      and(eq(blogTopics.projectId, projectId), eq(blogTopics.id, topicId)),
    );
}

const articleSummaryColumns = {
  id: blogArticles.id,
  keyword: blogArticles.keyword,
  title: blogArticles.title,
  status: blogArticles.status,
  wordpressLink: blogArticles.wordpressLink,
  error: blogArticles.error,
  writingStartedAt: blogArticles.writingStartedAt,
  createdAt: blogArticles.createdAt,
  updatedAt: blogArticles.updatedAt,
  publishedAt: blogArticles.publishedAt,
};

async function listArticles(projectId: string) {
  return db
    .select(articleSummaryColumns)
    .from(blogArticles)
    .where(eq(blogArticles.projectId, projectId))
    .orderBy(desc(blogArticles.createdAt));
}

async function getArticle(projectId: string, articleId: string) {
  const rows = await db
    .select()
    .from(blogArticles)
    .where(
      and(
        eq(blogArticles.projectId, projectId),
        eq(blogArticles.id, articleId),
      ),
    )
    .limit(1);
  return rows[0] ?? null;
}

async function getArticleForTopic(projectId: string, topicId: string) {
  const rows = await db
    .select({ id: blogArticles.id })
    .from(blogArticles)
    .where(
      and(
        eq(blogArticles.projectId, projectId),
        eq(blogArticles.topicId, topicId),
      ),
    )
    .limit(1);
  return rows[0] ?? null;
}

async function listOtherTitles(projectId: string, articleId: string) {
  const rows = await db
    .select({ title: blogArticles.title })
    .from(blogArticles)
    .where(
      and(
        eq(blogArticles.projectId, projectId),
        ne(blogArticles.id, articleId),
      ),
    );
  return rows.map((row) => row.title);
}

/** Inserts the article unless the topic already has one (double-click). */
async function insertArticle(row: typeof blogArticles.$inferInsert) {
  await db.insert(blogArticles).values(row).onConflictDoNothing();
}

async function updateArticle(
  projectId: string,
  articleId: string,
  values: Partial<
    Pick<
      typeof blogArticles.$inferInsert,
      | "title"
      | "content"
      | "status"
      | "wordpressPostId"
      | "wordpressLink"
      | "error"
      | "publishedAt"
      | "aiScore"
      | "aiFeedback"
      | "aiSuggestions"
      | "metaDescription"
      | "writingStartedAt"
      | "writeError"
      | "wordpressCategoryId"
      | "wordpressCategoryName"
    >
  >,
) {
  await db
    .update(blogArticles)
    .set({ ...values, updatedAt: new Date().toISOString() })
    .where(
      and(
        eq(blogArticles.projectId, projectId),
        eq(blogArticles.id, articleId),
      ),
    );
}

/**
 * Marks the article as being written, unless a job already is. A mark older
 * than `staleBefore` belongs to a job that died, so it doesn't block.
 */
async function claimWriting(
  projectId: string,
  articleId: string,
  staleBefore: string,
) {
  const claimed = await db
    .update(blogArticles)
    .set({ writingStartedAt: new Date().toISOString(), writeError: null })
    .where(
      and(
        eq(blogArticles.projectId, projectId),
        eq(blogArticles.id, articleId),
        or(
          isNull(blogArticles.writingStartedAt),
          lt(blogArticles.writingStartedAt, staleBefore),
        ),
      ),
    )
    .returning({ id: blogArticles.id });
  return claimed.length > 0;
}

async function deleteArticle(projectId: string, articleId: string) {
  await db
    .delete(blogArticles)
    .where(
      and(
        eq(blogArticles.projectId, projectId),
        eq(blogArticles.id, articleId),
      ),
    );
}

/** Unused topic ideas, most searched first. */
async function listTopicIdeas(projectId: string, limit: number) {
  return db
    .select()
    .from(blogTopics)
    .where(
      and(eq(blogTopics.projectId, projectId), eq(blogTopics.status, "idea")),
    )
    .orderBy(desc(blogTopics.searchVolume))
    .limit(limit);
}

/** Sites whose next automatic article is due, oldest first. */
async function listDueAutoPosts(now: string, limit: number) {
  return db
    .select({
      projectId: blogSettings.projectId,
      nextPostAt: blogSettings.nextPostAt,
      postsPerWeek: blogSettings.postsPerWeek,
      organizationId: projects.organizationId,
    })
    .from(blogSettings)
    .innerJoin(projects, eq(projects.id, blogSettings.projectId))
    .where(
      and(
        gt(blogSettings.postsPerWeek, 0),
        isNotNull(blogSettings.nextPostAt),
        lte(blogSettings.nextPostAt, now),
        isNull(projects.archivedAt),
      ),
    )
    .orderBy(asc(blogSettings.nextPostAt))
    .limit(limit);
}

/**
 * Moves a due site's next post on, but only if no other run did first, so
 * overlapping cron ticks write one article, not two.
 */
async function claimDueAutoPost(input: {
  projectId: string;
  observedNextPostAt: string;
  nextPostAt: string;
}) {
  const claimed = await db
    .update(blogSettings)
    .set({ nextPostAt: input.nextPostAt, lastRunAt: new Date().toISOString() })
    .where(
      and(
        eq(blogSettings.projectId, input.projectId),
        eq(blogSettings.nextPostAt, input.observedNextPostAt),
      ),
    )
    .returning({ projectId: blogSettings.projectId });
  return claimed.length > 0;
}

export const BlogRepository = {
  getSettings,
  upsertSettings,
  listTopics,
  getTopic,
  upsertTopics,
  setTopicStatus,
  listArticles,
  getArticle,
  getArticleForTopic,
  listOtherTitles,
  insertArticle,
  updateArticle,
  claimWriting,
  deleteArticle,
  listTopicIdeas,
  listDueAutoPosts,
  claimDueAutoPost,
} as const;

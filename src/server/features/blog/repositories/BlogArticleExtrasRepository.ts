import { and, asc, desc, eq, inArray } from "drizzle-orm";
import { db } from "@/db";
import { blogArticleTags, blogArticleVersions } from "@/db/schema";

// An article's saved versions and its WordPress tags. Every query is scoped
// by projectId, like BlogRepository.

type Version = typeof blogArticleVersions.$inferSelect;

async function listVersions(projectId: string, articleId: string) {
  return db
    .select()
    .from(blogArticleVersions)
    .where(
      and(
        eq(blogArticleVersions.projectId, projectId),
        eq(blogArticleVersions.articleId, articleId),
      ),
    )
    .orderBy(desc(blogArticleVersions.createdAt));
}

async function getVersion(
  projectId: string,
  articleId: string,
  versionId: string,
): Promise<Version | null> {
  const rows = await db
    .select()
    .from(blogArticleVersions)
    .where(
      and(
        eq(blogArticleVersions.projectId, projectId),
        eq(blogArticleVersions.articleId, articleId),
        eq(blogArticleVersions.id, versionId),
      ),
    )
    .limit(1);
  return rows[0] ?? null;
}

async function insertVersion(row: Version) {
  await db.insert(blogArticleVersions).values(row);
}

async function deleteVersions(projectId: string, ids: string[]) {
  if (!ids.length) return;
  await db
    .delete(blogArticleVersions)
    .where(
      and(
        eq(blogArticleVersions.projectId, projectId),
        inArray(blogArticleVersions.id, ids),
      ),
    );
}

async function listTags(projectId: string, articleId: string) {
  const rows = await db
    .select({ name: blogArticleTags.name })
    .from(blogArticleTags)
    .where(
      and(
        eq(blogArticleTags.projectId, projectId),
        eq(blogArticleTags.articleId, articleId),
      ),
    )
    .orderBy(asc(blogArticleTags.name));
  return rows.map((row) => row.name);
}

/** Replaces the article's tags with `names`. */
async function setTags(projectId: string, articleId: string, names: string[]) {
  await db
    .delete(blogArticleTags)
    .where(
      and(
        eq(blogArticleTags.projectId, projectId),
        eq(blogArticleTags.articleId, articleId),
      ),
    );
  if (names.length)
    await db
      .insert(blogArticleTags)
      .values(names.map((name) => ({ projectId, articleId, name })))
      .onConflictDoNothing();
}

export const BlogArticleExtrasRepository = {
  listVersions,
  getVersion,
  insertVersion,
  deleteVersions,
  listTags,
  setTags,
} as const;

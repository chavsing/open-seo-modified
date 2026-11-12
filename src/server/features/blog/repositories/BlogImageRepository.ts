import { and, eq, inArray } from "drizzle-orm";
import { db } from "@/db";
import { blogImages } from "@/db/schema";

// Every query is scoped by projectId, like BlogRepository.

type BlogImage = typeof blogImages.$inferSelect;

async function insertImage(row: BlogImage) {
  await db.insert(blogImages).values(row);
}

async function getImage(projectId: string, imageId: string) {
  const rows = await db
    .select()
    .from(blogImages)
    .where(and(eq(blogImages.projectId, projectId), eq(blogImages.id, imageId)))
    .limit(1);
  return rows[0] ?? null;
}

async function listArticleImages(projectId: string, articleId: string) {
  return db
    .select()
    .from(blogImages)
    .where(
      and(
        eq(blogImages.projectId, projectId),
        eq(blogImages.articleId, articleId),
      ),
    );
}

async function deleteImages(projectId: string, imageIds: string[]) {
  if (!imageIds.length) return;
  await db
    .delete(blogImages)
    .where(
      and(
        eq(blogImages.projectId, projectId),
        inArray(blogImages.id, imageIds),
      ),
    );
}

async function setWordpressMedia(
  projectId: string,
  imageId: string,
  media: { site: string; mediaId: number; url: string },
) {
  await db
    .update(blogImages)
    .set({
      wordpressSite: media.site,
      wordpressMediaId: media.mediaId,
      wordpressUrl: media.url,
    })
    .where(
      and(eq(blogImages.projectId, projectId), eq(blogImages.id, imageId)),
    );
}

export type { BlogImage };

export const BlogImageRepository = {
  insertImage,
  getImage,
  listArticleImages,
  deleteImages,
  setWordpressMedia,
} as const;

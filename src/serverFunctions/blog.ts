import { createServerFn } from "@tanstack/react-start";
import { BlogService } from "@/server/features/blog/services/BlogService";
import {
  createArticleImage,
  removeArticleImage,
  setReferenceImage,
} from "@/server/features/blog/services/blogImages";
import {
  createBlogBrief,
  findBlogTopics,
} from "@/server/features/blog/services/blogResearch";
import {
  listSiteCategories,
  saveArticleFiling,
} from "@/server/features/blog/services/blogFiling";
import {
  listVersionSummaries,
  restoreVersion,
} from "@/server/features/blog/services/blogVersions";
import { reviewBlogArticle } from "@/server/features/blog/services/blogWriter";
import { startArticleWriting } from "@/server/features/blog/services/blogWriting";
import { requireProjectContext } from "@/serverFunctions/middleware";
import {
  blogArticleSchema,
  blogProjectSchema,
  blogTopicSchema,
  connectWordpressSchema,
  createBlogImageSchema,
  removeBlogImageSchema,
  restoreBlogVersionSchema,
  saveBlogArticleFilingSchema,
  setBlogReferenceImageSchema,
  sendBlogArticleSchema,
  skipBlogTopicSchema,
  updateBlogArticleSchema,
  updateBlogSettingsSchema,
  writeBlogArticleSchema,
} from "@/types/schemas/blog";

export const getBlogSettings = createServerFn({ method: "POST" })
  .middleware(requireProjectContext)
  .validator(blogProjectSchema)
  .handler(({ context }) => BlogService.getSettings(context.projectId));

export const updateBlogSettings = createServerFn({ method: "POST" })
  .middleware(requireProjectContext)
  .validator(updateBlogSettingsSchema)
  .handler(({ data, context }) =>
    BlogService.updateSettings(context.projectId, {
      publishMode: data.publishMode,
      postsPerWeek: data.postsPerWeek,
    }),
  );

export const connectWordpress = createServerFn({ method: "POST" })
  .middleware(requireProjectContext)
  .validator(connectWordpressSchema)
  .handler(({ data, context }) =>
    BlogService.connectWordpress(context.projectId, {
      url: data.url,
      username: data.username,
      password: data.password,
    }),
  );

export const testWordpress = createServerFn({ method: "POST" })
  .middleware(requireProjectContext)
  .validator(blogProjectSchema)
  .handler(({ context }) => BlogService.testWordpress(context.projectId));

export const disconnectWordpress = createServerFn({ method: "POST" })
  .middleware(requireProjectContext)
  .validator(blogProjectSchema)
  .handler(({ context }) => BlogService.disconnectWordpress(context.projectId));

export const listBlogTopics = createServerFn({ method: "POST" })
  .middleware(requireProjectContext)
  .validator(blogProjectSchema)
  .handler(({ context }) => BlogService.listTopics(context.projectId));

export const findTopics = createServerFn({ method: "POST" })
  .middleware(requireProjectContext)
  .validator(blogProjectSchema)
  .handler(({ context }) => findBlogTopics(context.project, context));

export const skipBlogTopic = createServerFn({ method: "POST" })
  .middleware(requireProjectContext)
  .validator(skipBlogTopicSchema)
  .handler(({ data, context }) =>
    BlogService.setTopicSkipped(context.projectId, data.topicId, data.skipped),
  );

export const createBrief = createServerFn({ method: "POST" })
  .middleware(requireProjectContext)
  .validator(blogTopicSchema)
  .handler(({ data, context }) =>
    createBlogBrief(context.project, data.topicId, context),
  );

export const listBlogArticles = createServerFn({ method: "POST" })
  .middleware(requireProjectContext)
  .validator(blogProjectSchema)
  .handler(({ context }) => BlogService.listArticles(context.projectId));

export const getBlogArticle = createServerFn({ method: "POST" })
  .middleware(requireProjectContext)
  .validator(blogArticleSchema)
  .handler(({ data, context }) =>
    BlogService.getArticle(context.project, data.articleId),
  );

export const updateBlogArticle = createServerFn({ method: "POST" })
  .middleware(requireProjectContext)
  .validator(updateBlogArticleSchema)
  .handler(({ data, context }) =>
    BlogService.updateArticle(context.projectId, {
      articleId: data.articleId,
      title: data.title,
      content: data.content,
      metaDescription: data.metaDescription,
    }),
  );

export const deleteBlogArticle = createServerFn({ method: "POST" })
  .middleware(requireProjectContext)
  .validator(blogArticleSchema)
  .handler(({ data, context }) =>
    BlogService.deleteArticle(context.projectId, data.articleId),
  );

export const sendBlogArticle = createServerFn({ method: "POST" })
  .middleware(requireProjectContext)
  .validator(sendBlogArticleSchema)
  .handler(({ data, context }) =>
    BlogService.sendToWordpress(context.project, {
      articleId: data.articleId,
      publish: data.publish,
    }),
  );

export const writeBlogArticleWithAi = createServerFn({ method: "POST" })
  .middleware(requireProjectContext)
  .validator(writeBlogArticleSchema)
  // Starts a background job; the article page watches for the text.
  .handler(({ data, context }) =>
    startArticleWriting(
      context.projectId,
      { articleId: data.articleId, replace: data.replace },
      context,
    ),
  );

export const listBlogArticleVersions = createServerFn({ method: "POST" })
  .middleware(requireProjectContext)
  .validator(blogArticleSchema)
  .handler(({ data, context }) =>
    listVersionSummaries(context.projectId, data.articleId),
  );

export const restoreBlogArticleVersion = createServerFn({ method: "POST" })
  .middleware(requireProjectContext)
  .validator(restoreBlogVersionSchema)
  .handler(({ data, context }) =>
    restoreVersion(context.projectId, data.articleId, data.versionId),
  );

export const listBlogCategories = createServerFn({ method: "POST" })
  .middleware(requireProjectContext)
  .validator(blogProjectSchema)
  .handler(({ context }) => listSiteCategories(context.projectId));

export const saveBlogArticleFiling = createServerFn({ method: "POST" })
  .middleware(requireProjectContext)
  .validator(saveBlogArticleFilingSchema)
  .handler(({ data, context }) =>
    saveArticleFiling(context.projectId, {
      articleId: data.articleId,
      category: data.category,
      tags: data.tags,
    }),
  );

export const reviewBlogArticleWithAi = createServerFn({ method: "POST" })
  .middleware(requireProjectContext)
  .validator(blogArticleSchema)
  .handler(({ data, context }) =>
    reviewBlogArticle(context.project, data.articleId, context),
  );

export const createBlogImage = createServerFn({ method: "POST" })
  .middleware(requireProjectContext)
  .validator(createBlogImageSchema)
  .handler(({ data, context }) =>
    createArticleImage(
      context.projectId,
      data.kind === "featured"
        ? {
            articleId: data.articleId,
            kind: "featured",
            customPrompt: data.customPrompt,
          }
        : {
            articleId: data.articleId,
            kind: "section",
            heading: data.heading,
            context: data.context,
          },
      context,
    ),
  );

export const setBlogReferenceImage = createServerFn({ method: "POST" })
  .middleware(requireProjectContext)
  .validator(setBlogReferenceImageSchema)
  .handler(({ data, context }) =>
    setReferenceImage(context.projectId, {
      articleId: data.articleId,
      mediaType: data.mediaType,
      base64: data.base64,
    }),
  );

export const removeBlogImage = createServerFn({ method: "POST" })
  .middleware(requireProjectContext)
  .validator(removeBlogImageSchema)
  .handler(({ data, context }) =>
    removeArticleImage(context.projectId, {
      articleId: data.articleId,
      imageId: data.imageId,
    }),
  );

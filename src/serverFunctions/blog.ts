import { createServerFn } from "@tanstack/react-start";
import { waitUntil } from "cloudflare:workers";
import { BlogService } from "@/server/features/blog/services/BlogService";
import {
  createBlogBrief,
  findBlogTopics,
} from "@/server/features/blog/services/blogResearch";
import {
  reviewBlogArticle,
  writeBlogArticle,
} from "@/server/features/blog/services/blogWriter";
import { requireProjectContext } from "@/serverFunctions/middleware";
import {
  blogArticleSchema,
  blogProjectSchema,
  blogTopicSchema,
  connectWordpressSchema,
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
  .handler(({ data, context }) => {
    const work = writeBlogArticle(
      context.project,
      { articleId: data.articleId, replace: data.replace },
      context,
    );
    // The result is saved on the server, so a closed tab doesn't waste a paid
    // run: keep the work alive within the request's background grace period.
    waitUntil(work.catch(() => undefined));
    return work;
  });

export const reviewBlogArticleWithAi = createServerFn({ method: "POST" })
  .middleware(requireProjectContext)
  .validator(blogArticleSchema)
  .handler(({ data, context }) =>
    reviewBlogArticle(context.project, data.articleId, context),
  );

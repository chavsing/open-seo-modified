import { z } from "zod";
import {
  createBlogBrief,
  createBlogBriefFromKeyword,
} from "@/server/features/blog/services/blogResearch";
import { BlogService } from "@/server/features/blog/services/BlogService";
import { startArticleWriting } from "@/server/features/blog/services/blogWriting";
import { ProjectRepository } from "@/server/features/projects/repositories/ProjectRepository";
import { AppError } from "@/server/lib/errors";
import { buildProjectMeta } from "@/server/mcp/context";
import { mcpResponse } from "@/server/mcp/formatters";
import { optionalMetaOutputSchema } from "@/server/mcp/output-schemas";
import { withMcpProjectAuth } from "@/server/mcp/project-auth";
import { projectIdSchema } from "@/server/mcp/schemas";

// The Blog Generator for the customer's own AI app: find a topic, start an
// article, write it with AI and send it to WordPress. The same services as
// the app, so credits, the writing hold and WordPress's quality gates apply
// exactly as they do there.

/** The full project row the Blog Generator services take. The auth gate
 *  already checked the caller may use it. */
async function blogProject(projectId: string, organizationId: string) {
  const project = await ProjectRepository.getProjectForOrganization(
    projectId,
    organizationId,
  );
  if (!project) throw new AppError("FORBIDDEN");
  return project;
}

const blogPath = (projectId: string, articleId?: string) =>
  articleId ? `/p/${projectId}/blog/${articleId}` : `/p/${projectId}/blog`;
const articleIdSchema = z
  .string()
  .uuid()
  .describe("Article ID from list_blog_articles or start_blog_article.");

const listInput = { projectId: projectIdSchema } as const;

export const listBlogTopicsTool = {
  name: "list_blog_topics",
  config: {
    title: "List blog topic ideas",
    description:
      "Lists the project's blog topic ideas from the Blog Generator: keywords competitors rank for, with monthly searches. Uses no credits. Pass a topic's id to start_blog_article. Status idea is unused, used already has an article, skipped was set aside by the user.",
    inputSchema: listInput,
    outputSchema: z.looseObject({
      topics: z.array(z.looseObject({ id: z.string(), keyword: z.string() })),
      ...optionalMetaOutputSchema,
    }),
    annotations: {
      readOnlyHint: true,
      openWorldHint: false,
      destructiveHint: false,
    },
  },
  handler: withMcpProjectAuth(
    async (args: z.infer<z.ZodObject<typeof listInput>>, context) => {
      const topics = (await BlogService.listTopics(args.projectId)).map(
        (topic) => ({
          id: topic.id,
          keyword: topic.keyword,
          searchVolume: topic.searchVolume,
          competitorDomain: topic.competitorDomain,
          status: topic.status,
        }),
      );
      return mcpResponse({
        text: topics.length
          ? topics
              .map(
                (topic) =>
                  `- ${topic.keyword} (${topic.searchVolume ?? "?"} searches/month, ${topic.status}) id: ${topic.id}`,
              )
              .join("\n")
          : "No topic ideas yet. The user can find them on the Blog Generator page, or start an article from any keyword with start_blog_article.",
        meta: buildProjectMeta(
          context,
          args.projectId,
          blogPath(args.projectId),
        ),
        structuredContent: { topics },
      });
    },
  ),
};

export const listBlogArticlesTool = {
  name: "list_blog_articles",
  config: {
    title: "List blog articles",
    description:
      "Lists the project's Blog Generator articles, newest first, with status (brief, ready, wp_draft, published, failed), whether AI is writing one now, and the WordPress link once sent. Uses no credits.",
    inputSchema: listInput,
    outputSchema: z.looseObject({
      articles: z.array(z.looseObject({ id: z.string(), keyword: z.string() })),
      ...optionalMetaOutputSchema,
    }),
    annotations: {
      readOnlyHint: true,
      openWorldHint: false,
      destructiveHint: false,
    },
  },
  handler: withMcpProjectAuth(
    async (args: z.infer<z.ZodObject<typeof listInput>>, context) => {
      const articles = (await BlogService.listArticles(args.projectId)).map(
        (article) => ({
          id: article.id,
          keyword: article.keyword,
          title: article.title,
          status: article.status,
          writing: article.writingStartedAt !== null,
          wordpressLink: article.wordpressLink,
        }),
      );
      return mcpResponse({
        text: articles.length
          ? articles
              .map(
                (article) =>
                  `- ${article.title || article.keyword} (${article.writing ? "writing now" : article.status}) id: ${article.id}`,
              )
              .join("\n")
          : "No articles yet. Start one with start_blog_article.",
        meta: buildProjectMeta(
          context,
          args.projectId,
          blogPath(args.projectId),
        ),
        structuredContent: { articles },
      });
    },
  ),
};

const articleInput = {
  projectId: projectIdSchema,
  articleId: articleIdSchema,
} as const;

export const getBlogArticleTool = {
  name: "get_blog_article",
  config: {
    title: "Get blog article",
    description:
      "Reads one Blog Generator article: its brief, the written text (markdown), meta description, AI review score and feedback, and status. Uses no credits. While writing is true, AI is still writing it: check again in a minute. writeError says why the last writing attempt failed.",
    inputSchema: articleInput,
    outputSchema: z.looseObject({
      id: z.string(),
      status: z.string(),
      writing: z.boolean(),
      ...optionalMetaOutputSchema,
    }),
    annotations: {
      readOnlyHint: true,
      openWorldHint: false,
      destructiveHint: false,
    },
  },
  handler: withMcpProjectAuth(
    async (args: z.infer<z.ZodObject<typeof articleInput>>, context) => {
      const article = await BlogService.getArticle(
        await blogProject(args.projectId, context.auth.organizationId),
        args.articleId,
      );
      const view = {
        id: article.id,
        keyword: article.keyword,
        title: article.title,
        status: article.status,
        writing: article.writingStartedAt !== null,
        writeError: article.writeError,
        brief: article.brief,
        content: article.content,
        metaDescription: article.metaDescription,
        aiScore: article.aiScore,
        aiFeedback: article.aiFeedback,
        aiSuggestions: article.aiSuggestions,
        wordpressLink: article.wordpressLink,
      };
      return mcpResponse({
        text: [
          `# ${view.title || view.keyword}`,
          `Status: ${view.writing ? "AI is writing it now" : view.status}${view.aiScore !== null ? `, AI review ${view.aiScore}/10` : ""}`,
          view.writeError ? `Last writing failed: ${view.writeError}` : null,
          view.content ? `\n${view.content}` : `\nBrief:\n${view.brief ?? ""}`,
        ]
          .filter((line) => line !== null)
          .join("\n"),
        meta: buildProjectMeta(
          context,
          args.projectId,
          blogPath(args.projectId, args.articleId),
        ),
        structuredContent: view,
      });
    },
  ),
};

const startInput = {
  projectId: projectIdSchema,
  topicId: z
    .string()
    .uuid()
    .optional()
    .describe("Topic idea ID from list_blog_topics."),
  keyword: z
    .string()
    .trim()
    .min(2)
    .max(120)
    .optional()
    .describe("Or any keyword the user wants an article about."),
} as const;

export const startBlogArticleTool = {
  name: "start_blog_article",
  config: {
    title: "Start a blog article",
    description:
      "Starts a Blog Generator article from a topic idea (topicId) or any keyword (keyword), and researches its brief: what to cover and which searches to answer. Uses a small amount of credits. Give exactly one of topicId or keyword. Then call write_blog_article with the returned articleId.",
    inputSchema: startInput,
    outputSchema: z.looseObject({
      articleId: z.string(),
      ...optionalMetaOutputSchema,
    }),
    annotations: {
      readOnlyHint: false,
      openWorldHint: true,
      destructiveHint: false,
    },
  },
  handler: withMcpProjectAuth(
    async (args: z.infer<z.ZodObject<typeof startInput>>, context) => {
      if (Boolean(args.topicId) === Boolean(args.keyword))
        throw new AppError(
          "VALIDATION_ERROR",
          "Give exactly one of topicId or keyword.",
        );
      const { articleId } = args.topicId
        ? await createBlogBrief(
            await blogProject(args.projectId, context.auth.organizationId),
            args.topicId,
            context.billing,
          )
        : await createBlogBriefFromKeyword(
            await blogProject(args.projectId, context.auth.organizationId),
            args.keyword ?? "",
            context.billing,
          );
      return mcpResponse({
        text: `Started the article and researched its brief. Article ID: ${articleId}. Next: write_blog_article.`,
        meta: buildProjectMeta(
          context,
          args.projectId,
          blogPath(args.projectId, articleId),
        ),
        structuredContent: { articleId },
      });
    },
  ),
};

const writeInput = {
  projectId: projectIdSchema,
  articleId: articleIdSchema,
  replace: z
    .boolean()
    .optional()
    .describe(
      "Set true only when the user agreed to replace text the article already has. Defaults to false.",
    ),
} as const;

export const writeBlogArticleTool = {
  name: "write_blog_article",
  config: {
    title: "Write a blog article with AI",
    description:
      "Has AI write the article from its brief, review it and revise it, in the background. Takes 1 to 3 minutes and uses credits (usually 2 to 3 cents; at least $0.05 must be available to start). Returns at once: call get_blog_article after a minute or two until writing is false. Refuses an article that already has text unless replace is true.",
    inputSchema: writeInput,
    outputSchema: z.looseObject({
      articleId: z.string(),
      started: z.boolean(),
      ...optionalMetaOutputSchema,
    }),
    annotations: {
      readOnlyHint: false,
      openWorldHint: true,
      // Replacing existing text is opt-in, and the old text is kept as a
      // version in the app.
      destructiveHint: false,
    },
  },
  handler: withMcpProjectAuth(
    async (args: z.infer<z.ZodObject<typeof writeInput>>, context) => {
      await startArticleWriting(
        args.projectId,
        { articleId: args.articleId, replace: args.replace ?? false },
        context.billing,
      );
      return mcpResponse({
        text: "AI is writing the article now. It takes 1 to 3 minutes; check with get_blog_article.",
        meta: buildProjectMeta(
          context,
          args.projectId,
          blogPath(args.projectId, args.articleId),
        ),
        structuredContent: { articleId: args.articleId, started: true },
      });
    },
  ),
};

const sendInput = {
  projectId: projectIdSchema,
  articleId: articleIdSchema,
  publish: z
    .boolean()
    .optional()
    .describe(
      "true publishes it live; only when the user asked to publish. Defaults to false: a WordPress draft they can check first.",
    ),
} as const;

export const sendBlogArticleToWordpressTool = {
  name: "send_blog_article_to_wordpress",
  config: {
    title: "Send a blog article to WordPress",
    description:
      "Sends a written article to the project's connected WordPress site, as a draft by default. Sending again updates the same post. Uses no credits. Publishing live needs the article to pass its quality checks and an AI review of at least 9/10 with nothing must-fix; otherwise send it as a draft. Needs WordPress connected on the Blog Generator page.",
    inputSchema: sendInput,
    outputSchema: z.looseObject({
      status: z.string(),
      link: z.string().nullable(),
      ...optionalMetaOutputSchema,
    }),
    annotations: {
      readOnlyHint: false,
      openWorldHint: true,
      destructiveHint: false,
    },
  },
  handler: withMcpProjectAuth(
    async (args: z.infer<z.ZodObject<typeof sendInput>>, context) => {
      const sent = await BlogService.sendToWordpress(
        await blogProject(args.projectId, context.auth.organizationId),
        {
          articleId: args.articleId,
          publish: args.publish ?? false,
        },
      );
      return mcpResponse({
        text: `Sent to WordPress as ${sent.status === "publish" ? "a published post" : "a draft"}: ${sent.link ?? "(no link)"}`,
        meta: buildProjectMeta(
          context,
          args.projectId,
          blogPath(args.projectId, args.articleId),
        ),
        structuredContent: { status: sent.status, link: sent.link ?? null },
      });
    },
  ),
};

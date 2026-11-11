import { z } from "zod";

// Inputs for the blog generator's server functions. projectId is resolved and
// authorized by requireProjectContext.

const projectScoped = z.object({ projectId: z.string().min(1) });

export const POSTS_PER_WEEK_OPTIONS = [0, 1, 2, 3, 5, 7] as const;

export const blogProjectSchema = projectScoped;

export const updateBlogSettingsSchema = projectScoped.extend({
  publishMode: z.enum(["draft", "auto"]).optional(),
  postsPerWeek: z
    .number()
    .int()
    .refine((value) =>
      (POSTS_PER_WEEK_OPTIONS as readonly number[]).includes(value),
    )
    .optional(),
});
export type UpdateBlogSettings = Pick<
  z.infer<typeof updateBlogSettingsSchema>,
  "publishMode" | "postsPerWeek"
>;

export const connectWordpressSchema = projectScoped.extend({
  url: z.string().trim().min(1, "Enter your site's address").max(500),
  username: z.string().trim().min(1, "Enter your WordPress username").max(200),
  password: z
    .string()
    .trim()
    .min(16, "Paste the application password WordPress gave you")
    .max(200),
});
export type ConnectWordpress = Pick<
  z.infer<typeof connectWordpressSchema>,
  "url" | "username" | "password"
>;

export const blogTopicSchema = projectScoped.extend({
  topicId: z.string().min(1),
});

export const skipBlogTopicSchema = blogTopicSchema.extend({
  skipped: z.boolean(),
});

export const blogArticleSchema = projectScoped.extend({
  articleId: z.string().min(1),
});

export const updateBlogArticleSchema = blogArticleSchema.extend({
  title: z.string().trim().min(1, "Add a title").max(200),
  content: z.string().max(100_000),
  metaDescription: z.string().trim().max(400),
});

export const sendBlogArticleSchema = blogArticleSchema.extend({
  publish: z.boolean(),
});

export const writeBlogArticleSchema = blogArticleSchema.extend({
  replace: z.boolean(),
});

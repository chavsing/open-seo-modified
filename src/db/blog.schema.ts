import {
  index,
  integer,
  sqliteTable,
  text,
  uniqueIndex,
} from "drizzle-orm/sqlite-core";
import { projects } from "./app.schema";

// ============================================================================
// Blog generator: per-project publishing settings, researched topic ideas, and
// the articles written from them.
// ============================================================================

// One row per project. The WordPress application password is ciphertext
// (symmetricEncrypt with BETTER_AUTH_SECRET); it never leaves the server.
export const blogSettings = sqliteTable("blog_settings", {
  projectId: text("project_id")
    .primaryKey()
    .references(() => projects.id, { onDelete: "cascade" }),
  // "draft": finished articles go to WordPress as drafts for a person to
  // publish. "auto": articles that pass the quality check go live.
  publishMode: text("publish_mode", { enum: ["draft", "auto"] })
    .notNull()
    .default("draft"),
  // 0 pauses automatic writing.
  postsPerWeek: integer("posts_per_week").notNull().default(0),
  wordpressUrl: text("wordpress_url"),
  wordpressUsername: text("wordpress_username"),
  wordpressPassword: text("wordpress_password"),
  updatedAt: text("updated_at").notNull(),
});

// Keywords competitors rank for and the project does not. Re-running research
// upserts onto the same (project, keyword) row, so a skipped idea stays skipped.
export const blogTopics = sqliteTable(
  "blog_topics",
  {
    id: text("id").primaryKey(),
    projectId: text("project_id")
      .notNull()
      .references(() => projects.id, { onDelete: "cascade" }),
    // Lowercased and whitespace-collapsed.
    keyword: text("keyword").notNull(),
    searchVolume: integer("search_volume"),
    keywordDifficulty: integer("keyword_difficulty"),
    competitorDomain: text("competitor_domain").notNull(),
    competitorUrl: text("competitor_url"),
    competitorPosition: integer("competitor_position"),
    status: text("status", { enum: ["idea", "used", "skipped"] })
      .notNull()
      .default("idea"),
    createdAt: text("created_at").notNull(),
  },
  (table) => [
    uniqueIndex("blog_topics_project_keyword_idx").on(
      table.projectId,
      table.keyword,
    ),
  ],
);

export const blogArticles = sqliteTable(
  "blog_articles",
  {
    id: text("id").primaryKey(),
    projectId: text("project_id")
      .notNull()
      .references(() => projects.id, { onDelete: "cascade" }),
    topicId: text("topic_id").references(() => blogTopics.id, {
      onDelete: "set null",
    }),
    keyword: text("keyword").notNull(),
    title: text("title").notNull(),
    // Markdown research brief built from the live top results.
    brief: text("brief").notNull(),
    // Markdown body; null until written.
    content: text("content"),
    status: text("status", {
      enum: ["brief", "ready", "wp_draft", "published", "failed"],
    })
      .notNull()
      .default("brief"),
    wordpressPostId: integer("wordpress_post_id"),
    wordpressLink: text("wordpress_link"),
    error: text("error"),
    createdAt: text("created_at").notNull(),
    updatedAt: text("updated_at").notNull(),
    publishedAt: text("published_at"),
  },
  (table) => [
    index("blog_articles_project_created_idx").on(
      table.projectId,
      table.createdAt,
    ),
    // One article per topic, so a double-clicked "Create brief" can't make
    // two. Nulls (articles not from a topic) don't collide.
    uniqueIndex("blog_articles_topic_idx").on(table.topicId),
  ],
);

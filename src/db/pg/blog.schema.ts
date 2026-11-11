import {
  index,
  integer,
  pgTable,
  text,
  uniqueIndex,
} from "drizzle-orm/pg-core";
import { projects } from "./app.schema";

// ============================================================================
// Blog generator: per-project publishing settings, researched topic ideas, and
// the articles written from them. Mirrors ../blog.schema.ts; timestamps are
// text and always app-written (see the note in pg/app.schema.ts).
// ============================================================================

// One row per project. The WordPress application password is ciphertext
// (symmetricEncrypt with BETTER_AUTH_SECRET); it never leaves the server.
export const blogSettings = pgTable("blog_settings", {
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
  // When the next automatic article is due. Null while postsPerWeek is 0.
  nextPostAt: text("next_post_at"),
  // The last automatic run and what came of it, shown in the settings.
  lastRunAt: text("last_run_at"),
  lastRunMessage: text("last_run_message"),
  updatedAt: text("updated_at").notNull(),
});

// Keywords competitors rank for and the project does not. Re-running research
// upserts onto the same (project, keyword) row, so a skipped idea stays skipped.
export const blogTopics = pgTable(
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

export const blogArticles = pgTable(
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
    // The AI reviewer's score out of 10 and what it would fix, one point per
    // line. Cleared when the text changes, since it no longer applies.
    aiScore: integer("ai_score"),
    aiFeedback: text("ai_feedback"),
    // The editor's nice-to-have improvements, one per line. Unlike
    // aiFeedback (must-fix), they don't block publishing.
    aiSuggestions: text("ai_suggestions"),
    // The search-result summary, sent to WordPress as the post excerpt.
    metaDescription: text("meta_description"),
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

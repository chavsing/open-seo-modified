ALTER TABLE "blog_article_versions" ADD COLUMN "ai_score" integer;--> statement-breakpoint
ALTER TABLE "blog_article_versions" ADD COLUMN "ai_feedback" text;--> statement-breakpoint
ALTER TABLE "blog_article_versions" ADD COLUMN "ai_suggestions" text;
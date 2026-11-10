ALTER TABLE "blog_articles" ADD COLUMN "ai_score" integer;--> statement-breakpoint
ALTER TABLE "blog_articles" ADD COLUMN "ai_feedback" text;--> statement-breakpoint
ALTER TABLE "blog_settings" ADD COLUMN "next_post_at" text;--> statement-breakpoint
ALTER TABLE "blog_settings" ADD COLUMN "last_run_at" text;--> statement-breakpoint
ALTER TABLE "blog_settings" ADD COLUMN "last_run_message" text;
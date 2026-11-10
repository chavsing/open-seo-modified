ALTER TABLE `blog_articles` ADD `ai_score` integer;--> statement-breakpoint
ALTER TABLE `blog_articles` ADD `ai_feedback` text;--> statement-breakpoint
ALTER TABLE `blog_settings` ADD `next_post_at` text;--> statement-breakpoint
ALTER TABLE `blog_settings` ADD `last_run_at` text;--> statement-breakpoint
ALTER TABLE `blog_settings` ADD `last_run_message` text;
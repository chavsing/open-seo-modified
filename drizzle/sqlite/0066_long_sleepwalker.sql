CREATE TABLE `blog_article_tags` (
	`article_id` text NOT NULL,
	`project_id` text NOT NULL,
	`name` text NOT NULL,
	PRIMARY KEY(`article_id`, `name`),
	FOREIGN KEY (`article_id`) REFERENCES `blog_articles`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`project_id`) REFERENCES `projects`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE TABLE `blog_article_versions` (
	`id` text PRIMARY KEY NOT NULL,
	`project_id` text NOT NULL,
	`article_id` text NOT NULL,
	`source` text NOT NULL,
	`title` text NOT NULL,
	`content` text NOT NULL,
	`meta_description` text,
	`created_at` text NOT NULL,
	FOREIGN KEY (`project_id`) REFERENCES `projects`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`article_id`) REFERENCES `blog_articles`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `blog_article_versions_article_idx` ON `blog_article_versions` (`article_id`,`created_at`);--> statement-breakpoint
ALTER TABLE `blog_articles` ADD `writing_started_at` text;--> statement-breakpoint
ALTER TABLE `blog_articles` ADD `write_error` text;--> statement-breakpoint
ALTER TABLE `blog_articles` ADD `wordpress_category_id` integer;--> statement-breakpoint
ALTER TABLE `blog_articles` ADD `wordpress_category_name` text;
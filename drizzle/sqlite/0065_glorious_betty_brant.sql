CREATE TABLE `blog_images` (
	`id` text PRIMARY KEY NOT NULL,
	`project_id` text NOT NULL,
	`article_id` text NOT NULL,
	`kind` text NOT NULL,
	`r2_key` text NOT NULL,
	`media_type` text NOT NULL,
	`alt` text NOT NULL,
	`wordpress_site` text,
	`wordpress_media_id` integer,
	`wordpress_url` text,
	`created_at` text NOT NULL,
	FOREIGN KEY (`project_id`) REFERENCES `projects`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`article_id`) REFERENCES `blog_articles`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `blog_images_article_idx` ON `blog_images` (`article_id`);
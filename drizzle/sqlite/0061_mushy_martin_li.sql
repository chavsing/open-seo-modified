CREATE TABLE `blog_articles` (
	`id` text PRIMARY KEY NOT NULL,
	`project_id` text NOT NULL,
	`topic_id` text,
	`keyword` text NOT NULL,
	`title` text NOT NULL,
	`brief` text NOT NULL,
	`content` text,
	`status` text DEFAULT 'brief' NOT NULL,
	`wordpress_post_id` integer,
	`wordpress_link` text,
	`error` text,
	`created_at` text NOT NULL,
	`updated_at` text NOT NULL,
	`published_at` text,
	FOREIGN KEY (`project_id`) REFERENCES `projects`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`topic_id`) REFERENCES `blog_topics`(`id`) ON UPDATE no action ON DELETE set null
);
--> statement-breakpoint
CREATE INDEX `blog_articles_project_created_idx` ON `blog_articles` (`project_id`,`created_at`);--> statement-breakpoint
CREATE UNIQUE INDEX `blog_articles_topic_idx` ON `blog_articles` (`topic_id`);--> statement-breakpoint
CREATE TABLE `blog_settings` (
	`project_id` text PRIMARY KEY NOT NULL,
	`publish_mode` text DEFAULT 'draft' NOT NULL,
	`posts_per_week` integer DEFAULT 0 NOT NULL,
	`wordpress_url` text,
	`wordpress_username` text,
	`wordpress_password` text,
	`updated_at` text NOT NULL,
	FOREIGN KEY (`project_id`) REFERENCES `projects`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE TABLE `blog_topics` (
	`id` text PRIMARY KEY NOT NULL,
	`project_id` text NOT NULL,
	`keyword` text NOT NULL,
	`search_volume` integer,
	`keyword_difficulty` integer,
	`competitor_domain` text NOT NULL,
	`competitor_url` text,
	`competitor_position` integer,
	`status` text DEFAULT 'idea' NOT NULL,
	`created_at` text NOT NULL,
	FOREIGN KEY (`project_id`) REFERENCES `projects`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE UNIQUE INDEX `blog_topics_project_keyword_idx` ON `blog_topics` (`project_id`,`keyword`);
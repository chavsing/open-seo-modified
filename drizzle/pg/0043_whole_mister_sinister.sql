CREATE TABLE "blog_images" (
	"id" text PRIMARY KEY NOT NULL,
	"project_id" text NOT NULL,
	"article_id" text NOT NULL,
	"kind" text NOT NULL,
	"r2_key" text NOT NULL,
	"media_type" text NOT NULL,
	"alt" text NOT NULL,
	"wordpress_site" text,
	"wordpress_media_id" integer,
	"wordpress_url" text,
	"created_at" text NOT NULL
);
--> statement-breakpoint
ALTER TABLE "blog_images" ADD CONSTRAINT "blog_images_project_id_projects_id_fk" FOREIGN KEY ("project_id") REFERENCES "public"."projects"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "blog_images" ADD CONSTRAINT "blog_images_article_id_blog_articles_id_fk" FOREIGN KEY ("article_id") REFERENCES "public"."blog_articles"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "blog_images_article_idx" ON "blog_images" USING btree ("article_id");
CREATE TABLE "blog_article_tags" (
	"article_id" text NOT NULL,
	"project_id" text NOT NULL,
	"name" text NOT NULL,
	CONSTRAINT "blog_article_tags_article_id_name_pk" PRIMARY KEY("article_id","name")
);
--> statement-breakpoint
CREATE TABLE "blog_article_versions" (
	"id" text PRIMARY KEY NOT NULL,
	"project_id" text NOT NULL,
	"article_id" text NOT NULL,
	"source" text NOT NULL,
	"title" text NOT NULL,
	"content" text NOT NULL,
	"meta_description" text,
	"created_at" text NOT NULL
);
--> statement-breakpoint
ALTER TABLE "blog_articles" ADD COLUMN "writing_started_at" text;--> statement-breakpoint
ALTER TABLE "blog_articles" ADD COLUMN "write_error" text;--> statement-breakpoint
ALTER TABLE "blog_articles" ADD COLUMN "wordpress_category_id" integer;--> statement-breakpoint
ALTER TABLE "blog_articles" ADD COLUMN "wordpress_category_name" text;--> statement-breakpoint
ALTER TABLE "blog_article_tags" ADD CONSTRAINT "blog_article_tags_article_id_blog_articles_id_fk" FOREIGN KEY ("article_id") REFERENCES "public"."blog_articles"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "blog_article_tags" ADD CONSTRAINT "blog_article_tags_project_id_projects_id_fk" FOREIGN KEY ("project_id") REFERENCES "public"."projects"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "blog_article_versions" ADD CONSTRAINT "blog_article_versions_project_id_projects_id_fk" FOREIGN KEY ("project_id") REFERENCES "public"."projects"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "blog_article_versions" ADD CONSTRAINT "blog_article_versions_article_id_blog_articles_id_fk" FOREIGN KEY ("article_id") REFERENCES "public"."blog_articles"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "blog_article_versions_article_idx" ON "blog_article_versions" USING btree ("article_id","created_at");
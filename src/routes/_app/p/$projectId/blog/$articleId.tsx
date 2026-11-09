import {
  createFileRoute,
  Link,
  useBlocker,
  useNavigate,
} from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { toast } from "sonner";
import { CheckCircle2, Trash2, XCircle } from "lucide-react";
import { ConfirmDialog } from "@/client/components/ConfirmDialog";
import { Markdown } from "@/client/components/Markdown";
import { BackLink, PageHeader } from "@/client/components/PageHeader";
import { QueryError } from "@/client/components/QueryState";
import { SafeExternalLink } from "@/client/components/SafeExternalLink";
import { SkeletonPage } from "@/client/components/SkeletonPresets";
import { Button } from "@/client/components/ui/button";
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
} from "@/client/components/ui/card";
import {
  Field,
  FieldDescription,
  FieldLabel,
} from "@/client/components/ui/field";
import { Input } from "@/client/components/ui/input";
import { Textarea } from "@/client/components/ui/textarea";
import { ArticleStatusBadge } from "@/client/features/blog/ArticleStatusBadge";
import { blogKeys } from "@/client/features/blog/blogQueries";
import { getStandardErrorMessage } from "@/client/lib/error-messages";
import {
  deleteBlogArticle,
  getBlogArticle,
  getBlogSettings,
  sendBlogArticle,
  updateBlogArticle,
} from "@/serverFunctions/blog";
import { checkArticle } from "@/shared/blog-quality";
import { BRAND_NAME } from "@/shared/brand";

export const Route = createFileRoute("/_app/p/$projectId/blog/$articleId")({
  component: BlogArticleRoute,
});

type Article = Awaited<ReturnType<typeof getBlogArticle>>;

function BlogArticleRoute() {
  const { projectId, articleId } = Route.useParams();
  const articleQuery = useQuery({
    queryKey: blogKeys.article(projectId, articleId),
    queryFn: () => getBlogArticle({ data: { projectId, articleId } }),
  });

  return (
    <div className="h-full overflow-auto px-4 py-4 pb-24 md:px-6 md:py-6 md:pb-8">
      <div className="mx-auto max-w-7xl space-y-6">
        {articleQuery.isPending ? (
          <SkeletonPage />
        ) : articleQuery.isError ? (
          <div className="space-y-4">
            <BackLink to="/p/$projectId/blog" params={{ projectId }}>
              Blog Generator
            </BackLink>
            <QueryError
              error={articleQuery.error}
              fallback="Couldn't load this article."
              onRetry={() => void articleQuery.refetch()}
              isRetrying={articleQuery.isFetching}
            />
          </div>
        ) : (
          <ArticleEditor
            key={articleQuery.data.id}
            projectId={projectId}
            article={articleQuery.data}
          />
        )}
      </div>
    </div>
  );
}

const onError = (error: unknown) => toast.error(getStandardErrorMessage(error));

function ArticleEditor({
  projectId,
  article,
}: {
  projectId: string;
  article: Article;
}) {
  const queryClient = useQueryClient();
  const navigate = useNavigate();
  const [title, setTitle] = useState(article.title);
  const [content, setContent] = useState(article.content ?? "");
  const [confirm, setConfirm] = useState<"publish" | "delete" | null>(null);
  const settingsQuery = useQuery({
    queryKey: blogKeys.settings(projectId),
    queryFn: () => getBlogSettings({ data: { projectId } }),
  });

  // Compared with what the server holds, so undoing an edit clears it.
  const dirty = title !== article.title || content !== (article.content ?? "");
  useBlocker({
    shouldBlockFn: () =>
      !window.confirm("You have unsaved changes. Leave without saving?"),
    disabled: !dirty,
    enableBeforeUnload: dirty,
  });

  const refresh = () =>
    Promise.all([
      queryClient.invalidateQueries({
        queryKey: blogKeys.article(projectId, article.id),
      }),
      queryClient.invalidateQueries({ queryKey: blogKeys.articles(projectId) }),
    ]);

  const save = useMutation({
    mutationFn: () =>
      updateBlogArticle({
        data: { projectId, articleId: article.id, title, content },
      }),
    onSuccess: async () => {
      await refresh();
      toast.success("Article saved");
    },
    onError,
  });
  const send = useMutation({
    mutationFn: async (publish: boolean) => {
      // Send what's on screen, not an older saved copy.
      if (dirty)
        await updateBlogArticle({
          data: { projectId, articleId: article.id, title, content },
        });
      return sendBlogArticle({
        data: { projectId, articleId: article.id, publish },
      });
    },
    onSuccess: (result) => {
      setConfirm(null);
      toast.success(
        result.status === "publish"
          ? "Published on WordPress"
          : "Saved as a draft in WordPress",
      );
    },
    onError: (error) => {
      setConfirm(null);
      onError(error);
    },
    // Refresh either way: a failed send records its error on the article.
    onSettled: refresh,
  });
  const remove = useMutation({
    mutationFn: () =>
      deleteBlogArticle({ data: { projectId, articleId: article.id } }),
    onSuccess: async () => {
      await Promise.all([
        queryClient.invalidateQueries({
          queryKey: blogKeys.articles(projectId),
        }),
        queryClient.invalidateQueries({ queryKey: blogKeys.topics(projectId) }),
      ]);
      void navigate({ to: "/p/$projectId/blog", params: { projectId } });
    },
    onError: (error) => {
      setConfirm(null);
      onError(error);
    },
  });

  const quality = checkArticle({
    title,
    content,
    keyword: article.keyword,
    domain: article.projectDomain,
    otherTitles: article.otherTitles,
  });
  const hasContent = content.trim().length > 0;
  const allPassed = quality.passed === quality.total;
  const isLive = article.status === "published";
  const busy = save.isPending || send.isPending || remove.isPending;
  const wordpressConnected = Boolean(settingsQuery.data?.wordpress);

  return (
    <>
      <PageHeader
        backLink={
          <BackLink to="/p/$projectId/blog" params={{ projectId }}>
            Blog Generator
          </BackLink>
        }
        title={article.title}
        description={
          <span className="flex flex-wrap items-center gap-2">
            <ArticleStatusBadge status={article.status} error={article.error} />
            {article.wordpressLink ? (
              <SafeExternalLink
                url={article.wordpressLink}
                label="Open in WordPress"
                className="inline-flex items-center gap-1 underline-offset-2 hover:underline"
              />
            ) : null}
          </span>
        }
        actions={
          <Button
            variant="ghost"
            size="sm"
            disabled={busy}
            onClick={() => setConfirm("delete")}
          >
            <Trash2 />
            Delete
          </Button>
        }
      />

      <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_22rem]">
        <div className="space-y-4">
          <Field>
            <FieldLabel htmlFor="article-title">Title</FieldLabel>
            <Input
              id="article-title"
              value={title}
              onChange={(event) => setTitle(event.target.value)}
              maxLength={200}
            />
          </Field>
          <Field>
            <FieldLabel htmlFor="article-content">Article</FieldLabel>
            <Textarea
              id="article-content"
              value={content}
              onChange={(event) => setContent(event.target.value)}
              placeholder={
                "Write in Markdown. Use ## for section headings and [text](https://...) for links.\n\nAI writing will fill this in once it's switched on for your account."
              }
              className="min-h-[28rem] font-mono text-sm"
            />
            <FieldDescription>
              Markdown. The title becomes the post&apos;s heading, so start
              sections at ##.
            </FieldDescription>
          </Field>
          <div className="flex flex-wrap items-center gap-2">
            <Button
              variant="outline"
              pending={save.isPending}
              disabled={!dirty || !title.trim() || busy}
              onClick={() => save.mutate()}
            >
              {dirty ? "Save changes" : "Saved"}
            </Button>
            {isLive ? (
              <Button
                pending={send.isPending}
                disabled={
                  !hasContent || !allPassed || !wordpressConnected || busy
                }
                onClick={() => setConfirm("publish")}
              >
                Update live post
              </Button>
            ) : (
              <>
                <Button
                  variant="outline"
                  pending={send.isPending && !send.variables}
                  disabled={!hasContent || !wordpressConnected || busy}
                  onClick={() => send.mutate(false)}
                >
                  Send to WordPress as draft
                </Button>
                <Button
                  pending={send.isPending && Boolean(send.variables)}
                  disabled={
                    !hasContent || !allPassed || !wordpressConnected || busy
                  }
                  onClick={() => setConfirm("publish")}
                >
                  Publish
                </Button>
              </>
            )}
          </div>
          {!wordpressConnected && settingsQuery.isSuccess ? (
            <p className="text-sm text-muted-foreground">
              Connect your WordPress site in the{" "}
              <Link
                to="/p/$projectId/blog"
                params={{ projectId }}
                search={{ tab: "settings" }}
                className="underline underline-offset-2 hover:text-foreground"
              >
                blog settings
              </Link>{" "}
              to send articles.
            </p>
          ) : hasContent && !allPassed ? (
            <p className="text-sm text-muted-foreground">
              Publishing unlocks when every quality check passes. You can still
              send it as a draft.
            </p>
          ) : null}
        </div>

        <div className="space-y-4">
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center justify-between">
                Quality check
                <span className="text-2xl tabular-nums">
                  {hasContent ? quality.score : "-"}
                  <span className="text-sm text-muted-foreground">/10</span>
                </span>
              </CardTitle>
            </CardHeader>
            <CardContent>
              <ul className="space-y-2 text-sm">
                {quality.checks.map((check) => (
                  <li key={check.id} className="flex gap-2">
                    {check.passed ? (
                      <CheckCircle2 className="mt-0.5 size-4 shrink-0 text-success" />
                    ) : (
                      <XCircle className="mt-0.5 size-4 shrink-0 text-destructive" />
                    )}
                    <span>
                      {check.label}
                      {check.detail ? (
                        <span className="block text-xs text-muted-foreground">
                          {check.detail}
                        </span>
                      ) : null}
                    </span>
                  </li>
                ))}
              </ul>
            </CardContent>
          </Card>
          <Card>
            <CardHeader>
              <CardTitle>Research brief</CardTitle>
            </CardHeader>
            <CardContent>
              <Markdown className="space-y-2 text-sm break-words">
                {article.brief}
              </Markdown>
            </CardContent>
          </Card>
        </div>
      </div>

      {confirm === "publish" ? (
        <ConfirmDialog
          title={isLive ? "Update the live post?" : "Publish this article?"}
          confirmLabel={isLive ? "Update live post" : "Publish now"}
          pending={send.isPending}
          onConfirm={() => send.mutate(true)}
          onClose={() => setConfirm(null)}
        >
          {isLive
            ? "The post on your WordPress site will be replaced with this version."
            : "It goes live on your WordPress site straight away, where visitors and Google can see it."}
        </ConfirmDialog>
      ) : null}
      {confirm === "delete" ? (
        <ConfirmDialog
          title="Delete this article?"
          confirmLabel="Delete"
          destructive
          pending={remove.isPending}
          onConfirm={() => remove.mutate()}
          onClose={() => setConfirm(null)}
        >
          It is removed from {BRAND_NAME}. Anything already sent to WordPress
          stays there. Its topic goes back to your topic ideas.
        </ConfirmDialog>
      ) : null}
    </>
  );
}

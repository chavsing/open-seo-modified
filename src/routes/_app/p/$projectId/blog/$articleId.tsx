import {
  createFileRoute,
  useBlocker,
  useNavigate,
} from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { toast } from "sonner";
import { Sparkles, Trash2 } from "lucide-react";
import { BackLink, PageHeader } from "@/client/components/PageHeader";
import { QueryError } from "@/client/components/QueryState";
import { SafeExternalLink } from "@/client/components/SafeExternalLink";
import { SkeletonPage } from "@/client/components/SkeletonPresets";
import { Button } from "@/client/components/ui/button";
import {
  Field,
  FieldDescription,
  FieldLabel,
} from "@/client/components/ui/field";
import { Input } from "@/client/components/ui/input";
import { Textarea } from "@/client/components/ui/textarea";
import { AiReviewCard } from "@/client/features/blog/AiReviewCard";
import { ArticleConfirmDialogs } from "@/client/features/blog/ArticleConfirmDialogs";
import { MetaDescriptionField } from "@/client/features/blog/MetaDescriptionField";
import { SendHint } from "@/client/features/blog/SendHint";
import { ArticleSidePanel } from "@/client/features/blog/ArticleSidePanel";
import { ArticleStatusBadge } from "@/client/features/blog/ArticleStatusBadge";
import { blogKeys, toastBlogError } from "@/client/features/blog/blogQueries";
import {
  deleteBlogArticle,
  getBlogArticle,
  getBlogSettings,
  sendBlogArticle,
  updateBlogArticle,
  writeBlogArticleWithAi,
} from "@/serverFunctions/blog";
import { checkArticle, PUBLISH_MIN_SCORE } from "@/shared/blog-quality";

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

const SEND_FAILED =
  "Couldn't send to WordPress. The reason is shown under the title.";
const onError = (error: unknown) =>
  toastBlogError(error, { NOT_FOUND: "This article no longer exists." });

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
  const [meta, setMeta] = useState(article.metaDescription ?? "");
  const [confirm, setConfirm] = useState<"publish" | "delete" | "write" | null>(
    null,
  );
  const settingsQuery = useQuery({
    queryKey: blogKeys.settings(projectId),
    queryFn: () => getBlogSettings({ data: { projectId } }),
  });

  // Compared with what the server holds, so undoing an edit clears it.
  const dirty =
    title !== article.title ||
    content !== (article.content ?? "") ||
    meta.trim() !== (article.metaDescription ?? "");
  const edits = { title, content, metaDescription: meta };
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
        data: { projectId, articleId: article.id, ...edits },
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
          data: { projectId, articleId: article.id, ...edits },
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
      // The server records WordPress's reason on the article, shown under the title.
      toastBlogError(error, {
        VALIDATION_ERROR: SEND_FAILED,
        UPSTREAM_UNAVAILABLE: SEND_FAILED,
      });
    },
    // Refresh either way: a failed send records its error on the article.
    onSettled: refresh,
  });
  const write = useMutation({
    mutationFn: (replace: boolean) =>
      writeBlogArticleWithAi({
        data: { projectId, articleId: article.id, replace },
      }),
    onSuccess: async (result) => {
      setConfirm(null);
      await refresh();
      setTitle(result.title);
      setContent(result.content);
      setMeta(result.metaDescription);
      toast.success(
        `Article written and saved, AI score ${result.aiScore}/10. Read it through before sending.`,
      );
    },
    onError: (error) => {
      setConfirm(null);
      toastBlogError(error, {
        UPSTREAM_UNAVAILABLE:
          "AI writing isn't available right now. Please try again later.",
        VALIDATION_ERROR: "Add your website to this project first.",
        CONFLICT:
          "This article already has text. Reload the page and try again.",
        NOT_FOUND: "This article was deleted.",
      });
    },
  });
  const startWriting = () => {
    // Replacing text, on screen or saved, needs a yes first.
    if (content.trim() || article.content?.trim()) setConfirm("write");
    else write.mutate(false);
  };
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
    ...edits,
    keyword: article.keyword,
    brief: article.brief,
    domain: article.projectDomain,
    otherTitles: article.otherTitles,
  });
  const hasContent = content.trim().length > 0;
  // Publishing also needs the AI editor's pass for the saved text.
  const allPassed =
    quality.passed === quality.total &&
    (article.aiScore ?? 0) >= PUBLISH_MIN_SCORE &&
    !dirty;
  const isLive = article.status === "published";
  const busy =
    save.isPending || send.isPending || remove.isPending || write.isPending;
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
              disabled={write.isPending}
            />
          </Field>
          <Field>
            <div className="flex flex-wrap items-center justify-between gap-2">
              <FieldLabel htmlFor="article-content">Article</FieldLabel>
              <Button
                variant="outline"
                size="sm"
                pending={write.isPending}
                disabled={busy}
                onClick={startWriting}
              >
                <Sparkles />
                {write.isPending
                  ? "Writing and reviewing, 1 to 2 minutes"
                  : hasContent
                    ? "Rewrite with AI"
                    : "Write with AI"}
              </Button>
            </div>
            <Textarea
              id="article-content"
              value={content}
              onChange={(event) => setContent(event.target.value)}
              disabled={write.isPending}
              placeholder={
                "Write in Markdown. Use ## for section headings and [text](https://...) for links.\n\nOr press Write with AI to draft it from the research brief."
              }
              className="min-h-[28rem] font-mono text-sm"
            />
            <FieldDescription>
              Markdown. The title becomes the post&apos;s heading, so start
              sections at ##.
            </FieldDescription>
          </Field>
          <MetaDescriptionField
            value={meta}
            onChange={setMeta}
            disabled={write.isPending}
          />
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
          <SendHint
            projectId={projectId}
            showConnect={!wordpressConnected && settingsQuery.isSuccess}
            showLocked={hasContent && !allPassed}
          />
        </div>

        <div className="space-y-4">
          <AiReviewCard
            projectId={projectId}
            articleId={article.id}
            aiScore={article.aiScore}
            aiFeedback={article.aiFeedback}
            aiSuggestions={article.aiSuggestions}
            hasContent={hasContent}
            dirty={dirty}
            busy={busy}
            onReviewed={refresh}
          />
          <ArticleSidePanel
            quality={quality}
            hasContent={hasContent}
            brief={article.brief}
          />
        </div>
      </div>

      <ArticleConfirmDialogs
        confirm={confirm}
        isLive={isLive}
        pending={{
          send: send.isPending,
          write: write.isPending,
          remove: remove.isPending,
        }}
        onPublish={() => send.mutate(true)}
        onWrite={() => write.mutate(true)}
        onDelete={() => remove.mutate()}
        onClose={() => setConfirm(null)}
      />
    </>
  );
}

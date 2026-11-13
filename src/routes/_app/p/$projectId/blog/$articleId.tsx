import { createFileRoute, useBlocker } from "@tanstack/react-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { Sparkles } from "lucide-react";
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
import { AiReviewCard } from "@/client/features/blog/AiReviewCard";
import {
  ArticleBodyEditor,
  type ArticleEditorApi,
} from "@/client/features/blog/ArticleBodyEditor";
import { ArticleConfirmDialogs } from "@/client/features/blog/ArticleConfirmDialogs";
import { FeaturedImageBlock } from "@/client/features/blog/FeaturedImageBlock";
import { FeaturedImageCard } from "@/client/features/blog/FeaturedImageCard";
import { SectionImagesDialog } from "@/client/features/blog/SectionImagesDialog";
import { MetaDescriptionField } from "@/client/features/blog/MetaDescriptionField";
import {
  ArticleSendBar,
  useSendArticle,
} from "@/client/features/blog/ArticleSendBar";
import { ArticleSidePanel } from "@/client/features/blog/ArticleSidePanel";
import { ArticleStatusBadge } from "@/client/features/blog/ArticleStatusBadge";
import { blogKeys } from "@/client/features/blog/blogQueries";
import { useArticleAutosave } from "@/client/features/blog/useArticleAutosave";
import { ArticleFilingCard } from "@/client/features/blog/ArticleFilingCard";
import {
  ArticleHeaderActions,
  useDeleteArticle,
} from "@/client/features/blog/ArticleHeaderActions";
import { VersionHistoryDialog } from "@/client/features/blog/VersionHistoryDialog";
import { isWriting } from "@/shared/blog-writing";
import { useArticleImages } from "@/client/features/blog/useArticleImages";
import { useWriteArticle } from "@/client/features/blog/useWriteArticle";
import { getBlogArticle, getBlogSettings } from "@/serverFunctions/blog";
import { markdownSections } from "@/shared/blog-images";
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
    // While AI writes in the background, watch for the text.
    refetchInterval: (query) =>
      isWriting(query.state.data?.writingStartedAt) ? 4000 : false,
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

function ArticleEditor({
  projectId,
  article,
}: {
  projectId: string;
  article: Article;
}) {
  const queryClient = useQueryClient();
  const [title, setTitle] = useState(article.title);
  const [content, setContent] = useState(article.content ?? "");
  const [meta, setMeta] = useState(article.metaDescription ?? "");
  const [confirm, setConfirm] = useState<"publish" | "delete" | "write" | null>(
    null,
  );
  const [pictures, setPictures] = useState(false);
  const [history, setHistory] = useState(false);
  // The editor's Markdown formatting and picture placeholders, once loaded.
  const [editorApi, setEditorApi] = useState<ArticleEditorApi | null>(null);
  const settingsQuery = useQuery({
    queryKey: blogKeys.settings(projectId),
    queryFn: () => getBlogSettings({ data: { projectId } }),
  });

  // Compared with what the server holds, so undoing an edit clears it. The
  // editor may format the saved Markdown differently without any change.
  const saved = article.content ?? "";
  const contentChanged =
    content !== saved &&
    (!editorApi || editorApi.normalize(content) !== editorApi.normalize(saved));
  const dirty =
    title.trim() !== article.title ||
    contentChanged ||
    meta.trim() !== (article.metaDescription ?? "");
  const edits = { title, content, metaDescription: meta };

  const refresh = () =>
    Promise.all([
      queryClient.invalidateQueries({
        queryKey: blogKeys.article(projectId, article.id),
      }),
      queryClient.invalidateQueries({ queryKey: blogKeys.articles(projectId) }),
    ]);

  const send = useSendArticle({
    projectId,
    articleId: article.id,
    // Send what's on screen, not an older saved copy.
    unsaved: dirty ? edits : null,
    onDone: () => setConfirm(null),
    onSettled: refresh,
  });
  // Takes text that arrived from the server (AI writing, a restore).
  const takeText = (text: {
    title: string;
    content: string | null;
    metaDescription: string | null;
  }) => {
    setTitle(text.title);
    setContent(text.content ?? "");
    setMeta(text.metaDescription ?? "");
  };
  const write = useWriteArticle({
    projectId,
    article,
    onDone: () => setConfirm(null),
    onStarted: refresh,
    onWritten: takeText,
  });
  const startWriting = () => {
    // Replacing text, on screen or saved, needs a yes first.
    if (content.trim() || article.content?.trim()) setConfirm("write");
    else write.start.mutate(false);
  };
  const remove = useDeleteArticle({
    projectId,
    articleId: article.id,
    onFailed: () => setConfirm(null),
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
  const busy = send.isPending || remove.isPending || write.writing;
  const wordpressConnected = Boolean(settingsQuery.data?.wordpress);
  const autosave = useArticleAutosave({
    projectId,
    articleId: article.id,
    edits,
    dirty,
    paused: busy,
    onSaved: refresh,
  });
  const images = useArticleImages({
    projectId,
    articleId: article.id,
    editor: editorApi,
    disabled: busy,
    onChanged: refresh,
  });
  // Leaving loses unsaved words and any picture still being made.
  const atRisk = dirty || images.working;
  useBlocker({
    shouldBlockFn: () =>
      !window.confirm(
        images.working
          ? "A picture is still being made and will be lost. Leave anyway?"
          : "Your latest changes aren't saved yet. Leave anyway?",
      ),
    disabled: !atRisk,
    enableBeforeUnload: atRisk,
  });
  const sectionsPending = images.sectionsPending;
  const canSend =
    hasContent &&
    Boolean(title.trim()) &&
    wordpressConnected &&
    !busy &&
    !images.working;

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
          <ArticleHeaderActions
            saveStatus={autosave.status}
            onRetrySave={autosave.retry}
            sectionsPending={sectionsPending}
            canAddPictures={hasContent && !busy && Boolean(editorApi)}
            onAddPictures={() => setPictures(true)}
            canChange={!busy && !images.working}
            onHistory={() => setHistory(true)}
            onDelete={() => setConfirm("delete")}
          />
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
              disabled={write.writing}
            />
          </Field>
          <Field>
            <div className="flex flex-wrap items-center justify-between gap-2">
              <FieldLabel>Article</FieldLabel>
              <Button
                variant="outline"
                size="sm"
                pending={write.writing}
                disabled={busy || images.working}
                onClick={startWriting}
              >
                <Sparkles />
                {write.writing
                  ? "Writing and reviewing, 1 to 3 minutes"
                  : hasContent
                    ? "Rewrite with AI"
                    : "Write with AI"}
              </Button>
            </div>
            <ArticleBodyEditor
              value={content}
              onChange={setContent}
              disabled={write.writing}
              onReady={setEditorApi}
              imageActions={images.imageActions}
              header={
                <FeaturedImageBlock
                  image={article.featuredImage}
                  generating={images.featured.isPending}
                  disabled={
                    busy || images.featured.isPending || images.remove.isPending
                  }
                  onGenerate={() => images.featured.mutate()}
                  onRemove={(id) => images.remove.mutate(id)}
                />
              }
            />
            {write.lastError ? (
              <p className="text-sm text-destructive">
                Writing failed: {write.lastError}
              </p>
            ) : null}
            <FieldDescription>
              The title becomes the post&apos;s heading, so start each section
              with a section heading. Or press Write with AI to draft it from
              the research brief.
            </FieldDescription>
          </Field>
          <MetaDescriptionField
            value={meta}
            onChange={setMeta}
            disabled={write.writing}
          />
          <ArticleSendBar
            projectId={projectId}
            isLive={isLive}
            sending={
              send.isPending ? (send.variables ? "publish" : "draft") : null
            }
            canSend={canSend}
            canPublish={canSend && allPassed}
            showConnect={!wordpressConnected && settingsQuery.isSuccess}
            showLocked={hasContent && !allPassed}
            onDraft={() => send.mutate(false)}
            onPublish={() => setConfirm("publish")}
          />
        </div>

        <div className="space-y-4">
          <FeaturedImageCard
            projectId={projectId}
            articleId={article.id}
            hasFeaturedImage={Boolean(article.featuredImage)}
            referenceImage={article.referenceImage}
            description={images.description}
            onDescriptionChange={images.setDescription}
            generating={images.featured.isPending}
            onGenerate={() => images.featured.mutate()}
            busy={busy}
            onChanged={refresh}
          />
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
          <ArticleFilingCard
            projectId={projectId}
            articleId={article.id}
            category={
              article.wordpressCategoryId && article.wordpressCategoryName
                ? {
                    id: article.wordpressCategoryId,
                    name: article.wordpressCategoryName,
                  }
                : null
            }
            tags={article.tags}
            wordpressConnected={wordpressConnected}
            disabled={busy}
            onSaved={refresh}
          />
          <ArticleSidePanel
            quality={quality}
            hasContent={hasContent}
            brief={article.brief}
          />
        </div>
      </div>

      {pictures ? (
        <SectionImagesDialog
          sections={markdownSections(content)}
          onCreate={(chosen) => void images.addSectionPictures(chosen)}
          onClose={() => setPictures(false)}
        />
      ) : null}
      {history ? (
        <VersionHistoryDialog
          projectId={projectId}
          articleId={article.id}
          onRestored={(text) => {
            // On screen first, so autosave never writes the old text back.
            takeText(text);
            return refresh();
          }}
          onClose={() => setHistory(false)}
        />
      ) : null}
      <ArticleConfirmDialogs
        confirm={confirm}
        isLive={isLive}
        pending={{
          send: send.isPending,
          write: write.start.isPending,
          remove: remove.isPending,
        }}
        onPublish={() => send.mutate(true)}
        onWrite={() => write.start.mutate(true)}
        onDelete={() => remove.mutate()}
        onClose={() => setConfirm(null)}
      />
    </>
  );
}

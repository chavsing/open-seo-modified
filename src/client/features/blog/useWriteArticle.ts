import { useMutation } from "@tanstack/react-query";
import { useEffect, useRef } from "react";
import { toast } from "sonner";
import { toastBlogError } from "@/client/features/blog/blogQueries";
import { writeBlogArticleWithAi } from "@/serverFunctions/blog";
import { isWriting } from "@/shared/blog-writing";

type WrittenArticle = {
  title: string;
  content: string | null;
  metaDescription: string | null;
  aiScore: number | null;
  writingStartedAt: string | null;
  writeError: string | null;
};

/**
 * Writes the article with AI (replacing any text when `replace`). The writing
 * runs on the server; the article page refreshes while it does, and the text
 * goes into the editor when it arrives. Closing the tab doesn't stop it.
 */
export function useWriteArticle({
  projectId,
  article,
  onDone,
  onStarted,
  onWritten,
}: {
  projectId: string;
  article: WrittenArticle & { id: string };
  onDone: () => void;
  onStarted: () => Promise<unknown>;
  onWritten: (article: WrittenArticle) => void;
}) {
  const start = useMutation({
    mutationFn: (replace: boolean) =>
      writeBlogArticleWithAi({
        data: { projectId, articleId: article.id, replace },
      }),
    onSuccess: async () => {
      onDone();
      await onStarted();
    },
    onError: (error) => {
      onDone();
      toastBlogError(error, {
        UPSTREAM_UNAVAILABLE:
          "AI writing isn't available right now. Please try again later.",
        VALIDATION_ERROR: "Add your website to this project first.",
        CONFLICT:
          "This article is already being written, or already has text. Reload the page.",
        NOT_FOUND: "This article was deleted.",
      });
    },
  });

  const writing = isWriting(article.writingStartedAt);
  const wasWriting = useRef(writing);
  useEffect(() => {
    if (wasWriting.current && !writing) {
      if (article.writeError) toast.error(article.writeError);
      else if (article.writingStartedAt)
        toast.error("Writing stopped before it finished. Please try again.");
      else {
        onWritten(article);
        toast.success(
          `Article written and saved, AI score ${article.aiScore ?? "-"}/10. Read it through before sending.`,
        );
      }
    }
    wasWriting.current = writing;
    // Runs when writing ends; `article` is the fresh copy of that render.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [writing]);

  return {
    start,
    /** Writing started here or elsewhere and hasn't finished. */
    writing: writing || start.isPending,
    /** Why the last writing failed, until it is tried again. */
    lastError: writing ? null : article.writeError,
  };
}

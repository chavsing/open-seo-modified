import { useMutation } from "@tanstack/react-query";
import { Check, CircleAlert, LoaderCircle } from "lucide-react";
import { useEffect, useState } from "react";
import { Button } from "@/client/components/ui/button";
import { toastBlogError } from "@/client/features/blog/blogQueries";
import { updateBlogArticle } from "@/serverFunctions/blog";

// Saves a moment after the last edit, like a shared document. A failed save
// isn't retried until the text changes again or the person presses Retry, so
// a lasting error doesn't hammer the server.
const AUTOSAVE_DELAY_MS = 1500;

type Edits = { title: string; content: string; metaDescription: string };

type SaveStatus = "saved" | "unsaved" | "saving" | "failed" | "no-title";

export function useArticleAutosave({
  projectId,
  articleId,
  edits,
  dirty,
  paused,
  onSaved,
}: {
  projectId: string;
  articleId: string;
  edits: Edits;
  dirty: boolean;
  /** While AI writes, a send runs or the article is deleted. */
  paused: boolean;
  onSaved: () => Promise<unknown>;
}) {
  const key = JSON.stringify(edits);
  const [failedKey, setFailedKey] = useState<string | null>(null);
  const save = useMutation({
    mutationFn: (saving: Edits) =>
      updateBlogArticle({ data: { projectId, articleId, ...saving } }),
    // Waits for the fresh article, so it isn't saved twice meanwhile.
    onSuccess: async () => {
      setFailedKey(null);
      await onSaved();
    },
    onError: (error, saving) => {
      setFailedKey(JSON.stringify(saving));
      toastBlogError(error, { NOT_FOUND: "This article no longer exists." });
    },
  });
  const noTitle = !edits.title.trim();
  const waiting = !dirty || paused || save.isPending || noTitle;

  useEffect(() => {
    if (waiting || failedKey === key) return;
    // This render's edits match `key`, which reruns the effect on change.
    const timer = setTimeout(() => save.mutate(edits), AUTOSAVE_DELAY_MS);
    return () => clearTimeout(timer);
    // `save` and `edits` are new objects each render; `key` covers them.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key, waiting, failedKey]);

  const status: SaveStatus = save.isPending
    ? "saving"
    : !dirty
      ? "saved"
      : noTitle
        ? "no-title"
        : failedKey === key
          ? "failed"
          : "unsaved";
  return { status, retry: () => save.mutate(edits) };
}

/** Top right of the article, where a shared document shows it. */
export function SaveStatusIndicator({
  status,
  onRetry,
}: {
  status: SaveStatus;
  onRetry: () => void;
}) {
  if (status === "failed")
    return (
      <span className="flex items-center gap-1.5 text-sm text-destructive">
        <CircleAlert className="size-4" />
        Couldn&apos;t save
        <Button
          variant="link"
          size="sm"
          className="h-auto p-0"
          onClick={onRetry}
        >
          Retry
        </Button>
      </span>
    );
  return (
    <span
      role="status"
      className="flex items-center gap-1.5 text-sm text-muted-foreground"
    >
      {status === "saving" ? (
        <LoaderCircle className="size-4 animate-spin" />
      ) : status === "saved" ? (
        <Check className="size-4" />
      ) : null}
      {status === "saving" ? (
        "Saving..."
      ) : status === "saved" ? (
        <>
          <span className="sm:hidden">Saved</span>
          <span className="hidden sm:inline">All changes saved</span>
        </>
      ) : status === "no-title" ? (
        "Add a title to save"
      ) : (
        "Unsaved changes"
      )}
    </span>
  );
}

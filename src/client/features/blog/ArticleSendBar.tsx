import { useMutation } from "@tanstack/react-query";
import { toast } from "sonner";
import { Button } from "@/client/components/ui/button";
import { toastBlogError } from "@/client/features/blog/blogQueries";
import { SendHint } from "@/client/features/blog/SendHint";
import { sendBlogArticle, updateBlogArticle } from "@/serverFunctions/blog";

const SEND_FAILED =
  "Couldn't send to WordPress. The reason is shown under the title.";

/** Sends the article as a draft (false) or live post (true). */
export function useSendArticle({
  projectId,
  articleId,
  unsaved,
  onDone,
  onSettled,
}: {
  projectId: string;
  articleId: string;
  /** Edits not saved yet, saved first so WordPress gets what's on screen. */
  unsaved: { title: string; content: string; metaDescription: string } | null;
  onDone: () => void;
  onSettled: () => Promise<unknown>;
}) {
  return useMutation({
    mutationFn: async (publish: boolean) => {
      if (unsaved)
        await updateBlogArticle({ data: { projectId, articleId, ...unsaved } });
      return sendBlogArticle({ data: { projectId, articleId, publish } });
    },
    onSuccess: (result) => {
      onDone();
      toast.success(
        result.status === "publish"
          ? "Published on WordPress"
          : "Saved as a draft in WordPress",
      );
    },
    onError: (error) => {
      onDone();
      // The server records WordPress's reason on the article, shown under the title.
      toastBlogError(error, {
        VALIDATION_ERROR: SEND_FAILED,
        UPSTREAM_UNAVAILABLE: SEND_FAILED,
      });
    },
    // Refresh either way: a failed send records its error on the article.
    onSettled,
  });
}

/** Under the editor: send as a draft, publish, and why either is off. */
export function ArticleSendBar({
  projectId,
  isLive,
  sending,
  canSend,
  canPublish,
  showConnect,
  showLocked,
  onDraft,
  onPublish,
}: {
  projectId: string;
  isLive: boolean;
  sending: "draft" | "publish" | null;
  canSend: boolean;
  canPublish: boolean;
  showConnect: boolean;
  showLocked: boolean;
  onDraft: () => void;
  onPublish: () => void;
}) {
  return (
    <>
      <div className="flex flex-wrap items-center gap-2">
        {isLive ? (
          <Button
            pending={sending !== null}
            disabled={!canPublish}
            onClick={onPublish}
          >
            Update live post
          </Button>
        ) : (
          <>
            <Button
              variant="outline"
              pending={sending === "draft"}
              disabled={!canSend}
              onClick={onDraft}
            >
              Send to WordPress as draft
            </Button>
            <Button
              pending={sending === "publish"}
              disabled={!canPublish}
              onClick={onPublish}
            >
              Publish
            </Button>
          </>
        )}
      </div>
      <SendHint
        projectId={projectId}
        showConnect={showConnect}
        showLocked={showLocked}
      />
    </>
  );
}

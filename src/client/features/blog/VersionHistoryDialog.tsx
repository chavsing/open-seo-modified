import { useMutation, useQuery } from "@tanstack/react-query";
import { toast } from "sonner";
import { QueryError } from "@/client/components/QueryState";
import { Button } from "@/client/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/client/components/ui/dialog";
import { Skeleton } from "@/client/components/ui/skeleton";
import { toastBlogError } from "@/client/features/blog/blogQueries";
import {
  listBlogArticleVersions,
  restoreBlogArticleVersion,
} from "@/serverFunctions/blog";

type RestoredText = { title: string; content: string; metaDescription: string };

const when = (iso: string) =>
  new Date(iso).toLocaleString(undefined, {
    dateStyle: "medium",
    timeStyle: "short",
  });

/**
 * Earlier versions of the article: the text from before each editing session
 * and before each AI rewrite. Restoring keeps the current text as a version
 * too, so nothing is lost by trying one.
 */
export function VersionHistoryDialog({
  projectId,
  articleId,
  onRestored,
  onClose,
}: {
  projectId: string;
  articleId: string;
  onRestored: (text: RestoredText) => Promise<unknown>;
  onClose: () => void;
}) {
  const versions = useQuery({
    queryKey: ["blog", projectId, "article", articleId, "versions"],
    queryFn: () => listBlogArticleVersions({ data: { projectId, articleId } }),
    staleTime: 0,
  });
  const restore = useMutation({
    mutationFn: (versionId: string) =>
      restoreBlogArticleVersion({ data: { projectId, articleId, versionId } }),
    onSuccess: async (text) => {
      await onRestored(text);
      toast.success("Version restored. Your previous text was kept too.");
      onClose();
    },
    onError: (error) =>
      toastBlogError(error, { NOT_FOUND: "That version no longer exists." }),
  });

  return (
    <Dialog
      open
      onOpenChange={(open) => {
        if (!open && !restore.isPending) onClose();
      }}
    >
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>Version history</DialogTitle>
          <DialogDescription>
            The article as it was before each editing session and each AI
            rewrite. The newest 30 are kept.
          </DialogDescription>
        </DialogHeader>
        {versions.isPending ? (
          <div className="space-y-2">
            <Skeleton className="h-16" />
            <Skeleton className="h-16" />
          </div>
        ) : versions.isError ? (
          <QueryError
            error={versions.error}
            fallback="Couldn't load the versions."
            onRetry={() => void versions.refetch()}
            isRetrying={versions.isFetching}
          />
        ) : versions.data.length === 0 ? (
          <p className="text-sm text-muted-foreground">
            No earlier versions yet. One is kept the next time the text changes.
          </p>
        ) : (
          <ul className="max-h-96 space-y-2 overflow-auto">
            {versions.data.map((version) => (
              <li
                key={version.id}
                className="flex items-start gap-3 rounded-md border p-3 text-sm"
              >
                <div className="min-w-0 flex-1 space-y-0.5">
                  <p className="font-medium">
                    {when(version.createdAt)}
                    <span className="font-normal text-muted-foreground">
                      {version.source === "ai"
                        ? ", before an AI rewrite or restore"
                        : ", before your edits"}
                    </span>
                  </p>
                  <p className="truncate text-muted-foreground">
                    {version.title}, {version.words} words
                  </p>
                  <p className="line-clamp-2 text-xs text-muted-foreground">
                    {version.excerpt}
                  </p>
                </div>
                <Button
                  size="sm"
                  variant="outline"
                  pending={
                    restore.isPending && restore.variables === version.id
                  }
                  disabled={restore.isPending}
                  onClick={() => restore.mutate(version.id)}
                >
                  Restore
                </Button>
              </li>
            ))}
          </ul>
        )}
      </DialogContent>
    </Dialog>
  );
}

import { useMutation, useQueryClient } from "@tanstack/react-query";
import { useNavigate } from "@tanstack/react-router";
import { History, ImagePlus, Trash2 } from "lucide-react";
import { Button } from "@/client/components/ui/button";
import { blogKeys, toastBlogError } from "@/client/features/blog/blogQueries";
import { deleteBlogArticle } from "@/serverFunctions/blog";
import {
  SaveStatusIndicator,
  type SaveStatus,
} from "@/client/features/blog/useArticleAutosave";

/** Top right of the article: save state, pictures, history and delete. */
export function ArticleHeaderActions({
  saveStatus,
  onRetrySave,
  sectionsPending,
  canAddPictures,
  onAddPictures,
  canChange,
  onHistory,
  onDelete,
}: {
  saveStatus: SaveStatus;
  onRetrySave: () => void;
  sectionsPending: number;
  canAddPictures: boolean;
  onAddPictures: () => void;
  /** Off while AI writes, a send runs or a picture is being made. */
  canChange: boolean;
  onHistory: () => void;
  onDelete: () => void;
}) {
  return (
    <>
      <SaveStatusIndicator status={saveStatus} onRetry={onRetrySave} />
      <Button
        variant="outline"
        size="sm"
        pending={sectionsPending > 0}
        disabled={!canAddPictures}
        onClick={onAddPictures}
      >
        <ImagePlus />
        {sectionsPending > 0
          ? `Creating ${sectionsPending} ${sectionsPending === 1 ? "picture" : "pictures"}`
          : "Add section pictures"}
      </Button>
      <Button
        variant="ghost"
        size="sm"
        disabled={!canChange}
        onClick={onHistory}
        aria-label="Version history"
      >
        <History />
        <span className="hidden sm:inline">History</span>
      </Button>
      <Button
        variant="ghost"
        size="sm"
        disabled={!canChange}
        onClick={onDelete}
        aria-label="Delete"
      >
        <Trash2 />
        <span className="hidden sm:inline">Delete</span>
      </Button>
    </>
  );
}

/** Deletes the article, then goes back to the Blog Generator. */
export function useDeleteArticle({
  projectId,
  articleId,
  onFailed,
}: {
  projectId: string;
  articleId: string;
  onFailed: () => void;
}) {
  const queryClient = useQueryClient();
  const navigate = useNavigate();
  return useMutation({
    mutationFn: () => deleteBlogArticle({ data: { projectId, articleId } }),
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
      onFailed();
      toastBlogError(error, { NOT_FOUND: "This article no longer exists." });
    },
  });
}

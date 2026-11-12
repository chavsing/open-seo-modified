import { useMutation } from "@tanstack/react-query";
import { toast } from "sonner";
import { toastBlogError } from "@/client/features/blog/blogQueries";
import { writeBlogArticleWithAi } from "@/serverFunctions/blog";

type Written = Awaited<ReturnType<typeof writeBlogArticleWithAi>>;

/** Writes the article with AI (replacing any text when `replace`), saved. */
export function useWriteArticle({
  projectId,
  articleId,
  onDone,
  onWritten,
}: {
  projectId: string;
  articleId: string;
  onDone: () => void;
  onWritten: (result: Written) => Promise<void>;
}) {
  return useMutation({
    mutationFn: (replace: boolean) =>
      writeBlogArticleWithAi({ data: { projectId, articleId, replace } }),
    onSuccess: async (result) => {
      onDone();
      await onWritten(result);
      toast.success(
        `Article written and saved, AI score ${result.aiScore}/10. Read it through before sending.`,
      );
    },
    onError: (error) => {
      onDone();
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
}

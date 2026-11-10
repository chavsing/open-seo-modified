import { useMutation } from "@tanstack/react-query";
import { toast } from "sonner";
import { Sparkles } from "lucide-react";
import { Button } from "@/client/components/ui/button";
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
} from "@/client/components/ui/card";
import { toastBlogError } from "@/client/features/blog/blogQueries";
import { reviewBlogArticleWithAi } from "@/serverFunctions/blog";

/**
 * The AI editor's score for the saved text and what it would fix. Publishing
 * needs a 10, and an edit clears the score, so this is where it is renewed.
 */
export function AiReviewCard({
  projectId,
  articleId,
  aiScore,
  aiFeedback,
  hasContent,
  dirty,
  busy,
  onReviewed,
}: {
  projectId: string;
  articleId: string;
  aiScore: number | null;
  aiFeedback: string | null;
  hasContent: boolean;
  /** Unsaved edits: the review reads the saved text, so save first. */
  dirty: boolean;
  busy: boolean;
  onReviewed: () => Promise<unknown>;
}) {
  const review = useMutation({
    mutationFn: () =>
      reviewBlogArticleWithAi({ data: { projectId, articleId } }),
    onSuccess: async (result) => {
      await onReviewed();
      toast.success(`AI review: ${result.aiScore}/10`);
    },
    onError: (error) =>
      toastBlogError(error, {
        UPSTREAM_UNAVAILABLE:
          "AI review isn't available right now. Please try again later.",
        VALIDATION_ERROR: "Write the article before reviewing it.",
        NOT_FOUND: "This article no longer exists.",
      }),
  });
  const problems = aiFeedback?.split("\n").filter(Boolean) ?? [];
  const scored = aiScore !== null && !dirty;

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center justify-between">
          AI review
          <span className="text-2xl tabular-nums">
            {scored ? aiScore : "-"}
            <span className="text-sm text-muted-foreground">/10</span>
          </span>
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-3 text-sm">
        {!hasContent ? (
          <p className="text-muted-foreground">
            An AI editor scores the article once it is written. Publishing needs
            a 10.
          </p>
        ) : dirty ? (
          <p className="text-muted-foreground">
            Save your changes, then review the new text.
          </p>
        ) : aiScore === null ? (
          <p className="text-muted-foreground">
            Not reviewed since the last change. Publishing needs a 10.
          </p>
        ) : problems.length ? (
          <ul className="list-disc space-y-1.5 pl-4">
            {problems.map((problem) => (
              <li key={problem}>{problem}</li>
            ))}
          </ul>
        ) : (
          <p className="text-muted-foreground">Ready to publish.</p>
        )}
        {hasContent ? (
          <Button
            variant="outline"
            size="sm"
            pending={review.isPending}
            disabled={dirty || busy || review.isPending}
            onClick={() => review.mutate()}
          >
            <Sparkles />
            {review.isPending ? "Reviewing" : "Review with AI"}
          </Button>
        ) : null}
      </CardContent>
    </Card>
  );
}

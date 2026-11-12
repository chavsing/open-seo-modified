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
import { PUBLISH_MIN_SCORE } from "@/shared/blog-quality";

/**
 * The AI editor's score for the saved text, what must be fixed and what could
 * be better. Publishing needs nothing must-fix and at least PUBLISH_MIN_SCORE,
 * and an edit clears the score, so this is where it is renewed.
 */
const toList = (text: string | null) => text?.split("\n").filter(Boolean) ?? [];

export function AiReviewCard({
  projectId,
  articleId,
  aiScore,
  aiFeedback,
  aiSuggestions,
  hasContent,
  dirty,
  busy,
  onReviewed,
}: {
  projectId: string;
  articleId: string;
  aiScore: number | null;
  aiFeedback: string | null;
  aiSuggestions: string | null;
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
  const mustFix = toList(aiFeedback);
  const suggestions = toList(aiSuggestions);
  const scored = aiScore !== null && !dirty;
  const bar = `Publishing needs nothing must-fix and at least ${PUBLISH_MIN_SCORE}/10.`;

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
            An AI editor scores the article once it is written. {bar}
          </p>
        ) : dirty ? (
          <p className="text-muted-foreground">
            Saving your changes. Review the new text once it is saved.
          </p>
        ) : aiScore === null ? (
          <p className="text-muted-foreground">
            Not reviewed since the last change. {bar}
          </p>
        ) : (
          <>
            {aiScore >= PUBLISH_MIN_SCORE && mustFix.length === 0 ? (
              <p className="font-medium text-success">
                Nothing must be fixed. Ready to publish.
              </p>
            ) : null}
            <FeedbackList title="Must fix before publishing" items={mustFix} />
            <FeedbackList title="Could be better" items={suggestions} />
          </>
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

function FeedbackList({ title, items }: { title: string; items: string[] }) {
  if (items.length === 0) return null;
  return (
    <div className="space-y-1.5">
      <p className="font-medium">{title}</p>
      <ul className="list-disc space-y-1.5 pl-4">
        {items.map((item) => (
          <li key={item}>{item}</li>
        ))}
      </ul>
    </div>
  );
}

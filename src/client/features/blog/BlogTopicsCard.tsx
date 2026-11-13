import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Link, useNavigate } from "@tanstack/react-router";
import { toast } from "sonner";
import { Lightbulb } from "lucide-react";
import { QueryError } from "@/client/components/QueryState";
import { Badge } from "@/client/components/ui/badge";
import { Button } from "@/client/components/ui/button";
import {
  Empty,
  EmptyDescription,
  EmptyHeader,
  EmptyMedia,
  EmptyTitle,
} from "@/client/components/ui/empty";
import { Skeleton } from "@/client/components/ui/skeleton";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/client/components/ui/table";
import {
  createBrief,
  findTopics,
  listBlogTopics,
  skipBlogTopic,
} from "@/serverFunctions/blog";
import { blogKeys, toastBlogError } from "./blogQueries";

export function BlogTopicsCard({ projectId }: { projectId: string }) {
  const queryClient = useQueryClient();
  const navigate = useNavigate();
  const topicsQuery = useQuery({
    queryKey: blogKeys.topics(projectId),
    queryFn: () => listBlogTopics({ data: { projectId } }),
  });
  const refresh = () =>
    queryClient.invalidateQueries({ queryKey: blogKeys.topics(projectId) });

  const find = useMutation({
    mutationFn: () => findTopics({ data: { projectId } }),
    onSuccess: async (result) => {
      await refresh();
      toast.success(
        result.added > 0
          ? `Found ${result.added} new topic ideas`
          : "No new topic ideas this time. Try again after adding more competitors.",
      );
    },
    onError: (error) =>
      toastBlogError(error, {
        VALIDATION_ERROR:
          "Add at least one competitor on the Context page first, or press Set up from my website there to find them. Topic ideas come from what competitors rank for.",
      }),
  });
  const skip = useMutation({
    mutationFn: (input: { topicId: string; skipped: boolean }) =>
      skipBlogTopic({ data: { projectId, ...input } }),
    onSuccess: refresh,
    onError: (error) => toastBlogError(error),
  });
  const brief = useMutation({
    mutationFn: (topicId: string) =>
      createBrief({ data: { projectId, topicId } }),
    onSuccess: async ({ articleId }) => {
      await Promise.all([
        refresh(),
        queryClient.invalidateQueries({
          queryKey: blogKeys.articles(projectId),
        }),
      ]);
      void navigate({
        to: "/p/$projectId/blog/$articleId",
        params: { projectId, articleId },
      });
    },
    onError: (error) =>
      toastBlogError(error, {
        VALIDATION_ERROR: "Add your website to this project first.",
        NOT_FOUND: "That topic no longer exists. Refresh the list.",
      }),
  });

  const findButton = (
    <Button pending={find.isPending} onClick={() => find.mutate()}>
      Find topic ideas
    </Button>
  );

  if (topicsQuery.isPending) return <Skeleton className="h-64 w-full" />;
  if (topicsQuery.isError)
    return (
      <QueryError
        cause={topicsQuery.error}
        fallback="Couldn't load topic ideas. Please try again."
        onRetry={() => void topicsQuery.refetch()}
        isRetrying={topicsQuery.isFetching}
      />
    );
  const topics = topicsQuery.data;

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <p className="max-w-2xl text-sm text-muted-foreground">
          Keywords your competitors rank on page one for that your site
          doesn&apos;t cover yet. Uses a few credits per search. Competitors
          come from the{" "}
          <Link
            to="/p/$projectId/context"
            params={{ projectId }}
            className="underline underline-offset-2 hover:text-foreground"
          >
            Context page
          </Link>
          .
        </p>
        {findButton}
      </div>

      {topics.length === 0 ? (
        <Empty className="border">
          <EmptyHeader>
            <EmptyMedia variant="icon">
              <Lightbulb />
            </EmptyMedia>
            <EmptyTitle>No topic ideas yet</EmptyTitle>
            <EmptyDescription>
              Click Find topic ideas to see what your competitors rank for.
            </EmptyDescription>
          </EmptyHeader>
        </Empty>
      ) : (
        <div className="overflow-x-auto rounded-xl border">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Keyword</TableHead>
                <TableHead className="text-right">Searches / mo</TableHead>
                <TableHead className="text-right">Difficulty</TableHead>
                <TableHead>Found on</TableHead>
                <TableHead className="text-right">Actions</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {topics.map((topic) => (
                <TableRow
                  key={topic.id}
                  className={topic.status === "skipped" ? "opacity-60" : ""}
                >
                  <TableCell className="font-medium">
                    {topic.keyword}
                    {topic.status === "used" ? (
                      <Badge variant="soft" className="ml-2">
                        Brief made
                      </Badge>
                    ) : null}
                  </TableCell>
                  <TableCell className="text-right tabular-nums">
                    {topic.searchVolume?.toLocaleString() ?? "-"}
                  </TableCell>
                  <TableCell className="text-right tabular-nums">
                    {topic.keywordDifficulty ?? "-"}
                  </TableCell>
                  <TableCell className="text-muted-foreground">
                    {topic.competitorDomain}
                    {topic.competitorPosition
                      ? ` (#${topic.competitorPosition})`
                      : ""}
                  </TableCell>
                  <TableCell className="text-right whitespace-nowrap">
                    {topic.status === "idea" ? (
                      <div className="flex justify-end gap-2">
                        <Button
                          size="sm"
                          variant="ghost"
                          disabled={skip.isPending}
                          onClick={() =>
                            skip.mutate({ topicId: topic.id, skipped: true })
                          }
                        >
                          Skip
                        </Button>
                        <Button
                          size="sm"
                          pending={
                            brief.isPending && brief.variables === topic.id
                          }
                          disabled={brief.isPending}
                          onClick={() => brief.mutate(topic.id)}
                        >
                          Create brief
                        </Button>
                      </div>
                    ) : topic.status === "skipped" ? (
                      <Button
                        size="sm"
                        variant="ghost"
                        disabled={skip.isPending}
                        onClick={() =>
                          skip.mutate({ topicId: topic.id, skipped: false })
                        }
                      >
                        Restore
                      </Button>
                    ) : null}
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
      )}
    </div>
  );
}

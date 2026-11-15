import { useId, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Link, useNavigate } from "@tanstack/react-router";
import { toast } from "sonner";
import { Lightbulb } from "lucide-react";
import { ConfirmDialog } from "@/client/components/ConfirmDialog";
import { QueryError } from "@/client/components/QueryState";
import { Badge } from "@/client/components/ui/badge";
import { Button } from "@/client/components/ui/button";
import { Checkbox } from "@/client/components/ui/checkbox";
import { Field, FieldLabel } from "@/client/components/ui/field";
import { Input } from "@/client/components/ui/input";
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
  createBriefFromKeyword,
  findTopics,
  listBlogTopics,
  skipBlogTopic,
  writeBlogTopics,
} from "@/serverFunctions/blog";
import { MAX_BULK_ARTICLES } from "@/types/schemas/blog";
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
  const openBrief = async ({ articleId }: { articleId: string }) => {
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
  };
  const brief = useMutation({
    mutationFn: (topicId: string) =>
      createBrief({ data: { projectId, topicId } }),
    onSuccess: openBrief,
    onError: (error) =>
      toastBlogError(error, {
        VALIDATION_ERROR: "Add your website to this project first.",
        NOT_FOUND: "That topic no longer exists. Refresh the list.",
      }),
  });

  const [selected, setSelected] = useState<string[]>([]);
  const [confirmBulk, setConfirmBulk] = useState(false);
  const bulk = useMutation({
    mutationFn: (topicIds: string[]) =>
      writeBlogTopics({ data: { projectId, topicIds } }),
    onSuccess: async ({ started, failed }) => {
      setConfirmBulk(false);
      setSelected([]);
      await Promise.all([
        refresh(),
        queryClient.invalidateQueries({
          queryKey: blogKeys.articles(projectId),
        }),
      ]);
      if (started > 0)
        toast.success(
          `Writing ${started} ${started === 1 ? "article" : "articles"} in the background. They appear under Articles in a few minutes.`,
        );
      if (failed.length > 0)
        toast.error(`${failed.length} couldn't start: ${failed[0].message}`);
    },
    onError: (error) => {
      setConfirmBulk(false);
      toastBlogError(error, {
        VALIDATION_ERROR: "Add your website to this project first.",
      });
    },
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
  const ideaIds = new Set(
    topics.filter((topic) => topic.status === "idea").map((topic) => topic.id),
  );
  // Ideas that were used or skipped since being ticked drop out.
  const chosen = selected.filter((id) => ideaIds.has(id));
  const toggle = (id: string) =>
    setSelected((current) =>
      current.includes(id)
        ? current.filter((entry) => entry !== id)
        : [...current, id],
    );

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

      <KeywordBriefForm projectId={projectId} onCreated={openBrief} />

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
        <div className="space-y-3">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <p className="text-sm text-muted-foreground">
              Tick up to {MAX_BULK_ARTICLES} ideas to write them all at once.
            </p>
            <Button
              disabled={chosen.length === 0}
              onClick={() => setConfirmBulk(true)}
            >
              {chosen.length > 1
                ? `Write ${chosen.length} articles`
                : "Write article"}
            </Button>
          </div>
          <div className="overflow-x-auto rounded-xl border">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead className="w-10">
                    <span className="sr-only">Choose</span>
                  </TableHead>
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
                    <TableCell>
                      {topic.status === "idea" ? (
                        <Checkbox
                          aria-label={`Choose ${topic.keyword}`}
                          checked={chosen.includes(topic.id)}
                          disabled={
                            !chosen.includes(topic.id) &&
                            chosen.length >= MAX_BULK_ARTICLES
                          }
                          onCheckedChange={() => toggle(topic.id)}
                        />
                      ) : null}
                    </TableCell>
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
                      {topic.competitorDomain || "Your keyword"}
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
        </div>
      )}

      {confirmBulk ? (
        <ConfirmDialog
          title={
            chosen.length > 1
              ? `Write ${chosen.length} articles?`
              : "Write this article?"
          }
          confirmLabel="Write with AI"
          pending={bulk.isPending}
          onConfirm={() => bulk.mutate(chosen)}
          onClose={() => setConfirmBulk(false)}
        >
          Each one gets a research brief, then AI writes it in the background,
          the same as Write with AI on a single article. Each article uses your
          usage credits. Nothing is sent to WordPress until you send it.
        </ConfirmDialog>
      ) : null}
    </div>
  );
}

/** Starts an article from the user's own keyword, skipping the topic search. */
function KeywordBriefForm({
  projectId,
  onCreated,
}: {
  projectId: string;
  onCreated: (result: { articleId: string }) => Promise<void>;
}) {
  const id = useId();
  const [keyword, setKeyword] = useState("");
  const create = useMutation({
    mutationFn: () =>
      createBriefFromKeyword({ data: { projectId, keyword: keyword.trim() } }),
    onSuccess: onCreated,
    onError: (error) =>
      toastBlogError(error, {
        VALIDATION_ERROR: "Add your website to this project first.",
      }),
  });

  return (
    <form
      className="flex flex-wrap items-end gap-2"
      onSubmit={(event) => {
        event.preventDefault();
        if (keyword.trim().length >= 2) create.mutate();
      }}
    >
      <Field className="min-w-0 flex-1 basis-64">
        <FieldLabel htmlFor={id}>Or write about your own keyword</FieldLabel>
        <Input
          id={id}
          value={keyword}
          maxLength={80}
          placeholder="e.g. how to choose a roofer"
          onChange={(event) => setKeyword(event.target.value)}
        />
      </Field>
      <Button
        type="submit"
        variant="outline"
        pending={create.isPending}
        disabled={keyword.trim().length < 2}
      >
        Create brief
      </Button>
    </form>
  );
}

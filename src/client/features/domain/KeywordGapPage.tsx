import { useId, useState } from "react";
import { useMutation, useQuery } from "@tanstack/react-query";
import { useNavigate } from "@tanstack/react-router";
import { toast } from "sonner";
import { SearchX } from "lucide-react";
import { Button } from "@/client/components/ui/button";
import {
  Empty,
  EmptyDescription,
  EmptyHeader,
  EmptyMedia,
  EmptyTitle,
} from "@/client/components/ui/empty";
import { Field, FieldLabel } from "@/client/components/ui/field";
import { Input } from "@/client/components/ui/input";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/client/components/ui/table";
import { ProjectPageHeader } from "@/client/features/projects/ProjectPageHeader";
import { projectsQueryOptions } from "@/client/features/projects/projectQueries";
import { getStandardErrorMessage } from "@/client/lib/error-messages";
import { createBriefFromKeyword } from "@/serverFunctions/blog";
import { getKeywordGap } from "@/serverFunctions/domain";

/** Keywords a competitor ranks for and your site doesn't, to write about. */
export function KeywordGapPage({ projectId }: { projectId: string }) {
  const id = useId();
  const navigate = useNavigate();
  const projectsQuery = useQuery(projectsQueryOptions());
  const projectDomain =
    projectsQuery.data?.find((entry) => entry.id === projectId)?.domain ?? "";
  const [yourDomain, setYourDomain] = useState<string>();
  const [competitor, setCompetitor] = useState("");
  const site = yourDomain ?? projectDomain;

  const gap = useMutation({
    mutationFn: () =>
      getKeywordGap({
        data: {
          projectId,
          yourDomain: site.trim(),
          competitor: competitor.trim(),
        },
      }),
    onError: (error) => toast.error(getStandardErrorMessage(error)),
  });
  const brief = useMutation({
    mutationFn: (keyword: string) =>
      createBriefFromKeyword({ data: { projectId, keyword } }),
    onSuccess: ({ articleId }) =>
      void navigate({
        to: "/p/$projectId/blog/$articleId",
        params: { projectId, articleId },
      }),
    onError: (error) => toast.error(getStandardErrorMessage(error)),
  });

  const ready = site.trim().length > 2 && competitor.trim().length > 2;

  return (
    <div className="h-full overflow-auto px-4 py-4 pb-24 md:px-6 md:py-6 md:pb-8">
      <div className="mx-auto max-w-7xl space-y-6">
        <ProjectPageHeader projectId={projectId} title="Keyword Gap" />
        <p className="max-w-2xl text-sm text-muted-foreground">
          Keywords a competitor ranks for on Google&apos;s first two pages that
          your site doesn&apos;t rank for at all. Each search uses a few cents
          of credits.
        </p>

        <form
          className="flex flex-wrap items-end gap-3"
          onSubmit={(event) => {
            event.preventDefault();
            if (ready) gap.mutate();
          }}
        >
          <Field className="min-w-0 flex-1 basis-56">
            <FieldLabel htmlFor={`${id}-site`}>Your site</FieldLabel>
            <Input
              id={`${id}-site`}
              value={site}
              placeholder="yoursite.com"
              onChange={(event) => setYourDomain(event.target.value)}
            />
          </Field>
          <Field className="min-w-0 flex-1 basis-56">
            <FieldLabel htmlFor={`${id}-competitor`}>Competitor</FieldLabel>
            <Input
              id={`${id}-competitor`}
              value={competitor}
              placeholder="competitor.com"
              onChange={(event) => setCompetitor(event.target.value)}
            />
          </Field>
          <Button type="submit" pending={gap.isPending} disabled={!ready}>
            Find the gap
          </Button>
        </form>

        {gap.data && gap.data.length === 0 ? (
          <Empty className="border">
            <EmptyHeader>
              <EmptyMedia variant="icon">
                <SearchX />
              </EmptyMedia>
              <EmptyTitle>No gap found</EmptyTitle>
              <EmptyDescription>
                Your site already ranks for this competitor&apos;s keywords, or
                there isn&apos;t enough data for it in this country.
              </EmptyDescription>
            </EmptyHeader>
          </Empty>
        ) : null}

        {gap.data && gap.data.length > 0 ? (
          <div className="overflow-x-auto rounded-xl border">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Keyword</TableHead>
                  <TableHead className="text-right">Searches / mo</TableHead>
                  <TableHead className="text-right">Difficulty</TableHead>
                  <TableHead className="text-right">Their position</TableHead>
                  <TableHead className="text-right">Actions</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {gap.data.map((row) => (
                  <TableRow key={row.keyword}>
                    <TableCell className="font-medium">
                      {row.keyword}
                      {row.competitorUrl ? (
                        <p className="max-w-md truncate text-xs font-normal text-muted-foreground">
                          {row.competitorUrl}
                        </p>
                      ) : null}
                    </TableCell>
                    <TableCell className="text-right tabular-nums">
                      {row.searchVolume?.toLocaleString() ?? "-"}
                    </TableCell>
                    <TableCell className="text-right tabular-nums">
                      {row.keywordDifficulty ?? "-"}
                    </TableCell>
                    <TableCell className="text-right tabular-nums">
                      {row.competitorPosition ?? "-"}
                    </TableCell>
                    <TableCell className="text-right whitespace-nowrap">
                      <Button
                        size="sm"
                        variant="outline"
                        pending={
                          brief.isPending && brief.variables === row.keyword
                        }
                        disabled={brief.isPending}
                        onClick={() => brief.mutate(row.keyword)}
                      >
                        Write about it
                      </Button>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
        ) : null}
      </div>
    </div>
  );
}

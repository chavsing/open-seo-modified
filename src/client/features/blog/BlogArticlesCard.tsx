import { useQuery } from "@tanstack/react-query";
import { Link } from "@tanstack/react-router";
import { FileText } from "lucide-react";
import { QueryError } from "@/client/components/QueryState";
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
import { formatRelativeTime } from "@/client/lib/relative-time";
import { listBlogArticles } from "@/serverFunctions/blog";
import { ArticleStatusBadge } from "./ArticleStatusBadge";
import { blogKeys } from "./blogQueries";

export function BlogArticlesCard({
  projectId,
  onFindTopics,
}: {
  projectId: string;
  onFindTopics: () => void;
}) {
  const articlesQuery = useQuery({
    queryKey: blogKeys.articles(projectId),
    queryFn: () => listBlogArticles({ data: { projectId } }),
  });

  if (articlesQuery.isPending) return <Skeleton className="h-64 w-full" />;
  if (articlesQuery.isError)
    return (
      <QueryError
        cause={articlesQuery.error}
        fallback="Couldn't load articles. Please try again."
        onRetry={() => void articlesQuery.refetch()}
        isRetrying={articlesQuery.isFetching}
      />
    );
  const articles = articlesQuery.data;

  if (articles.length === 0)
    return (
      <Empty className="border">
        <EmptyHeader>
          <EmptyMedia variant="icon">
            <FileText />
          </EmptyMedia>
          <EmptyTitle>No articles yet</EmptyTitle>
          <EmptyDescription>
            Start from a topic idea: create a brief, then write the article.{" "}
            <button
              type="button"
              className="cursor-pointer underline underline-offset-2 hover:text-foreground"
              onClick={onFindTopics}
            >
              See topic ideas
            </button>
          </EmptyDescription>
        </EmptyHeader>
      </Empty>
    );

  return (
    <div className="overflow-x-auto rounded-xl border">
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead>Article</TableHead>
            <TableHead>Status</TableHead>
            <TableHead className="text-right">Updated</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {articles.map((article) => (
            <TableRow key={article.id}>
              <TableCell className="max-w-md">
                <Link
                  to="/p/$projectId/blog/$articleId"
                  params={{ projectId, articleId: article.id }}
                  className="font-medium hover:underline"
                >
                  {article.title}
                </Link>
                <p className="truncate text-xs text-muted-foreground">
                  {article.keyword}
                </p>
              </TableCell>
              <TableCell>
                <ArticleStatusBadge
                  status={article.status}
                  error={article.error}
                />
              </TableCell>
              <TableCell className="text-right text-muted-foreground whitespace-nowrap">
                {formatRelativeTime(article.updatedAt)}
              </TableCell>
            </TableRow>
          ))}
        </TableBody>
      </Table>
    </div>
  );
}

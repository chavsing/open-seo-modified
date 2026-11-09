import { CheckCircle2, XCircle } from "lucide-react";
import { Markdown } from "@/client/components/Markdown";
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
} from "@/client/components/ui/card";
import type { checkArticle } from "@/shared/blog-quality";

type Quality = ReturnType<typeof checkArticle>;

/** The editor's side column: the live quality check and the research brief. */
export function ArticleSidePanel({
  quality,
  hasContent,
  brief,
}: {
  quality: Quality;
  /** The score shows only once there is text to score. */
  hasContent: boolean;
  brief: string;
}) {
  return (
    <div className="space-y-4">
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center justify-between">
            Quality check
            <span className="text-2xl tabular-nums">
              {hasContent ? quality.score : "-"}
              <span className="text-sm text-muted-foreground">/10</span>
            </span>
          </CardTitle>
        </CardHeader>
        <CardContent>
          <ul className="space-y-2 text-sm">
            {quality.checks.map((check) => (
              <li key={check.id} className="flex gap-2">
                {check.passed ? (
                  <CheckCircle2 className="mt-0.5 size-4 shrink-0 text-success" />
                ) : (
                  <XCircle className="mt-0.5 size-4 shrink-0 text-destructive" />
                )}
                <span>
                  {check.label}
                  {check.detail ? (
                    <span className="block text-xs text-muted-foreground">
                      {check.detail}
                    </span>
                  ) : null}
                </span>
              </li>
            ))}
          </ul>
        </CardContent>
      </Card>
      <Card>
        <CardHeader>
          <CardTitle>Research brief</CardTitle>
        </CardHeader>
        <CardContent>
          <Markdown className="space-y-2 text-sm break-words">{brief}</Markdown>
        </CardContent>
      </Card>
    </div>
  );
}

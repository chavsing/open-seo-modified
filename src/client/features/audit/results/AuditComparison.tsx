import { useQuery } from "@tanstack/react-query";
import { GitCompare } from "lucide-react";
import {
  Alert,
  AlertDescription,
  AlertTitle,
} from "@/client/components/ui/alert";
import { getAuditComparison } from "@/serverFunctions/audit";

const SHOWN_TYPES = 6;

/** What changed since the previous audit of the same start page. */
export function AuditComparison({
  projectId,
  auditId,
}: {
  projectId: string;
  auditId: string;
}) {
  const comparisonQuery = useQuery({
    queryKey: ["audit", projectId, "comparison", auditId],
    queryFn: () => getAuditComparison({ data: { projectId, auditId } }),
  });
  const comparison = comparisonQuery.data;
  if (!comparison) return null;

  const since = new Date(comparison.previousStartedAt).toLocaleDateString(
    undefined,
    { month: "long", day: "numeric" },
  );
  return (
    <Alert>
      <GitCompare />
      <AlertTitle>
        {comparison.added === 0 && comparison.fixed === 0
          ? `No changes since the audit on ${since}.`
          : `Since the audit on ${since}: ${comparison.added} new ${comparison.added === 1 ? "issue" : "issues"}, ${comparison.fixed} fixed.`}
      </AlertTitle>
      {comparison.byType.length > 0 ? (
        <AlertDescription>
          <ul className="mt-1 space-y-0.5">
            {comparison.byType.slice(0, SHOWN_TYPES).map((row) => (
              <li key={row.issueType}>
                {row.title}: {row.before} before, {row.now} now
                {row.added ? ` (${row.added} new` : ""}
                {row.added && row.fixed ? ", " : row.fixed ? " (" : ""}
                {row.fixed ? `${row.fixed} fixed` : ""}
                {row.added || row.fixed ? ")" : ""}
              </li>
            ))}
          </ul>
        </AlertDescription>
      ) : null}
    </Alert>
  );
}

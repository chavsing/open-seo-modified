import { createFileRoute } from "@tanstack/react-router";
import { KeywordGapPage } from "@/client/features/domain/KeywordGapPage";

export const Route = createFileRoute("/_app/p/$projectId/keyword-gap")({
  component: KeywordGapRoute,
});

function KeywordGapRoute() {
  const { projectId } = Route.useParams();
  return <KeywordGapPage key={projectId} projectId={projectId} />;
}

import { Badge } from "@/client/components/ui/badge";

const STATUS = {
  brief: { label: "Brief", variant: "outline" },
  ready: { label: "Written", variant: "info" },
  wp_draft: { label: "Draft in WordPress", variant: "warning" },
  published: { label: "Published", variant: "success" },
  failed: { label: "Failed", variant: "destructive" },
} as const;

export function ArticleStatusBadge({
  status,
  error,
}: {
  status: keyof typeof STATUS;
  error: string | null;
}) {
  const entry = STATUS[status];
  return (
    <span className="inline-flex flex-col items-start gap-1">
      <Badge variant={entry.variant}>{entry.label}</Badge>
      {error ? (
        <span className="max-w-xs text-xs text-destructive">{error}</span>
      ) : null}
    </span>
  );
}

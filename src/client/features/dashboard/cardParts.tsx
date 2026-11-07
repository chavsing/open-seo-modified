import type { ReactNode } from "react";
import { buttonVariants } from "@/client/components/ui/button";
import { SkeletonTableRows } from "@/client/components/SkeletonPresets";

// Shared building blocks for the dashboard cards.
export function MetricsTableSkeleton() {
  return <SkeletonTableRows rows={5} columns={3} />;
}

/** A percent change in green (up), red (down) or grey (flat or unknown). */
function ChangeText({
  change,
  suffix,
}: {
  change: number | null;
  suffix?: string;
}) {
  if (change === null) return <span className="text-muted-foreground">—</span>;
  return (
    <span
      className={
        change > 0
          ? "text-success"
          : change < 0
            ? "text-destructive"
            : "text-muted-foreground"
      }
    >
      {change > 0 ? "▲ +" : change < 0 ? "▼ " : ""}
      {change}%{suffix ? ` ${suffix}` : ""}
    </span>
  );
}

/** The card's main figure: large, with its change underneath. */
export function HeadlineMetric({
  label,
  value,
  change,
}: {
  label: string;
  value: string;
  change: number | null;
}) {
  return (
    <div className="mb-4">
      <p className="text-sm text-muted-foreground">{label}</p>
      <p className="text-4xl font-semibold tracking-tight tabular-nums">
        {value}
      </p>
      {change !== null ? (
        <p className="mt-1 text-sm font-medium tabular-nums">
          <ChangeText change={change} suffix="vs previous 28 days" />
        </p>
      ) : null}
    </div>
  );
}

/** Small metric tile: icon in a circle, label, value and change. */
export function StatTile({
  icon,
  label,
  value,
  change,
}: {
  icon: ReactNode;
  label: string;
  value: string;
  change: number | null;
}) {
  return (
    <div className="stat-tile flex flex-col gap-2 rounded-xl border p-3">
      <div className="flex items-center gap-2">
        <span className="grid size-7 shrink-0 place-items-center rounded-full bg-brand/15 text-primary [&_svg]:size-3.5">
          {icon}
        </span>
        <span className="text-xs leading-tight font-medium text-muted-foreground">
          {label}
        </span>
      </div>
      <p className="text-xl font-semibold tabular-nums">{value}</p>
      <p className="text-xs font-medium tabular-nums">
        <ChangeText change={change} />
      </p>
    </div>
  );
}

export const moreDetailsClass = buttonVariants({
  variant: "ghost",
  size: "xs",
});

export function formatDay(timestamp: string): string {
  const ms = Date.parse(
    // SQLite's current_timestamp default has no timezone marker; treat it as
    // UTC rather than letting the browser parse it as local time.
    /^\d{4}-\d{2}-\d{2} /.test(timestamp)
      ? `${timestamp.replace(" ", "T")}Z`
      : timestamp,
  );
  if (Number.isNaN(ms)) return timestamp;
  return new Date(ms).toLocaleDateString(undefined, {
    month: "short",
    day: "numeric",
  });
}

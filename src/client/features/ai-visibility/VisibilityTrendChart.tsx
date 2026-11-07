import { Line, LineChart } from "recharts";
import {
  ChartGrid,
  ChartXAxis,
  ChartYAxis,
  endValueLabels,
} from "@/client/components/ChartAxes";
import {
  ChartContainer,
  ChartTooltip,
  ChartTooltipContent,
  type ChartConfig,
} from "@/client/components/ui/chart";
import type { AiTrend } from "@/shared/ai-visibility";

export const trendSeries = [
  { key: "mentionRate", label: "Brand mentions", color: "var(--chart-1)" },
  { key: "citationRate", label: "Owned citations", color: "var(--chart-2)" },
] as const;

const chartConfig: ChartConfig = Object.fromEntries(
  trendSeries.map((series) => [
    series.key,
    { label: series.label, color: series.color },
  ]),
);

const formatPercent = (value: unknown) => `${String(value)}%`;

const shortDate = (value: string | number) =>
  new Date(value).toLocaleDateString(undefined, {
    month: "short",
    day: "numeric",
  });

/**
 * One point per calendar day, using the latest run in the selected period.
 * A run without eligible answers
 * leaves a gap, not a zero.
 */
export function VisibilityTrendChart({ trend }: { trend: AiTrend }) {
  const start = Date.parse(trend.current.start);
  const latestByDay = new Map<string, AiTrend["runs"][number]>();
  // Runs arrive oldest first; a later run replaces that day's earlier point.
  for (const run of trend.runs) {
    if (Date.parse(run.createdAt) <= start) continue;
    latestByDay.set(new Date(run.createdAt).toDateString(), run);
  }
  const data = [...latestByDay.values()].map((run) => ({
    time: Date.parse(run.createdAt),
    mentionRate: run.mentionRate,
    citationRate: run.citationRate,
    collected: `${run.coverage.answered} of ${run.coverage.expected} answers collected`,
  }));
  const endLabel = endValueLabels();
  return (
    <ChartContainer
      config={chartConfig}
      className="h-[220px]"
      aria-label="Daily brand mention and owned citation rate"
    >
      <LineChart data={data} margin={{ left: 0, right: 12, top: 8, bottom: 0 }}>
        <ChartGrid />
        <ChartXAxis
          dataKey="time"
          type="number"
          scale="time"
          domain={[start, Date.parse(trend.current.end)]}
          tickFormatter={shortDate}
        />
        <ChartYAxis
          domain={[0, 100]}
          ticks={[0, 25, 50, 75, 100]}
          tickFormatter={(value: number) => `${value}%`}
        />
        <ChartTooltip
          content={
            <ChartTooltipContent
              labelFormatter={(label) => {
                const point = data.find((item) => item.time === Number(label));
                return point
                  ? `${new Date(point.time).toLocaleString()} · ${point.collected}`
                  : "";
              }}
              valueFormatter={(value) => formatPercent(value)}
            />
          }
        />
        <Line
          type="monotone"
          dataKey="mentionRate"
          stroke="var(--color-mentionRate)"
          strokeWidth={2}
          dot={data.length < 40}
          label={endLabel(
            data,
            "mentionRate",
            formatPercent,
            "var(--color-mentionRate)",
          )}
        />
        <Line
          type="monotone"
          dataKey="citationRate"
          stroke="var(--color-citationRate)"
          strokeWidth={2}
          dot={data.length < 40}
          label={endLabel(
            data,
            "citationRate",
            formatPercent,
            "var(--color-citationRate)",
          )}
        />
      </LineChart>
    </ChartContainer>
  );
}

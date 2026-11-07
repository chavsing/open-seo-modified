import type { ComponentProps } from "react";
import { CartesianGrid, type Label, XAxis, YAxis } from "recharts";

// Shared grid and axis defaults for charts inside the shadcn ChartContainer.
// ChartContainer colors the grid lines and tick labels from the --trend-*
// variables, so these wrappers set only the shape. Props override defaults.
// The tick font size is a prop, not CSS, because Recharts measures tick labels
// with it to decide which ticks fit.
const TICK = { fontSize: 10 };

export function ChartGrid(props: ComponentProps<typeof CartesianGrid>) {
  return <CartesianGrid strokeDasharray="3 3" vertical={false} {...props} />;
}

const PILL_HEIGHT = 18;

/**
 * Pills with each line's newest value, for Line's `label`. Call once per chart
 * render, then once per line in drawing order:
 *
 *   const endLabel = endValueLabels();
 *   <Line label={endLabel(data, "clicks", format, color)} />
 *
 * A pill sits at the last point that has a value (trailing gaps are skipped),
 * right-aligned above it, or below when the point is near the top. When it
 * would cover an earlier line's pill, it moves out of the way.
 */
export function endValueLabels() {
  const placedTops: number[] = [];
  return function endValueLabel(
    data: readonly Record<string, unknown>[],
    dataKey: string,
    format: (value: number) => string,
    color: string,
  ) {
    const order = placedTops.length;
    placedTops.push(Number.NaN);
    let lastIndex = data.length - 1;
    while (lastIndex >= 0 && data[lastIndex][dataKey] == null) lastIndex--;
    return function EndValueLabel({
      x,
      y,
      index,
      value,
    }: ComponentProps<typeof Label>) {
      if (index !== lastIndex || typeof value !== "number") return null;
      const pointX = Number(x);
      const pointY = Number(y);
      const text = format(value);
      const width = text.length * 6.4 + 14;
      const above = pointY - PILL_HEIGHT - 8;
      const below = pointY + 8;
      const free = (top: number) =>
        top >= 0 &&
        placedTops
          .slice(0, order)
          .every((other) => !(Math.abs(top - other) < PILL_HEIGHT + 2));
      const preferred = pointY > 28 ? above : below;
      const other = preferred === above ? below : above;
      let top = free(preferred) ? preferred : free(other) ? other : preferred;
      while (!free(top)) top += PILL_HEIGHT + 2;
      placedTops[order] = top;
      return (
        <EndPill x={pointX} top={top} width={width} text={text} color={color} />
      );
    };
  };
}

function EndPill({
  x: pointX,
  top,
  width,
  text,
  color,
}: {
  x: number;
  top: number;
  width: number;
  text: string;
  color: string;
}) {
  return (
    <g pointerEvents="none">
      <rect
        x={pointX - width}
        y={top}
        width={width}
        height={PILL_HEIGHT}
        rx={PILL_HEIGHT / 2}
        fill="var(--popover)"
        stroke={color}
        strokeWidth={1.5}
      />
      <text
        x={pointX - width / 2}
        y={top + 12.5}
        textAnchor="middle"
        fontSize={10.5}
        fontWeight={600}
        fill="var(--popover-foreground)"
      >
        {text}
      </text>
    </g>
  );
}

export function ChartXAxis(props: ComponentProps<typeof XAxis>) {
  return (
    <XAxis
      tick={TICK}
      tickLine={false}
      axisLine={false}
      minTickGap={32}
      {...props}
    />
  );
}

export function ChartYAxis(props: ComponentProps<typeof YAxis>) {
  return (
    <YAxis
      tick={TICK}
      tickLine={false}
      axisLine={false}
      width={44}
      {...props}
    />
  );
}

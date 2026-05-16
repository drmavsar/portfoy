import { fmt } from "@/lib/finance/fmt";

export interface LineSeries {
  name: string;
  values: number[];
  color: string;
  strong?: boolean;
  dash?: string;
}

interface LineChartProps {
  series: LineSeries[];
  labels: string[];
  width?: number;
  height?: number;
  yFmt?: (v: number) => string;
  padTop?: number;
  padBot?: number;
  padL?: number;
  padR?: number;
}

export function LineChart({
  series,
  labels,
  width = 600,
  height = 240,
  yFmt = (v) => fmt.tr(v, 0),
  padTop = 14,
  padBot = 24,
  padL = 44,
  padR = 14,
}: LineChartProps) {
  const xs = labels.length;
  const allVals = series.flatMap((s) => s.values);
  const min = Math.min(...allVals);
  const max = Math.max(...allVals);
  const range = max - min || 1;
  const W = width - padL - padR;
  const H = height - padTop - padBot;
  const xAt = (i: number) => padL + (i / (xs - 1)) * W;
  const yAt = (v: number) => padTop + H - ((v - min) / range) * H;
  const yTicks = 4;
  const ticks = Array.from({ length: yTicks + 1 }, (_, i) => min + (range * i) / yTicks);

  return (
    <svg
      width={width}
      height={height}
      style={{ display: "block", width: "100%" }}
      viewBox={`0 0 ${width} ${height}`}
      preserveAspectRatio="none"
    >
      {ticks.map((t, i) => (
        <g key={i}>
          <line x1={padL} x2={width - padR} y1={yAt(t)} y2={yAt(t)} stroke="var(--border-soft)" strokeDasharray="2 3" />
          <text
            x={padL - 8}
            y={yAt(t) + 3}
            textAnchor="end"
            fontSize="10"
            fill="var(--muted)"
            fontFamily="var(--font-mono)"
          >
            {yFmt(t)}
          </text>
        </g>
      ))}
      {labels.map((l, i) =>
        i % Math.ceil(labels.length / 8) === 0 || i === labels.length - 1 ? (
          <text key={i} x={xAt(i)} y={height - 6} fontSize="10" fill="var(--muted)" textAnchor="middle">
            {l}
          </text>
        ) : null,
      )}
      {series.map((s, si) => {
        const d = "M" + s.values.map((v, i) => `${xAt(i)},${yAt(v)}`).join("L");
        return (
          <g key={si}>
            <path
              d={d}
              fill="none"
              stroke={s.color}
              strokeWidth={s.strong ? 2.5 : 1.5}
              strokeLinecap="round"
              strokeLinejoin="round"
              strokeDasharray={s.dash || undefined}
            />
            {s.strong &&
              s.values.map((v, i) =>
                i === s.values.length - 1 ? (
                  <circle key={i} cx={xAt(i)} cy={yAt(v)} r="3" fill={s.color} />
                ) : null,
              )}
          </g>
        );
      })}
    </svg>
  );
}

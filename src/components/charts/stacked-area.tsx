import { fmt } from "@/lib/finance/fmt";

interface StackedSeries {
  name: string;
  values: number[];
  color: string;
}

interface StackedAreaProps {
  series: StackedSeries[];
  labels: string[];
  width?: number;
  height?: number;
  padTop?: number;
  padBot?: number;
  padL?: number;
  padR?: number;
  yFmt?: (v: number) => string;
}

export function StackedArea({
  series,
  labels,
  width = 720,
  height = 220,
  padTop = 10,
  padBot = 20,
  padL = 44,
  padR = 14,
  yFmt = (v) => fmt.k(v),
}: StackedAreaProps) {
  const n = labels.length;
  const stacks = series.map(() => new Array<number>(n).fill(0));
  for (let i = 0; i < n; i++) {
    let acc = 0;
    for (let s = 0; s < series.length; s++) {
      acc += series[s].values[i];
      stacks[s][i] = acc;
    }
  }
  const max = Math.max(...stacks[stacks.length - 1]);
  const W = width - padL - padR;
  const H = height - padTop - padBot;
  const xAt = (i: number) => padL + (i / (n - 1)) * W;
  const yAt = (v: number) => padTop + H - (v / max) * H;
  const yTicks = 4;
  const ticks = Array.from({ length: yTicks + 1 }, (_, i) => (max * i) / yTicks);

  const paths: { d: string; color: string; name: string }[] = [];
  for (let s = series.length - 1; s >= 0; s--) {
    const top = stacks[s];
    const bot = s === 0 ? new Array<number>(n).fill(0) : stacks[s - 1];
    let d = "M" + top.map((v, i) => `${xAt(i)},${yAt(v)}`).join("L");
    d += "L" + bot.map((v, i) => `${xAt(i)},${yAt(v)}`).reverse().join("L") + "Z";
    paths.push({ d, color: series[s].color, name: series[s].name });
  }

  const labelIdxs = [0, Math.floor(n / 4), Math.floor(n / 2), Math.floor((3 * n) / 4), n - 1];

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
          <text x={padL - 8} y={yAt(t) + 3} fontSize="10" textAnchor="end" fill="var(--muted)" fontFamily="var(--font-mono)">
            {yFmt(t)}
          </text>
        </g>
      ))}
      {paths.reverse().map((p, i) => (
        <path key={i} d={p.d} fill={p.color} opacity={0.78} stroke={p.color} strokeOpacity={0.95} strokeWidth={1} />
      ))}
      {labelIdxs.map((i) => (
        <text key={i} x={xAt(i)} y={height - 4} fontSize="10" fill="var(--muted)" textAnchor="middle">
          {labels[i]}
        </text>
      ))}
    </svg>
  );
}

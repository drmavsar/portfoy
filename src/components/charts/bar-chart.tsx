import { fmt } from "@/lib/finance/fmt";

export interface BarDatum {
  month: string;
  income: number;
  expense: number;
  net: number;
}

interface BarChartProps {
  data: BarDatum[];
  width?: number;
  height?: number;
  padTop?: number;
  padBot?: number;
  padL?: number;
  padR?: number;
  showNet?: boolean;
}

export function BarChart({
  data,
  width = 600,
  height = 220,
  padTop = 14,
  padBot = 24,
  padL = 44,
  padR = 14,
  showNet = false,
}: BarChartProps) {
  const all = data.flatMap((d) => [d.income, d.expense]);
  const max = Math.max(...all);
  const W = width - padL - padR;
  const H = height - padTop - padBot;
  const bw = W / data.length;
  const gw = bw * 0.32;
  const yTicks = 4;
  const ticks = Array.from({ length: yTicks + 1 }, (_, i) => (max * i) / yTicks);
  const yAt = (v: number) => padTop + H - (v / max) * H;

  let netPath: string | null = null;
  if (showNet) {
    const netVals = data.map((d) => d.net);
    const netMax = Math.max(...netVals.map(Math.abs));
    const yAtNet = (v: number) => padTop + H / 2 - (v / netMax) * (H / 2 - 4);
    netPath =
      "M" + data.map((d, i) => `${padL + bw * i + bw / 2},${yAtNet(d.net)}`).join("L");
  }

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
          <text x={padL - 8} y={yAt(t) + 3} textAnchor="end" fontSize="10" fill="var(--muted)" fontFamily="var(--font-mono)">
            {fmt.k(t)}
          </text>
        </g>
      ))}
      {data.map((d, i) => {
        const cx = padL + bw * i + bw / 2;
        return (
          <g key={i}>
            <rect
              x={cx - gw - 2}
              y={yAt(d.income)}
              width={gw}
              height={H - (yAt(d.income) - padTop)}
              fill="var(--positive)"
              opacity="0.85"
              rx="1.5"
            />
            <rect
              x={cx + 2}
              y={yAt(d.expense)}
              width={gw}
              height={H - (yAt(d.expense) - padTop)}
              fill="var(--negative)"
              opacity="0.85"
              rx="1.5"
            />
            <text x={cx} y={height - 6} fontSize="10" fill="var(--muted)" textAnchor="middle">
              {d.month}
            </text>
          </g>
        );
      })}
      {netPath && <path d={netPath} fill="none" stroke="var(--accent)" strokeWidth="2" strokeDasharray="3 2" />}
    </svg>
  );
}

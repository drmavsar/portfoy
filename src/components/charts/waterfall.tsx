import { fmt } from "@/lib/finance/fmt";

export interface WaterfallItem {
  label: string;
  value: number;
  type?: "start" | "end" | "pos" | "neg";
  sub?: string;
}

interface WaterfallProps {
  items: WaterfallItem[];
  width?: number;
  height?: number;
  padTop?: number;
  padBot?: number;
  padL?: number;
  padR?: number;
}

export function Waterfall({
  items,
  width = 640,
  height = 220,
  padTop = 18,
  padBot = 44,
  padL = 10,
  padR = 10,
}: WaterfallProps) {
  let running = 0;
  const tops: { start: number; end: number }[] = [];
  let min = 0;
  let max = 0;
  for (const it of items) {
    if (it.type === "start" || it.type === "end") {
      tops.push({ start: 0, end: it.value });
      min = Math.min(min, 0);
      max = Math.max(max, it.value);
    } else {
      const s = running;
      running += it.value;
      tops.push({ start: s, end: running });
      min = Math.min(min, s, running);
      max = Math.max(max, s, running);
    }
    if (it.type === "start") running = it.value;
    if (it.type === "end") running = it.value;
  }
  const W = width - padL - padR;
  const H = height - padTop - padBot;
  const bw = W / items.length;
  const range = max - min || 1;
  const yAt = (v: number) => padTop + H - ((v - min) / range) * H;

  return (
    <svg
      width={width}
      height={height}
      style={{ display: "block", width: "100%" }}
      viewBox={`0 0 ${width} ${height}`}
      preserveAspectRatio="none"
    >
      <line x1={padL} x2={width - padR} y1={yAt(0)} y2={yAt(0)} stroke="var(--border)" />
      {items.map((it, i) => {
        const t = tops[i];
        const y1 = yAt(Math.max(t.start, t.end));
        const y2 = yAt(Math.min(t.start, t.end));
        const fill =
          it.type === "start" || it.type === "end"
            ? "var(--accent)"
            : it.value >= 0
              ? "var(--positive)"
              : "var(--negative)";
        const x = padL + bw * i + bw * 0.18;
        const bw2 = bw * 0.64;
        return (
          <g key={i}>
            {i > 0 && (
              <line
                x1={padL + bw * (i - 1) + bw * 0.82}
                x2={x}
                y1={yAt(tops[i - 1].end)}
                y2={yAt(t.start)}
                stroke="var(--border)"
                strokeDasharray="2 2"
              />
            )}
            <rect
              x={x}
              y={y1}
              width={bw2}
              height={Math.max(2, y2 - y1)}
              fill={fill}
              opacity="0.9"
              rx="2"
            />
            <text
              x={x + bw2 / 2}
              y={y1 - 4}
              fontSize="10"
              fill="var(--fg)"
              textAnchor="middle"
              fontFamily="var(--font-mono)"
            >
              {fmt.k(it.value)}
            </text>
            <text
              x={x + bw2 / 2}
              y={height - 26}
              fontSize="10"
              fill="var(--muted)"
              textAnchor="middle"
            >
              {it.label}
            </text>
            {it.sub && (
              <text
                x={x + bw2 / 2}
                y={height - 12}
                fontSize="9"
                fill="var(--muted-2)"
                textAnchor="middle"
              >
                {it.sub}
              </text>
            )}
          </g>
        );
      })}
    </svg>
  );
}

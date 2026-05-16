import { fmt } from "@/lib/finance/fmt";

export interface TreemapDatum {
  id: string;
  label: string;
  value: number;
  color: string;
}

interface TreemapProps {
  data: TreemapDatum[];
  width?: number;
  height?: number;
}

interface Rect extends TreemapDatum {
  x: number;
  y: number;
  w: number;
  h: number;
}

export function Treemap({ data, width = 480, height = 260 }: TreemapProps) {
  const total = data.reduce((s, d) => s + d.value, 0);
  const sorted = [...data].sort((a, b) => b.value - a.value);

  function layout(items: TreemapDatum[], x: number, y: number, w: number, h: number, horizontal: boolean): Rect[] {
    if (items.length === 0) return [];
    if (items.length === 1) return [{ ...items[0], x, y, w, h }];
    const want = items.reduce((s, i) => s + i.value, 0) * 0.5;
    let acc = 0;
    let split = 1;
    for (let i = 0; i < items.length; i++) {
      acc += items[i].value;
      if (acc >= want) {
        split = i + 1;
        break;
      }
    }
    const first = items.slice(0, split);
    const rest = items.slice(split);
    const firstTotal = first.reduce((s, i) => s + i.value, 0);
    const restTotal = rest.reduce((s, i) => s + i.value, 0);
    const t = firstTotal + restTotal;
    if (horizontal) {
      const fw = (firstTotal / t) * w;
      return [...layout(first, x, y, fw, h, false), ...layout(rest, x + fw, y, w - fw, h, false)];
    }
    const fh = (firstTotal / t) * h;
    return [...layout(first, x, y, w, fh, true), ...layout(rest, x, y + fh, w, h - fh, true)];
  }

  const rects = layout(sorted, 0, 0, width, height, width > height);

  return (
    <svg
      width={width}
      height={height}
      style={{ display: "block", width: "100%" }}
      viewBox={`0 0 ${width} ${height}`}
    >
      {rects.map((r, i) => (
        <g key={i}>
          <rect x={r.x + 1} y={r.y + 1} width={r.w - 2} height={r.h - 2} fill={r.color} opacity="0.85" rx="3" />
          {r.w > 60 && r.h > 36 && (
            <g>
              <text x={r.x + 10} y={r.y + 18} fontSize="11" fill="#0a0d14" fontWeight="600">
                {r.label}
              </text>
              <text
                x={r.x + 10}
                y={r.y + 34}
                fontSize="13"
                fill="#0a0d14"
                fontWeight="700"
                fontFamily="var(--font-mono)"
              >
                {fmt.k(r.value)}
              </text>
              <text x={r.x + 10} y={r.y + 48} fontSize="10" fill="#0a0d14" opacity="0.65">
                {((r.value / total) * 100).toFixed(1)}%
              </text>
            </g>
          )}
          {r.w > 30 && r.h > 18 && r.w <= 60 && (
            <text x={r.x + 6} y={r.y + 14} fontSize="10" fill="#0a0d14" fontWeight="600">
              {r.label}
            </text>
          )}
        </g>
      ))}
    </svg>
  );
}

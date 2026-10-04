interface SparklineProps {
  values: number[];
  width?: number;
  height?: number;
  color?: string;
  fill?: boolean;
  stroke?: number;
  /** Uç noktada nokta (KPI kartı ve tablo satırı küçük eğrisi). */
  endDot?: boolean;
}

export function Sparkline({
  values,
  width = 80,
  height = 24,
  color,
  fill = false,
  stroke = 1.5,
  endDot = false,
}: SparklineProps) {
  if (!values || values.length === 0) return null;
  const min = Math.min(...values);
  const max = Math.max(...values);
  const span = max - min || 1;
  const dx = width / (values.length - 1);
  const points = values.map<[number, number]>((v, i) => [
    i * dx,
    height - ((v - min) / span) * (height - 2) - 1,
  ]);
  if (endDot) {
    // Nokta kesilmesin diye yatayda 3 px pay bırak
    const pad = 3;
    for (const p of points) p[0] = pad + (p[0] * (width - pad * 2)) / width;
  }
  const d = "M" + points.map((p) => p.join(",")).join("L");
  const last = values[values.length - 1];
  const first = values[0];
  const up = last >= first;
  const col = color || (up ? "var(--positive)" : "var(--negative)");
  return (
    <svg width={width} height={height} style={{ display: "block", overflow: "visible" }} aria-hidden>
      {fill && (
        <path
          d={`${d} L ${width} ${height} L 0 ${height} Z`}
          fill={col}
          fillOpacity="0.12"
          stroke="none"
        />
      )}
      <path
        d={d}
        stroke={col}
        strokeWidth={stroke}
        fill="none"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
      {endDot && <circle cx={points[points.length - 1][0]} cy={points[points.length - 1][1]} r={3} fill={col} />}
    </svg>
  );
}

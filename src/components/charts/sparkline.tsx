interface SparklineProps {
  values: number[];
  width?: number;
  height?: number;
  color?: string;
  fill?: boolean;
  stroke?: number;
}

export function Sparkline({
  values,
  width = 80,
  height = 24,
  color,
  fill = false,
  stroke = 1.5,
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
  const d = "M" + points.map((p) => p.join(",")).join("L");
  const last = values[values.length - 1];
  const first = values[0];
  const up = last >= first;
  const col = color || (up ? "var(--positive)" : "var(--negative)");
  return (
    <svg width={width} height={height} style={{ display: "block" }}>
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
    </svg>
  );
}

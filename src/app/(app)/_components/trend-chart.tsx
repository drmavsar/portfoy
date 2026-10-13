/** Özet'teki küçük trend grafiği: alan dolgulu çizgi + başlık. Renk dönem yönüne göre. */
export function TrendChart({
  id,
  label,
  values,
  width = 280,
  height = 90,
}: {
  /** Sayfada benzersiz: degrade tanımı için */
  id: string;
  label: string;
  values: number[];
  width?: number;
  height?: number;
}) {
  if (values.length < 2) return null;
  const min = Math.min(...values);
  const max = Math.max(...values);
  const range = max - min || 1;
  const stepX = width / (values.length - 1);
  const points = values.map((v, i) => `${(i * stepX).toFixed(1)},${(height - ((v - min) / range) * height).toFixed(1)}`);
  const path = `M ${points.join(" L ")}`;
  const areaPath = `${path} L ${width},${height} L 0,${height} Z`;
  const color = values[values.length - 1] >= values[0] ? "var(--positive)" : "var(--negative)";
  return (
    <figure style={{ flex: "1 1 200px", minWidth: 200, maxWidth: width, margin: 0 }}>
      <figcaption className="hint" style={{ fontSize: 11, marginBottom: 4 }}>
        {label}
      </figcaption>
      <svg
        width={width}
        height={height}
        viewBox={`0 0 ${width} ${height}`}
        style={{ width: "100%", height, display: "block" }}
        role="img"
        aria-label={`${label} trendi`}
      >
        <defs>
          <linearGradient id={id} x1="0" x2="0" y1="0" y2="1">
            <stop offset="0%" stopColor={color} stopOpacity="0.3" />
            <stop offset="100%" stopColor={color} stopOpacity="0" />
          </linearGradient>
        </defs>
        <path d={areaPath} fill={`url(#${id})`} />
        <path d={path} stroke={color} strokeWidth={1.5} fill="none" />
      </svg>
    </figure>
  );
}

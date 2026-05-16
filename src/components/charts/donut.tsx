interface DonutDatum {
  label: string;
  value: number;
  color: string;
}

interface DonutProps {
  data: DonutDatum[];
  size?: number;
  thickness?: number;
  centerLabel?: string;
  centerValue?: string;
}

export function Donut({
  data,
  size = 180,
  thickness = 26,
  centerLabel,
  centerValue,
}: DonutProps) {
  const total = data.reduce((s, d) => s + d.value, 0) || 1;
  const cx = size / 2;
  const cy = size / 2;
  const r = size / 2 - 4;
  const ri = r - thickness;
  let a0 = -Math.PI / 2;
  const arcs = data.map((d) => {
    const angle = (d.value / total) * Math.PI * 2;
    const a1 = a0 + angle;
    const large = angle > Math.PI ? 1 : 0;
    const x0 = cx + r * Math.cos(a0);
    const y0 = cy + r * Math.sin(a0);
    const x1 = cx + r * Math.cos(a1);
    const y1 = cy + r * Math.sin(a1);
    const xi0 = cx + ri * Math.cos(a1);
    const yi0 = cy + ri * Math.sin(a1);
    const xi1 = cx + ri * Math.cos(a0);
    const yi1 = cy + ri * Math.sin(a0);
    const path = `M ${x0} ${y0} A ${r} ${r} 0 ${large} 1 ${x1} ${y1} L ${xi0} ${yi0} A ${ri} ${ri} 0 ${large} 0 ${xi1} ${yi1} Z`;
    a0 = a1;
    return { path, color: d.color, label: d.label, value: d.value, pct: (d.value / total) * 100 };
  });

  return (
    <div style={{ display: "flex", alignItems: "center", gap: 18 }}>
      <svg width={size} height={size}>
        {arcs.map((a, i) => (
          <path key={i} d={a.path} fill={a.color} stroke="var(--surface)" strokeWidth="1.5" />
        ))}
        {centerValue && (
          <g>
            <text x={cx} y={cy - 4} textAnchor="middle" fontSize="11" fill="var(--muted)">
              {centerLabel}
            </text>
            <text
              x={cx}
              y={cy + 14}
              textAnchor="middle"
              fontSize="16"
              fill="var(--fg)"
              fontWeight="600"
              fontFamily="var(--font-mono)"
            >
              {centerValue}
            </text>
          </g>
        )}
      </svg>
      <div style={{ flex: 1, display: "flex", flexDirection: "column", gap: 6, fontSize: 12 }}>
        {arcs.map((a, i) => (
          <div key={i} style={{ display: "flex", alignItems: "center", gap: 8 }}>
            <span style={{ width: 10, height: 10, borderRadius: 2, background: a.color, flexShrink: 0 }} />
            <span style={{ flex: 1, color: "var(--fg-soft)" }}>{a.label}</span>
            <span className="tabular" style={{ color: "var(--muted)" }}>
              {a.pct.toFixed(1)}%
            </span>
          </div>
        ))}
      </div>
    </div>
  );
}

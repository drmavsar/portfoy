interface HeatmapProps {
  symbols: string[];
  matrix: number[][];
  size?: number;
}

function colorFor(v: number): string {
  if (v >= 0) {
    const t = v;
    const r = Math.round(35 + (110 - 35) * (1 - t));
    const g = Math.round(40 + (200 - 40) * Math.min(t * 1.5, 1));
    const b = Math.round(85 + (254 - 85) * t);
    return `rgb(${r},${g},${b})`;
  }
  const t = -v;
  const r = Math.round(80 + (248 - 80) * t);
  const g = Math.round(40 + (81 - 40) * (1 - t));
  const b = Math.round(60 + (73 - 60) * (1 - t));
  return `rgb(${r},${g},${b})`;
}

export function Heatmap({ symbols, matrix, size = 36 }: HeatmapProps) {
  return (
    <div style={{ display: "inline-block" }}>
      <table style={{ borderCollapse: "collapse" }}>
        <thead>
          <tr>
            <th></th>
            {symbols.map((s) => (
              <th
                key={s}
                style={{
                  fontSize: 10,
                  color: "var(--muted)",
                  fontWeight: 600,
                  padding: "4px 6px",
                  textAlign: "center",
                }}
              >
                {s}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {symbols.map((s, i) => (
            <tr key={s}>
              <td
                style={{
                  fontSize: 10,
                  color: "var(--muted)",
                  fontWeight: 600,
                  padding: "4px 8px",
                  textAlign: "right",
                }}
              >
                {s}
              </td>
              {symbols.map((c, j) => {
                const v = matrix[i][j];
                const isDiag = i === j;
                return (
                  <td key={c} style={{ padding: 2 }}>
                    <div
                      style={{
                        width: size,
                        height: size * 0.72,
                        background: isDiag ? "var(--surface-2)" : colorFor(v),
                        color: Math.abs(v) > 0.4 || isDiag ? "#fff" : "#0a0d14",
                        borderRadius: 3,
                        display: "grid",
                        placeItems: "center",
                        fontSize: 10,
                        fontWeight: 600,
                        fontFamily: "var(--font-mono)",
                        opacity: isDiag ? 0.5 : 1,
                      }}
                    >
                      {v.toFixed(2)}
                    </div>
                  </td>
                );
              })}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

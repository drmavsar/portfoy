import type { ExplanationFlag } from "@/app/(app)/_lib/tefas/score-explain";

interface Props {
  flags: ExplanationFlag[];
}

function severityIcon(s: ExplanationFlag["severity"]): string {
  if (s === "critical") return "🔴";
  if (s === "warn") return "⚠";
  return "ℹ";
}

function severityColor(s: ExplanationFlag["severity"]): string {
  if (s === "critical") return "#e26a8f";
  if (s === "warn") return "#e0b341";
  return "#6ea8fe";
}

export function CommitteeFlagsCard({ flags }: Props) {
  if (flags.length === 0) {
    return (
      <div className="card" style={{ padding: 16 }}>
        <div style={{ fontSize: 11, color: "var(--muted)", textTransform: "uppercase", letterSpacing: 0.5, fontWeight: 600, marginBottom: 8 }}>
          Komite Bayrakları
        </div>
        <div style={{ fontSize: 12, color: "#4cc9b0", display: "flex", alignItems: "center", gap: 6 }}>
          ✓ Veri kalitesi tam — açık bayrak yok.
        </div>
      </div>
    );
  }

  // En yüksek severity üstte: critical > warn > info
  const sevOrder = { critical: 0, warn: 1, info: 2 } as const;
  const sorted = [...flags].sort((a, b) => sevOrder[a.severity] - sevOrder[b.severity]);

  return (
    <div className="card" style={{ padding: 16 }}>
      <div style={{ fontSize: 11, color: "var(--muted)", textTransform: "uppercase", letterSpacing: 0.5, fontWeight: 600, marginBottom: 10 }}>
        Komite Bayrakları
      </div>
      <div style={{ display: "grid", gap: 6 }}>
        {sorted.map((f) => {
          const color = severityColor(f.severity);
          return (
            <div
              key={f.key}
              style={{
                padding: "8px 10px",
                background: `${color}15`,
                borderLeft: `3px solid ${color}`,
                borderRadius: 4,
                fontSize: 12,
                color: "var(--fg)",
              }}
            >
              <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
                <span style={{ color, fontSize: 13 }}>{severityIcon(f.severity)}</span>
                <span style={{ fontWeight: 600 }}>{f.label}</span>
              </div>
              {f.detail && (
                <div style={{ fontSize: 11, color: "var(--muted)", marginTop: 4, marginLeft: 20 }}>
                  {f.detail}
                </div>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}

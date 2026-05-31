import type { ScoreBreakdownItem } from "@/app/(app)/_lib/tefas/score-explain";

interface Props {
  totalScore: number | null;
  componentsUsed: number | null;
  breakdown: ScoreBreakdownItem[];
}

function statusColor(status: ScoreBreakdownItem["label_status"]): string {
  if (status === "strong") return "#4cc9b0";
  if (status === "ok") return "#e0b341";
  if (status === "weak") return "#e26a8f";
  return "var(--muted)"; // missing
}

export function ScoreBreakdownCard({ totalScore, componentsUsed, breakdown }: Props) {
  return (
    <div className="card" style={{ padding: 16 }}>
      <div style={{ display: "flex", alignItems: "baseline", gap: 12, marginBottom: 12 }}>
        <div style={{ fontSize: 11, color: "var(--muted)", textTransform: "uppercase", letterSpacing: 0.5, fontWeight: 600 }}>
          Mehmet Score
        </div>
        <div style={{ fontSize: 32, fontWeight: 700, color: statusColor(totalScore != null && totalScore >= 70 ? "strong" : totalScore != null && totalScore >= 50 ? "ok" : "weak") }}>
          {totalScore ?? "—"}
        </div>
        {componentsUsed != null && (
          <div style={{ fontSize: 11, color: "var(--muted)" }}>
            {componentsUsed}/5 bileşen
          </div>
        )}
      </div>
      <div style={{ display: "grid", gap: 8 }}>
        {breakdown.map((b) => {
          const maxWeight = b.weight_pct;
          const pctFilled = b.raw_score != null ? Math.max(0, Math.min(100, b.raw_score)) : 0;
          const color = statusColor(b.label_status);
          return (
            <div key={b.key}>
              <div style={{ display: "flex", justifyContent: "space-between", fontSize: 12, marginBottom: 3 }}>
                <span style={{ color: "var(--fg)" }}>{b.label_tr}</span>
                <span style={{ fontFamily: "var(--font-mono)", color: "var(--muted)" }}>
                  {b.raw_score != null
                    ? `${b.contribution!.toFixed(1)} / ${maxWeight}`
                    : `veri yok / ${maxWeight}`}
                </span>
              </div>
              <div
                style={{
                  width: "100%",
                  height: 6,
                  background: "var(--surface-2)",
                  borderRadius: 3,
                  overflow: "hidden",
                }}
              >
                <div
                  style={{
                    width: `${pctFilled}%`,
                    height: "100%",
                    background: color,
                    opacity: b.label_status === "missing" ? 0.2 : 0.85,
                  }}
                />
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

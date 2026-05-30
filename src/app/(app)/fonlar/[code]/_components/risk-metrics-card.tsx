import type { FundScores } from "@/app/(app)/_lib/tefas/types";

function pct(v: number | null | undefined, digits = 1): string {
  if (v == null) return "—";
  const sign = v > 0 ? "+" : "";
  return `${sign}${(v * 100).toFixed(digits)}%`;
}

function ratio(v: number | null | undefined, digits = 2): string {
  if (v == null) return "—";
  return v.toFixed(digits);
}

export function RiskMetricsCard({ scores }: { scores: FundScores | null }) {
  if (!scores) {
    return (
      <div className="card">
        <div className="card-head">
          <div className="card-title">Risk Metrikleri</div>
          <div className="card-sub">veri yok</div>
        </div>
        <div style={{ padding: 18, color: "var(--muted)", fontSize: 13 }}>
          Skor refresh cron tetiklendiğinde dolar.
        </div>
      </div>
    );
  }

  const rows: Array<{ label: string; value: string; sub?: string }> = [
    {
      label: "Volatilite 1Y",
      value: pct(scores.volatility_1y, 1),
      sub: "yıllıklaştırılmış log-return σ",
    },
    {
      label: "Max Drawdown 3Y",
      value: pct(scores.max_drawdown_3y, 1),
      sub: "tepe-çukur en kötü düşüş",
    },
    {
      label: "Downside Vol 1Y",
      value: pct(scores.downside_volatility_1y, 1),
      sub: "Sortino payda (negatif gün σ)",
    },
    {
      label: "Return/Risk 1Y",
      value: ratio(scores.sharpe_like_1y, 2),
      sub: "brüt 1Y / vol 1Y (Sharpe-benzeri)",
    },
    {
      label: "BIST bağımlılık",
      value: `${scores.bist_dependency_score ?? "—"}/100`,
      sub: scores.bist_source ?? "",
    },
    {
      label: "Altın bağımlılık",
      value: `${scores.gold_dependency_score ?? "—"}/100`,
      sub: scores.gold_source ?? "",
    },
  ];

  return (
    <div className="card">
      <div className="card-head">
        <div className="card-title">Risk Metrikleri</div>
        <div className="card-sub">Sprint-4 motoru</div>
      </div>
      <div>
        {rows.map((r, idx) => (
          <div
            key={r.label}
            style={{
              display: "grid",
              gridTemplateColumns: "1fr auto",
              gap: 10,
              padding: "10px 14px",
              borderBottom: idx < rows.length - 1 ? "1px solid var(--border-soft)" : "none",
              fontSize: 12,
              alignItems: "center",
            }}
          >
            <div>
              <div style={{ fontSize: 12 }}>{r.label}</div>
              {r.sub && (
                <div style={{ fontSize: 10, color: "var(--muted)", marginTop: 2 }}>{r.sub}</div>
              )}
            </div>
            <strong style={{ fontFamily: "var(--font-mono)", fontSize: 14 }}>{r.value}</strong>
          </div>
        ))}
      </div>
    </div>
  );
}

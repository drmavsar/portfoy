import type { FundScores, UserPersona } from "@/app/(app)/_lib/tefas/types";

interface Props {
  scores: FundScores | null;
  persona: UserPersona | null;
}

interface Row {
  label: string;
  score: number | null;
  weight: number;
  color: string;
}

function scoreColor(score: number | null): string {
  if (score == null) return "var(--muted)";
  if (score >= 70) return "#4cc9b0";
  if (score >= 55) return "#e0b341";
  return "#e26a8f";
}

export function ScoreComponentsTable({ scores, persona }: Props) {
  if (!scores || !persona) {
    return (
      <div className="card">
        <div className="card-head">
          <div className="card-title">Skor Bileşenleri</div>
          <div className="card-sub">veri yok</div>
        </div>
        <div style={{ padding: 18, color: "var(--muted)", fontSize: 13 }}>
          Skor cache&apos;de henüz yok.
        </div>
      </div>
    );
  }

  const rows: Row[] = [
    {
      label: "Enflasyon koruması",
      score: scores.inflation_protection_score,
      weight: persona.inflation_weight,
      color: "#4cc9b0",
    },
    {
      label: "Stopaj avantajı",
      score: scores.tax_advantage_score,
      weight: persona.tax_weight,
      color: "#c44569",
    },
    {
      label: "Risk (düşük vol)",
      score: scores.normalized_risk_score,
      weight: persona.risk_weight,
      color: "#e0b341",
    },
    {
      label: "Uzun vade performans",
      score: scores.long_term_performance_score,
      weight: persona.long_term_weight,
      color: "#6ea8fe",
    },
    {
      label: "Çeşitlendirme",
      score: scores.diversification_score,
      weight: persona.diversification_weight,
      color: "#9b59b6",
    },
  ];

  // Eksik bileşenlerin ağırlığını kalan bileşenlere normalize et (Mehmet Score
  // mantığıyla aynı).
  const availableWeight = rows.reduce((sum, r) => (r.score != null ? sum + r.weight : sum), 0);
  const computedTotal = rows.reduce((sum, r) => {
    if (r.score == null) return sum;
    return sum + r.score * r.weight;
  }, 0);
  const normalizedTotal =
    availableWeight > 0 ? Math.round(computedTotal / availableWeight) : null;

  return (
    <div className="card">
      <div className="card-head">
        <div className="card-title">Skor Bileşenleri</div>
        <div className="card-sub">
          Mehmet Score: <strong>{scores.mehmet_score ?? "—"}</strong>
        </div>
      </div>
      <div>
        <div
          style={{
            display: "grid",
            gridTemplateColumns: "1fr 50px 60px 60px",
            gap: 10,
            padding: "8px 14px",
            borderBottom: "1px solid var(--border-soft)",
            fontSize: 10,
            color: "var(--muted)",
            textTransform: "uppercase",
            fontWeight: 600,
            letterSpacing: 0.5,
          }}
        >
          <span>Bileşen</span>
          <span style={{ textAlign: "right" }}>Skor</span>
          <span style={{ textAlign: "right" }}>Ağırlık</span>
          <span style={{ textAlign: "right" }}>Katkı</span>
        </div>
        {rows.map((r, idx) => (
          <div
            key={r.label}
            style={{
              display: "grid",
              gridTemplateColumns: "1fr 50px 60px 60px",
              gap: 10,
              padding: "10px 14px",
              borderBottom: idx < rows.length - 1 ? "1px solid var(--border-soft)" : "none",
              fontSize: 12,
              alignItems: "center",
            }}
          >
            <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
              <span
                style={{
                  display: "inline-block",
                  width: 8,
                  height: 8,
                  borderRadius: 2,
                  background: r.color,
                }}
              />
              <span>{r.label}</span>
            </div>
            <strong
              style={{
                textAlign: "right",
                color: scoreColor(r.score),
                fontFamily: "var(--font-mono)",
              }}
            >
              {r.score ?? "—"}
            </strong>
            <span style={{ textAlign: "right", color: "var(--muted)", fontFamily: "var(--font-mono)" }}>
              %{(r.weight * 100).toFixed(0)}
            </span>
            <span style={{ textAlign: "right", fontFamily: "var(--font-mono)" }}>
              {r.score != null ? (r.score * r.weight).toFixed(1) : "—"}
            </span>
          </div>
        ))}
        <div
          style={{
            display: "grid",
            gridTemplateColumns: "1fr 50px 60px 60px",
            gap: 10,
            padding: "10px 14px",
            background: "var(--surface-2)",
            fontSize: 12,
            alignItems: "center",
          }}
        >
          <strong>Toplam (normalize)</strong>
          <strong
            style={{
              textAlign: "right",
              color: scoreColor(normalizedTotal),
              fontFamily: "var(--font-mono)",
            }}
          >
            {normalizedTotal ?? "—"}
          </strong>
          <span style={{ textAlign: "right", color: "var(--muted)", fontFamily: "var(--font-mono)" }}>
            %{(availableWeight * 100).toFixed(0)}
          </span>
          <span style={{ textAlign: "right", color: "var(--muted)", fontSize: 11 }}>
            {scores.components_used ?? 0}/5
          </span>
        </div>
      </div>
    </div>
  );
}

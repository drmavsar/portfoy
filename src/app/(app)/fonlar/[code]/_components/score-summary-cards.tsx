import type { FundReturns, FundScores, UserPersona } from "@/app/(app)/_lib/tefas/types";

// tax_confidence fund_returns_cache'tedir; FundScores skor verisini taşır.

function pct(v: number | null | undefined, digits = 1): string {
  if (v == null) return "—";
  const sign = v > 0 ? "+" : "";
  return `${sign}${(v * 100).toFixed(digits)}%`;
}

function scoreColor(score: number | null): string {
  if (score == null) return "var(--muted)";
  if (score >= 70) return "#4cc9b0";
  if (score >= 55) return "#e0b341";
  return "#e26a8f";
}

function taxLabel(score: number | null): string {
  if (score == null) return "—";
  if (score >= 100) return "%0 HSYF";
  if (score >= 50) return "Döviz/Serbest";
  if (score >= 25) return "%17.5";
  return "Belirsiz";
}

export function ScoreSummaryCards({
  scores,
  returns,
  persona,
}: {
  scores: FundScores | null;
  returns: FundReturns | null;
  persona: UserPersona | null;
}) {
  return (
    <div
      style={{
        display: "grid",
        gridTemplateColumns: "repeat(auto-fit, minmax(180px, 1fr))",
        gap: 12,
      }}
    >
      <Card
        label="Mehmet Score"
        value={scores?.mehmet_score?.toString() ?? "—"}
        sub={
          scores
            ? `${scores.components_used ?? 0}/5 bileşen · ${persona?.name ?? ""}`
            : "skor yok"
        }
        color={scoreColor(scores?.mehmet_score ?? null)}
      />
      <Card
        label="Stopaj"
        value={taxLabel(scores?.tax_advantage_score ?? null)}
        sub={
          returns?.tax_confidence
            ? `güven: ${returns.tax_confidence}`
            : "—"
        }
      />
      <Card
        label="Net 1Y"
        value={pct(returns?.net_1y, 1)}
        sub={
          returns?.vs_category_net_1y != null
            ? `kategori medyanına göre ${pct(returns.vs_category_net_1y, 1)}`
            : returns?.vs_category_1y != null
            ? `kategori medyanına göre ${pct(returns.vs_category_1y, 1)} (brüt)`
            : "kategori karşılaştırma yok"
        }
        color={
          returns?.net_1y == null
            ? "var(--muted)"
            : returns.net_1y >= 0
            ? "#4cc9b0"
            : "#e26a8f"
        }
      />
      <Card
        label="Reel 1Y"
        value={pct(returns?.real_1y, 1)}
        sub="CPI-deflated (Fisher)"
        color={
          returns?.real_1y == null
            ? "var(--muted)"
            : returns.real_1y >= 0
            ? "#4cc9b0"
            : "#e26a8f"
        }
      />
    </div>
  );
}

function Card({
  label,
  value,
  sub,
  color,
}: {
  label: string;
  value: string;
  sub: string;
  color?: string;
}) {
  return (
    <div className="card" style={{ padding: "14px 18px" }}>
      <div style={{ fontSize: 10, color: "var(--muted)", textTransform: "uppercase", letterSpacing: 0.5, fontWeight: 600 }}>
        {label}
      </div>
      <div style={{ fontSize: 28, fontWeight: 700, color: color ?? "var(--fg)", marginTop: 4 }}>
        {value}
      </div>
      <div style={{ fontSize: 11, color: "var(--muted)", marginTop: 2 }}>{sub}</div>
    </div>
  );
}

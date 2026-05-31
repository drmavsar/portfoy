import type { TaxImpact } from "@/app/(app)/_lib/tefas/score-explain";

interface Props {
  taxImpact: TaxImpact;
}

function pct(v: number | null, digits = 1): string {
  if (v == null) return "—";
  const sign = v > 0 ? "+" : "";
  return `${sign}${(v * 100).toFixed(digits)}%`;
}

export function TaxImpactCard({ taxImpact }: Props) {
  const cf = taxImpact.hsyf_counterfactual;
  return (
    <div className="card" style={{ padding: 16 }}>
      <div style={{ fontSize: 11, color: "var(--muted)", textTransform: "uppercase", letterSpacing: 0.5, fontWeight: 600, marginBottom: 10 }}>
        Stopaj Etkisi
      </div>
      <div style={{ display: "grid", gridTemplateColumns: "auto 1fr", gap: "4px 12px", fontSize: 13 }}>
        <span style={{ color: "var(--muted)" }}>Brüt 1Y</span>
        <span style={{ fontFamily: "var(--font-mono)", fontWeight: 600, textAlign: "right" }}>
          {pct(taxImpact.gross_1y)}
        </span>
        <span style={{ color: "var(--muted)" }}>Net 1Y</span>
        <span style={{ fontFamily: "var(--font-mono)", fontWeight: 600, textAlign: "right" }}>
          {pct(taxImpact.net_1y)}
        </span>
        <span style={{ color: "var(--muted)" }}>Etki</span>
        <span style={{
          fontFamily: "var(--font-mono)",
          fontWeight: 600,
          textAlign: "right",
          color: cf.already_hsyf ? "#4cc9b0" : "#e26a8f",
        }}>
          {taxImpact.label}
        </span>
      </div>
      <div
        style={{
          marginTop: 10,
          padding: "8px 10px",
          borderRadius: 6,
          background: cf.already_hsyf ? "#4cc9b022" : "var(--surface-2)",
          fontSize: 11,
          color: cf.already_hsyf ? "#4cc9b0" : "var(--muted)",
        }}
      >
        {cf.label}
      </div>
      {taxImpact.applied_tax_kind && (
        <div style={{ fontSize: 10, color: "var(--muted)", marginTop: 6 }}>
          Uygulama: {taxImpact.applied_tax_kind}
          {taxImpact.applied_tax_rate != null
            ? ` (${(taxImpact.applied_tax_rate * 100).toFixed(1)}%)`
            : ""}
        </div>
      )}
    </div>
  );
}

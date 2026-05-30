import Link from "next/link";

import type { Fund, FundCategory, FundScores } from "@/app/(app)/_lib/tefas/types";

function taxLabelFromScore(score: number | null): string {
  if (score == null) return "";
  if (score >= 100) return "HSYF · %0 stopaj";
  if (score >= 50) return "döviz/serbest";
  if (score >= 25) return "%17.5 stopaj";
  return "belirsiz";
}

interface Props {
  scores: FundScores[];
  funds: Fund[];
  categories: FundCategory[];
}

function scoreColor(score: number | null): string {
  if (score == null) return "var(--muted)";
  if (score >= 70) return "#4cc9b0";
  if (score >= 55) return "#e0b341";
  return "#e26a8f";
}

export function TopMehmetTable({ scores, funds, categories }: Props) {
  const codeToFund = new Map(funds.map((f) => [f.code, f]));
  const catById = new Map(categories.map((c) => [c.id, c]));

  const top10 = [...scores]
    .filter((s) => s.mehmet_score !== null)
    .sort((a, b) => (b.mehmet_score ?? 0) - (a.mehmet_score ?? 0))
    .slice(0, 10);

  if (top10.length === 0) {
    return (
      <div className="card">
        <div className="card-head">
          <div className="card-title">Top 10 Mehmet Score</div>
          <div className="card-sub">veri yok</div>
        </div>
        <div style={{ padding: 14, fontSize: 12, color: "var(--muted)" }}>
          {scores.length} fon için skor satırı var ama tümünde{" "}
          <code>mehmet_score = null</code>. Mehmet Score 5 component üzerine kuruludur;
          performance / risk / inflation_protection için en az 1 yıllık NAV history
          gerekir. NAV backfill çalıştırıldıktan sonra skor dolar.
        </div>
      </div>
    );
  }

  return (
    <div className="card">
      <div className="card-head">
        <div className="card-title">Top 10 Mehmet Score</div>
        <div className="card-sub">aktif persona</div>
      </div>
      <div>
        {top10.map((s, idx) => {
          const fund = codeToFund.get(s.fund_code);
          const cat = fund ? catById.get(fund.category_id) : null;
          return (
            <Link
              key={s.fund_code}
              href={`/fonlar/${encodeURIComponent(s.fund_code)}`}
              style={{
                display: "grid",
                gridTemplateColumns: "32px 70px 1fr auto 60px",
                gap: 10,
                alignItems: "center",
                padding: "10px 14px",
                borderBottom: idx < top10.length - 1 ? "1px solid var(--border-soft)" : "none",
                color: "inherit",
                textDecoration: "none",
                fontSize: 13,
              }}
            >
              <span style={{ fontSize: 11, color: "var(--muted)", textAlign: "right" }}>
                #{idx + 1}
              </span>
              <code style={{ fontFamily: "var(--font-mono)", fontWeight: 600 }}>
                {s.fund_code}
              </code>
              <div>
                <div style={{ fontSize: 12 }}>{cat?.name_tr ?? "—"}</div>
                <div style={{ fontSize: 10, color: "var(--muted)", marginTop: 2 }}>
                  {fund?.is_equity_intensive && (
                    <span style={{ marginRight: 6, color: "#c44569" }}>HSYF</span>
                  )}
                  {fund?.is_fx_denominated && (
                    <span style={{ marginRight: 6, color: "#6ea8fe" }}>{fund.currency}</span>
                  )}
                  {taxLabelFromScore(s.tax_advantage_score)}
                </div>
              </div>
              <span style={{ fontSize: 11, color: "var(--muted)" }}>
                {s.components_used ?? 0}/5
              </span>
              <strong
                style={{
                  fontSize: 18,
                  color: scoreColor(s.mehmet_score),
                  textAlign: "right",
                }}
              >
                {s.mehmet_score}
              </strong>
            </Link>
          );
        })}
      </div>
    </div>
  );
}

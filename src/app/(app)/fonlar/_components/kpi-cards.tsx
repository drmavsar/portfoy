import type { Fund, FundScores } from "@/app/(app)/_lib/tefas/types";

interface Props {
  scores: FundScores[];
  funds: Fund[];
}

function median(values: Array<number | null | undefined>): number | null {
  const xs = values.filter((v): v is number => v != null && Number.isFinite(v));
  if (xs.length === 0) return null;
  const sorted = [...xs].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  return sorted.length % 2 === 0 ? (sorted[mid - 1] + sorted[mid]) / 2 : sorted[mid];
}

function avg(values: Array<number | null | undefined>): number | null {
  const xs = values.filter((v): v is number => v != null && Number.isFinite(v));
  if (xs.length === 0) return null;
  return xs.reduce((a, b) => a + b, 0) / xs.length;
}

export function KpiCards({ scores, funds }: Props) {
  const codeToFund = new Map(funds.map((f) => [f.code, f]));

  const mehmetScores = scores.map((s) => s.mehmet_score);
  const medianMehmet = median(mehmetScores);
  const topMehmet = Math.max(...mehmetScores.filter((v): v is number => v != null));

  const hsyfScores = scores
    .filter((s) => codeToFund.get(s.fund_code)?.is_equity_intensive)
    .map((s) => s.mehmet_score);
  const hsyfAvg = avg(hsyfScores);

  const top10Real = [...scores]
    .sort((a, b) => (b.mehmet_score ?? 0) - (a.mehmet_score ?? 0))
    .slice(0, 10);
  // Top 10 fonun "inflation_protection_score" ortalaması — reel getirinin
  // yaklaşık yansıması.
  const top10ReelAvg = avg(top10Real.map((s) => s.inflation_protection_score));

  const items: Array<{ label: string; value: string; sub: string; color?: string }> = [
    {
      label: "Mehmet Score",
      value: medianMehmet != null ? medianMehmet.toFixed(0) : "—",
      sub: `medyan · top ${topMehmet}`,
    },
    {
      label: "HSYF Avg",
      value: hsyfAvg != null ? hsyfAvg.toFixed(0) : "—",
      sub: `${hsyfScores.length} fon · stopaj %0`,
      color: "#c44569",
    },
    {
      label: "Reel Koruma (Top 10)",
      value: top10ReelAvg != null ? top10ReelAvg.toFixed(0) : "—",
      sub: "enflasyon koruma ortalaması",
      color: "#4cc9b0",
    },
    {
      label: "Skor Kapsamı",
      value: `${scores.length}/${funds.length}`,
      sub: `${Math.round((scores.length / Math.max(1, funds.length)) * 100)}% fon skorlu`,
    },
  ];

  return (
    <div
      style={{
        display: "grid",
        gridTemplateColumns: "repeat(auto-fit, minmax(180px, 1fr))",
        gap: 12,
      }}
    >
      {items.map((it) => (
        <div
          key={it.label}
          className="card"
          style={{ padding: "14px 18px" }}
        >
          <div style={{ fontSize: 10, color: "var(--muted)", textTransform: "uppercase", letterSpacing: 0.5, fontWeight: 600 }}>
            {it.label}
          </div>
          <div style={{ fontSize: 28, fontWeight: 700, color: it.color ?? "var(--fg)", marginTop: 4 }}>
            {it.value}
          </div>
          <div style={{ fontSize: 11, color: "var(--muted)", marginTop: 2 }}>{it.sub}</div>
        </div>
      ))}
    </div>
  );
}

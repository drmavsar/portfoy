import type { Fund, FundCategory, FundScores } from "@/app/(app)/_lib/tefas/types";

interface Props {
  funds: Fund[];
  categories: FundCategory[];
  scores: FundScores[];
}

interface CatRow {
  cat: FundCategory;
  fundCount: number;
  avgMehmet: number | null;
  topMehmet: number | null;
}

export function CategoryDistribution({ funds, categories, scores }: Props) {
  const scoresByCode = new Map(scores.map((s) => [s.fund_code, s]));

  const rows: CatRow[] = categories
    .map((cat) => {
      const fundsInCat = funds.filter((f) => f.category_id === cat.id);
      const mehmetValues = fundsInCat
        .map((f) => scoresByCode.get(f.code)?.mehmet_score)
        .filter((v): v is number => v != null);
      const avg = mehmetValues.length > 0
        ? mehmetValues.reduce((a, b) => a + b, 0) / mehmetValues.length
        : null;
      const top = mehmetValues.length > 0 ? Math.max(...mehmetValues) : null;
      return { cat, fundCount: fundsInCat.length, avgMehmet: avg, topMehmet: top };
    })
    .filter((r) => r.fundCount > 0)
    .sort((a, b) => (b.avgMehmet ?? -1) - (a.avgMehmet ?? -1));

  return (
    <div className="card">
      <div className="card-head">
        <div className="card-title">Kategori Bazlı Mehmet Score</div>
        <div className="card-sub">{rows.length} kategori · ortalama DESC</div>
      </div>
      <div>
        {rows.map((r, idx) => (
          <div
            key={r.cat.id}
            style={{
              display: "grid",
              gridTemplateColumns: "1fr auto auto auto 200px",
              gap: 10,
              alignItems: "center",
              padding: "10px 14px",
              borderBottom: idx < rows.length - 1 ? "1px solid var(--border-soft)" : "none",
              borderLeft: `3px solid ${r.cat.color ?? "var(--border)"}`,
              fontSize: 12,
            }}
          >
            <div>
              <div style={{ fontSize: 13 }}>{r.cat.name_tr}</div>
              <div style={{ fontSize: 10, color: "var(--muted)" }}>{r.cat.code}</div>
            </div>
            <span style={{ fontSize: 11, color: "var(--muted)" }}>
              {r.fundCount} fon
            </span>
            <span style={{ fontSize: 11, color: "var(--muted)" }}>
              top {r.topMehmet ?? "—"}
            </span>
            <strong style={{ fontSize: 16 }}>
              {r.avgMehmet != null ? r.avgMehmet.toFixed(1) : "—"}
            </strong>
            <div
              style={{
                position: "relative",
                height: 6,
                background: "var(--surface-2)",
                borderRadius: 3,
                overflow: "hidden",
              }}
            >
              <div
                style={{
                  position: "absolute",
                  left: 0,
                  top: 0,
                  bottom: 0,
                  width: `${Math.max(0, Math.min(100, r.avgMehmet ?? 0))}%`,
                  background: r.cat.color ?? "var(--accent)",
                }}
              />
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

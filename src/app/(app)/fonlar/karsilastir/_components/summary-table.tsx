import Link from "next/link";

import type {
  Fund,
  FundCategory,
  FundReturns,
  FundScores,
} from "@/app/(app)/_lib/tefas/types";

interface Props {
  funds: Fund[];
  returns: FundReturns[];
  scores: FundScores[];
  categories: Map<number, FundCategory>;
  colorByCode: Map<string, string>;
}

function pct(v: number | null | undefined, digits = 1): string {
  if (v == null) return "—";
  const sign = v > 0 ? "+" : "";
  return `${sign}${(v * 100).toFixed(digits)}%`;
}

function valColor(v: number | null | undefined, neutral = false): string {
  if (v == null) return "var(--muted)";
  if (neutral) return "var(--fg)";
  if (v > 0) return "#4cc9b0";
  if (v < 0) return "#e26a8f";
  return "var(--fg)";
}

function scoreColor(s: number | null): string {
  if (s == null) return "var(--muted)";
  if (s >= 70) return "#4cc9b0";
  if (s >= 55) return "#e0b341";
  return "#e26a8f";
}

function taxLabel(s: number | null): string {
  if (s == null) return "—";
  if (s >= 100) return "%0 HSYF";
  if (s >= 50) return "Döviz/Serb.";
  if (s >= 25) return "%17.5";
  return "Belirsiz";
}

interface RowDef {
  label: string;
  getCell: (
    fund: Fund,
    ret: FundReturns | undefined,
    score: FundScores | undefined,
  ) => { text: string; color?: string; bold?: boolean };
}

export function SummaryTable({ funds, returns, scores, categories, colorByCode }: Props) {
  const retByCode = new Map(returns.map((r) => [r.fund_code, r]));
  const scoreByCode = new Map(scores.map((s) => [s.fund_code, s]));

  const rows: RowDef[] = [
    {
      label: "Mehmet Score",
      getCell: (_f, _r, s) => ({
        text: s?.mehmet_score?.toString() ?? "—",
        color: scoreColor(s?.mehmet_score ?? null),
        bold: true,
      }),
    },
    {
      label: "Kategori",
      getCell: (f) => ({ text: categories.get(f.category_id)?.name_tr ?? "—" }),
    },
    {
      label: "Universe",
      getCell: (f) => ({ text: f.investment_universe }),
    },
    {
      label: "Stopaj",
      getCell: (_f, _r, s) => ({ text: taxLabel(s?.tax_advantage_score ?? null) }),
    },
    {
      label: "Net 1Y",
      getCell: (_f, r) => ({ text: pct(r?.net_1y), color: valColor(r?.net_1y) }),
    },
    {
      label: "Net 3Y CAGR",
      getCell: (_f, r) => ({ text: pct(r?.net_3y_cagr), color: valColor(r?.net_3y_cagr) }),
    },
    {
      label: "Reel 1Y",
      getCell: (_f, r) => ({ text: pct(r?.real_1y), color: valColor(r?.real_1y) }),
    },
    {
      label: "vs Kategori (net 1Y)",
      getCell: (_f, r) => ({
        text: pct(r?.vs_category_net_1y ?? r?.vs_category_1y),
        color: valColor(r?.vs_category_net_1y ?? r?.vs_category_1y),
      }),
    },
    {
      label: "Volatilite 1Y",
      getCell: (_f, _r, s) => ({ text: pct(s?.volatility_1y, 1) }),
    },
    {
      label: "Max DD 3Y",
      getCell: (_f, _r, s) => ({ text: pct(s?.max_drawdown_3y, 1), color: valColor(s?.max_drawdown_3y) }),
    },
    {
      label: "Risk skor",
      getCell: (_f, _r, s) => ({ text: s?.normalized_risk_score?.toString() ?? "—" }),
    },
    {
      label: "Çeşitlendirme",
      getCell: (_f, _r, s) => ({ text: s?.diversification_score?.toString() ?? "—" }),
    },
    {
      label: "BIST bağımlılık",
      getCell: (_f, _r, s) => ({ text: s?.bist_dependency_score?.toString() ?? "—" }),
    },
    {
      label: "Altın bağımlılık",
      getCell: (_f, _r, s) => ({ text: s?.gold_dependency_score?.toString() ?? "—" }),
    },
  ];

  const colWidth = `minmax(120px, 1fr)`;
  const gridTemplate = `200px ${funds.map(() => colWidth).join(" ")}`;

  return (
    <div className="card">
      <div className="card-head">
        <div className="card-title">Karşılaştırma Tablosu</div>
        <div className="card-sub">{funds.length} fon · 14 metrik</div>
      </div>
      <div style={{ overflowX: "auto" }}>
        {/* Header */}
        <div
          style={{
            display: "grid",
            gridTemplateColumns: gridTemplate,
            gap: 10,
            padding: "10px 14px",
            borderBottom: "1px solid var(--border-soft)",
            fontSize: 11,
            fontWeight: 600,
            minWidth: 600,
          }}
        >
          <span style={{ color: "var(--muted)", textTransform: "uppercase", letterSpacing: 0.5 }}>
            Metrik
          </span>
          {funds.map((f) => (
            <Link
              key={f.code}
              href={`/fonlar/${encodeURIComponent(f.code)}`}
              style={{
                color: colorByCode.get(f.code) ?? "var(--fg)",
                textAlign: "right",
                textDecoration: "none",
                fontFamily: "var(--font-mono)",
              }}
            >
              {f.code}
            </Link>
          ))}
        </div>

        {/* Body */}
        {rows.map((row, idx) => (
          <div
            key={row.label}
            style={{
              display: "grid",
              gridTemplateColumns: gridTemplate,
              gap: 10,
              padding: "8px 14px",
              borderBottom: idx < rows.length - 1 ? "1px solid var(--border-soft)" : "none",
              fontSize: 12,
              minWidth: 600,
            }}
          >
            <span style={{ color: "var(--muted)" }}>{row.label}</span>
            {funds.map((f) => {
              const cell = row.getCell(f, retByCode.get(f.code), scoreByCode.get(f.code));
              return (
                <span
                  key={f.code}
                  style={{
                    textAlign: "right",
                    color: cell.color ?? "var(--fg)",
                    fontFamily: "var(--font-mono)",
                    fontWeight: cell.bold ? 700 : 400,
                    fontSize: cell.bold ? 14 : 12,
                  }}
                >
                  {cell.text}
                </span>
              );
            })}
          </div>
        ))}
      </div>
    </div>
  );
}

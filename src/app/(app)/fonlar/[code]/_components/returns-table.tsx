import type { FundReturns } from "@/app/(app)/_lib/tefas/types";

function pct(v: number | null | undefined, digits = 2): string {
  if (v == null) return "—";
  const sign = v > 0 ? "+" : "";
  return `${sign}${(v * 100).toFixed(digits)}%`;
}

function valueCellStyle(v: number | null | undefined): React.CSSProperties {
  if (v == null) return { color: "var(--muted)" };
  if (v >= 0) return { color: "#4cc9b0" };
  return { color: "#e26a8f" };
}

interface Row {
  label: string;
  gross: number | null;
  net: number | null;
  real: number | null;
  vsCategory: number | null;
}

export function ReturnsTable({ returns }: { returns: FundReturns | null }) {
  if (!returns) {
    return (
      <div className="card">
        <div className="card-head">
          <div className="card-title">Getiri Pencereleri</div>
          <div className="card-sub">veri yok</div>
        </div>
        <div style={{ padding: 18, color: "var(--muted)", fontSize: 13 }}>
          Returns refresh cron tetiklendiğinde dolar.
        </div>
      </div>
    );
  }

  const rows: Row[] = [
    { label: "1G", gross: returns.gross_1d, net: null, real: null, vsCategory: null },
    { label: "1H", gross: returns.gross_1w, net: null, real: null, vsCategory: null },
    { label: "1A", gross: returns.gross_1m, net: null, real: null, vsCategory: null },
    { label: "3A", gross: returns.gross_3m, net: null, real: null, vsCategory: null },
    { label: "6A", gross: returns.gross_6m, net: null, real: null, vsCategory: null },
    { label: "YTD", gross: returns.gross_ytd, net: null, real: null, vsCategory: null },
    {
      label: "1Y",
      gross: returns.gross_1y,
      net: returns.net_1y,
      real: returns.real_1y,
      vsCategory: returns.vs_category_net_1y ?? returns.vs_category_1y,
    },
    {
      label: "3Y CAGR",
      gross: returns.gross_3y_cagr,
      net: returns.net_3y_cagr,
      real: returns.real_3y_cagr,
      vsCategory: returns.vs_category_net_3y ?? returns.vs_category_3y,
    },
    {
      label: "5Y CAGR",
      gross: returns.gross_5y_cagr,
      net: returns.net_5y_cagr,
      real: returns.real_5y_cagr,
      vsCategory: null,
    },
  ];

  return (
    <div className="card">
      <div className="card-head">
        <div className="card-title">Getiri Pencereleri</div>
        <div className="card-sub">brüt · net · reel · kategori vs</div>
      </div>
      <div>
        <div
          style={{
            display: "grid",
            gridTemplateColumns: "70px 1fr 1fr 1fr 1fr",
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
          <span>Pencere</span>
          <span style={{ textAlign: "right" }}>Brüt</span>
          <span style={{ textAlign: "right" }}>Net</span>
          <span style={{ textAlign: "right" }}>Reel</span>
          <span style={{ textAlign: "right" }}>vs Kategori</span>
        </div>
        {rows.map((r, idx) => (
          <div
            key={r.label}
            style={{
              display: "grid",
              gridTemplateColumns: "70px 1fr 1fr 1fr 1fr",
              gap: 10,
              padding: "8px 14px",
              borderBottom: idx < rows.length - 1 ? "1px solid var(--border-soft)" : "none",
              fontSize: 12,
              fontFamily: "var(--font-mono)",
            }}
          >
            <span style={{ fontWeight: 600, fontFamily: "inherit" }}>{r.label}</span>
            <span style={{ textAlign: "right", ...valueCellStyle(r.gross) }}>{pct(r.gross)}</span>
            <span style={{ textAlign: "right", ...valueCellStyle(r.net) }}>{pct(r.net)}</span>
            <span style={{ textAlign: "right", ...valueCellStyle(r.real) }}>{pct(r.real)}</span>
            <span style={{ textAlign: "right", ...valueCellStyle(r.vsCategory) }}>
              {pct(r.vsCategory)}
            </span>
          </div>
        ))}
      </div>
    </div>
  );
}

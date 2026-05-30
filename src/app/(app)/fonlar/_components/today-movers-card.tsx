import Link from "next/link";

import type { Fund, FundReturns } from "@/app/(app)/_lib/tefas/types";

interface Props {
  returns: FundReturns[];
  funds: Fund[];
}

function pct(v: number | null): string {
  if (v == null) return "—";
  const sign = v > 0 ? "+" : "";
  return `${sign}${(v * 100).toFixed(2)}%`;
}

function MoverRow({
  fund,
  value,
  positive,
}: {
  fund: Fund | undefined;
  value: number;
  positive: boolean;
}) {
  const color = positive ? "#4cc9b0" : "#e26a8f";
  return (
    <Link
      href={fund ? `/fonlar/${encodeURIComponent(fund.code)}` : "#"}
      style={{
        display: "grid",
        gridTemplateColumns: "70px 1fr auto",
        gap: 10,
        alignItems: "center",
        padding: "6px 14px",
        color: "inherit",
        textDecoration: "none",
        fontSize: 12,
      }}
    >
      <code style={{ fontFamily: "var(--font-mono)", fontWeight: 600 }}>
        {fund?.code ?? "?"}
      </code>
      <span style={{ color: "var(--muted)", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
        {fund?.name ?? "—"}
      </span>
      <strong style={{ color, textAlign: "right", fontFamily: "var(--font-mono)" }}>
        {pct(value)}
      </strong>
    </Link>
  );
}

export function TodayMoversCard({ returns, funds }: Props) {
  const codeToFund = new Map(funds.map((f) => [f.code, f]));

  const withDelta = returns.filter((r) => r.gross_1d !== null && Number.isFinite(r.gross_1d));
  const sorted = [...withDelta].sort((a, b) => (b.gross_1d ?? 0) - (a.gross_1d ?? 0));
  const top5Up = sorted.slice(0, 5);
  const top5Down = sorted.slice(-5).reverse();

  if (withDelta.length === 0) {
    return (
      <div className="card">
        <div className="card-head">
          <div className="card-title">Bugün Dikkat Çekenler</div>
          <div className="card-sub">veri yok</div>
        </div>
        <div style={{ padding: 14, fontSize: 12, color: "var(--muted)" }}>
          Günlük NAV değişimi cache&apos;de yok. NAV ingest cron tetiklendiğinde dolar.
        </div>
      </div>
    );
  }

  return (
    <div className="card">
      <div className="card-head">
        <div className="card-title">Bugün Dikkat Çekenler</div>
        <div className="card-sub">1G NAV değişimi</div>
      </div>

      <div style={{ paddingTop: 4 }}>
        <div style={{ padding: "6px 14px", fontSize: 10, color: "#4cc9b0", textTransform: "uppercase", letterSpacing: 0.5, fontWeight: 600 }}>
          ▲ En Çok Yükselen
        </div>
        {top5Up.map((r) => (
          <MoverRow
            key={`up-${r.fund_code}`}
            fund={codeToFund.get(r.fund_code)}
            value={r.gross_1d ?? 0}
            positive={true}
          />
        ))}

        <div style={{ padding: "6px 14px", marginTop: 8, fontSize: 10, color: "#e26a8f", textTransform: "uppercase", letterSpacing: 0.5, fontWeight: 600 }}>
          ▼ En Çok Düşen
        </div>
        {top5Down.map((r) => (
          <MoverRow
            key={`down-${r.fund_code}`}
            fund={codeToFund.get(r.fund_code)}
            value={r.gross_1d ?? 0}
            positive={false}
          />
        ))}
      </div>
    </div>
  );
}

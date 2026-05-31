import { fmt } from "@/lib/finance/fmt";
import type { AllocationSummary } from "@/app/(app)/_lib/tefas/allocation-types";

export function SummaryCard({
  summary,
  generatedAt,
}: {
  summary: AllocationSummary;
  generatedAt: string;
}) {
  const cashNeedPos = summary.net_cash_need_try > 0;
  return (
    <div className="card card-pad" style={{ padding: 20 }}>
      <div
        style={{
          display: "flex",
          justifyContent: "space-between",
          alignItems: "baseline",
          marginBottom: 14,
        }}
      >
        <div style={{ fontWeight: 600, fontSize: 14, letterSpacing: 0.04 }}>
          İşlem Etkisi Özeti
        </div>
        <div style={{ fontSize: 11, color: "var(--muted)" }}>
          {new Date(generatedAt).toLocaleString("tr-TR")}
        </div>
      </div>

      <div
        style={{
          display: "grid",
          gridTemplateColumns: "repeat(4, minmax(0, 1fr))",
          gap: 12,
        }}
      >
        <KpiCell label="Toplam Portföy" value={fmt.try(summary.total_market_value_try)} />
        <KpiCell
          label="Önerilen Alım"
          value={fmt.try(summary.total_buy_try)}
          tone={summary.total_buy_try > 0 ? "accent" : "muted"}
        />
        <KpiCell
          label="Önerilen Satış"
          value={fmt.try(summary.total_sell_try)}
          tone={summary.total_sell_try > 0 ? "warning" : "muted"}
        />
        <KpiCell
          label="Net Nakit İhtiyacı"
          value={fmt.try(Math.abs(summary.net_cash_need_try))}
          sub={
            cashNeedPos
              ? "Ek nakit gerekli"
              : summary.net_cash_need_try < 0
                ? "Net nakit girişi"
                : "Nötr"
          }
          tone={cashNeedPos ? "warning" : "positive"}
        />
      </div>

      <div
        style={{
          display: "grid",
          gridTemplateColumns: "repeat(4, minmax(0, 1fr))",
          gap: 12,
          marginTop: 12,
        }}
      >
        <KpiCell
          label="Tahmini Net Satış Geliri"
          value={fmt.try(summary.estimated_net_proceeds_try)}
        />
        <KpiCell
          label="Tahmini Realize Kâr/Zarar"
          value={fmt.try(summary.total_realized_pnl_try)}
          tone={summary.total_realized_pnl_try >= 0 ? "positive" : "negative"}
        />
        <KpiCell
          label="Tahmini Stopaj"
          value={fmt.try(summary.total_tax_try)}
          tone={summary.total_tax_try > 0 ? "warning" : "muted"}
        />
        <KpiCell
          label="Net Kâr/Zarar (Stopaj Sonrası)"
          value={fmt.try(summary.total_net_pnl_try)}
          tone={summary.total_net_pnl_try >= 0 ? "positive" : "negative"}
        />
      </div>

      <div
        style={{
          marginTop: 14,
          fontSize: 11,
          color: "var(--muted)",
          display: "flex",
          gap: 12,
          flexWrap: "wrap",
        }}
      >
        <span>Top {summary.top_n} · {summary.strategy === "equal_weight" ? "Eşit ağırlık" : summary.strategy}</span>
        <span>·</span>
        <span>Yeniden dengeleme bandı: ±%{(summary.rebalance_band_pct * 100).toFixed(0)}</span>
      </div>
    </div>
  );
}

function KpiCell({
  label,
  value,
  sub,
  tone = "default",
}: {
  label: string;
  value: string;
  sub?: string;
  tone?: "default" | "accent" | "positive" | "negative" | "warning" | "muted";
}) {
  const colorMap: Record<string, string> = {
    default: "var(--fg)",
    accent: "var(--accent)",
    positive: "var(--positive)",
    negative: "var(--negative)",
    warning: "var(--warning)",
    muted: "var(--muted)",
  };
  return (
    <div className="kpi">
      <div className="kpi-label">{label}</div>
      <div className="kpi-value" style={{ color: colorMap[tone] }}>
        {value}
      </div>
      {sub && (
        <div style={{ fontSize: 10, color: "var(--muted)", marginTop: 4 }}>{sub}</div>
      )}
    </div>
  );
}

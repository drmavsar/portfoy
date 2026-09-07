"use client";

import { DataGrid, type GridColumn } from "@/components/grid/data-grid";
import { moneyTotals } from "@/components/grid/model";
import { quantityTotals } from "@/components/grid/investment-summary";
import { fmt } from "@/lib/finance/fmt";
import type { TradePlan } from "@/app/(app)/_lib/trade-plan";

export interface PortfolioGridRow {
  id: string; assetId: string; portfolio: string; person: string; symbol: string; name: string; assetClass: string; url: string | null;
  quantity: number; wac: number; cost: number; price: number | null; priceCurrency: string; changePct: number | null;
  value: number; pnl: number; pnlPct: number | null; dayChange: number; plan: TradePlan | null;
}
const percent = (n: number | null) => n == null ? "—" : fmt.pct(n, 2);
const classes: Record<string, string> = { equity: "Hisse", stock: "Hisse", fund: "Fon", crypto: "Kripto", metal: "Değerli Maden", bond: "Tahvil" };
const columns: GridColumn<PortfolioGridRow>[] = [
  { id: "value", title: "Değer (TRY)", value: r => r.value, numeric: true, render: r => fmt.try(r.value, 2) },
  { id: "symbol", title: "Sembol", value: r => r.symbol, groupable: true, render: r => <div>{r.url ? <a href={r.url} target="_blank" rel="noopener noreferrer">{r.symbol}</a> : r.symbol}<div className="hint">{r.name}</div></div> },
  { id: "portfolio", title: "Portföy", value: r => r.portfolio, groupable: true },
  { id: "person", title: "Kişi", value: r => r.person, groupable: true },
  { id: "class", title: "Varlık Türü", value: r => classes[r.assetClass] ?? r.assetClass, groupable: true },
  { id: "price", title: "Son Fiyat", value: r => r.price, numeric: true, render: r => r.price == null ? "—" : fmt.tr(r.price, priceDecimals(r.assetClass)) },
  { id: "currency", title: "Fiyat Para Birimi", value: r => r.priceCurrency, groupable: true },
  { id: "change", title: "Günlük %", value: r => r.changePct, numeric: true, render: r => percent(r.changePct) },
  { id: "daily", title: "Günlük K/Z (TRY)", value: r => r.dayChange, numeric: true, render: r => fmt.try(r.dayChange, 2) },
  { id: "quantity", title: "Adet", value: r => r.quantity, numeric: true, render: r => fmt.tr(r.quantity, qtyDecimals(r.assetClass, r.symbol)) },
  { id: "wac", title: "WAC (TRY)", value: r => r.wac, numeric: true, render: r => fmt.tr(r.wac, priceDecimals(r.assetClass)) },
  { id: "cost", title: "Maliyet (TRY)", value: r => r.cost, numeric: true, render: r => fmt.try(r.cost, 2) },
  { id: "pnl", title: "Toplam K/Z (TRY)", value: r => r.pnl, numeric: true, render: r => <span style={{ color: r.pnl >= 0 ? "var(--positive)" : "var(--negative)" }}>{fmt.try(r.pnl, 2)}</span> },
  { id: "pnlPct", title: "Toplam K/Z %", value: r => r.pnlPct, numeric: true, render: r => percent(r.pnlPct) },
  { id: "plan", title: "Plan", value: r => r.plan?.health_label ?? null, groupable: true, render: r => r.plan ? <PlanCell plan={r.plan} /> : "—" },
];
function summary(rows: PortfolioGridRow[]) {
  const money = (field: "value" | "cost" | "pnl" | "dayChange") => moneyTotals(rows, r => r[field], () => "TRY");
  const cost = rows.reduce((s, r) => s + r.cost, 0);
  const pnl = rows.reduce((s, r) => s + r.pnl, 0);
  return <span>Değer: {money("value")} · Maliyet: {money("cost")} · K/Z: {money("pnl")} ({percent(cost > 0 ? pnl / cost * 100 : null)}) · Günlük: {money("dayChange")}<br />{quantityTotals(rows, r => r.assetId, r => r.symbol, r => r.quantity)}</span>;
}
export function PortfolioGrid({ rows }: { rows: PortfolioGridRow[] }) {
  return <div className="card"><div className="card-head"><div className="card-title">Tüm Pozisyonlar</div><div className="card-sub">Güncel pozisyonlar · {rows.length} kayıt</div></div><DataGrid rows={rows} columns={columns} rowId={r => r.id} storageKey="portfolio-holdings-grid-v1" summary={summary} /></div>;
}

function qtyDecimals(assetClass: string | undefined, symbol: string | undefined): number {
  if (assetClass === "crypto") {
    if (symbol === "BTC") return 8;
    return 4;
  }
  if (assetClass === "metal") return 2;
  if (assetClass === "fund") return 6; // Kesirli fon paylarını koru
  return 0;
}

// Fiyat/maliyet hassasiyeti: fon NAV ve WAC'ı 6 haneye kadar taşır
// (TEFAS pay fiyatı bu hassasiyette); hisse/diğer için 2 hane.
function priceDecimals(assetClass: string | undefined): number {
  return assetClass === "fund" ? 6 : 2;
}

function PlanCell({ plan }: { plan: TradePlan }) {
  // Tooltip mesajı tüm detayı içerir; hücre kompakt rozet + T1/S1 mesafesi
  const tooltip = [
    `Sağlık: ${plan.health_label}`,
    `T1: ${fmt.tr(plan.t1, 2)} (+${plan.delta_t1_pct.toFixed(1)}%) · RR ${plan.rr1.toFixed(2)}`,
    `T2: ${fmt.tr(plan.t2, 2)} (+${plan.delta_t2_pct.toFixed(1)}%) · RR ${plan.rr2.toFixed(2)}`,
    `S1: ${fmt.tr(plan.s1, 2)} (${plan.delta_s1_pct.toFixed(1)}%)`,
    `S2: ${fmt.tr(plan.s2, 2)} (${plan.delta_s2_pct.toFixed(1)}%)`,
    plan.high_52w_distance_pct != null
      ? `52W high'a uzaklık: ${plan.high_52w_distance_pct.toFixed(1)}%`
      : null,
    plan.ma20_extension_pct != null
      ? `MA20 extension: ${plan.ma20_extension_pct >= 0 ? "+" : ""}${plan.ma20_extension_pct.toFixed(1)}%`
      : null,
  ]
    .filter(Boolean)
    .join("\n");

  return (
    <div title={tooltip} style={{ display: "flex", flexDirection: "column", alignItems: "flex-end", gap: 2 }}>
      <span
        style={{
          fontSize: 10,
          fontWeight: 600,
          color: plan.health_color,
          background: `color-mix(in srgb, ${plan.health_color} 12%, transparent)`,
          padding: "2px 7px",
          borderRadius: 100,
          whiteSpace: "nowrap",
        }}
      >
        {plan.health_label}
      </span>
      <div className="tabular hint" style={{ fontSize: 10, lineHeight: 1.3 }}>
        T1 +{plan.delta_t1_pct.toFixed(1)}% · S1 {plan.delta_s1_pct.toFixed(1)}%
      </div>
    </div>
  );
}


"use client";

import { useMemo, useState } from "react";

import { fmt } from "@/lib/finance/fmt";

import type { RawRealizedLot, RawTxn } from "@/app/(app)/_lib/reports-actions";
import type { RealValueRow } from "@/app/(app)/_lib/wealth-snapshots-actions";
import {
  BENCH_META,
  type BenchmarkCompareResult,
  type SymbolCompare,
} from "@/app/(app)/_lib/benchmark-compare-types";
import type { CategoryRow } from "@/app/(app)/ayarlar/actions";
import type { BeneficiaryLite } from "@/app/(app)/hesaplar/actions";

import { CashflowCard } from "@/app/(app)/_components/cashflow-card";

function isoToday(): string {
  return new Date().toISOString().slice(0, 10);
}

function isoStartOfYear(): string {
  return `${new Date().getFullYear()}-01-01`;
}

function isoMonthsAgo(months: number): string {
  const d = new Date();
  d.setMonth(d.getMonth() - months);
  d.setDate(1);
  return d.toISOString().slice(0, 10);
}

function isoStartOfMonth(): string {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-01`;
}

type RangeKey = "this-month" | "ytd" | "3m" | "6m" | "12m" | "custom";

interface RangePreset {
  key: RangeKey;
  label: string;
  resolve: () => { from: string; to: string };
}

const PRESETS: RangePreset[] = [
  { key: "this-month", label: "Aktif Ay",  resolve: () => ({ from: isoStartOfMonth(),    to: isoToday() }) },
  { key: "ytd",        label: "YTD",       resolve: () => ({ from: isoStartOfYear(),     to: isoToday() }) },
  { key: "3m",         label: "Son 3 Ay",  resolve: () => ({ from: isoMonthsAgo(2),      to: isoToday() }) },
  { key: "6m",         label: "Son 6 Ay",  resolve: () => ({ from: isoMonthsAgo(5),      to: isoToday() }) },
  { key: "12m",        label: "Son 12 Ay", resolve: () => ({ from: isoMonthsAgo(11),     to: isoToday() }) },
];

function monthIter(from: string, to: string): string[] {
  const out: string[] = [];
  const [fy, fm] = from.slice(0, 7).split("-").map(Number);
  const [ty, tm] = to.slice(0, 7).split("-").map(Number);
  let y = fy;
  let m = fm;
  while (y < ty || (y === ty && m <= tm)) {
    out.push(`${y}-${String(m).padStart(2, "0")}`);
    m++;
    if (m > 12) { m = 1; y++; }
  }
  return out;
}

interface MonthBucket {
  period: string;
  inflow: number;
  outflow: number;
}

interface Props {
  txns: RawTxn[];
  realized: RawRealizedLot[];
  categories: CategoryRow[];
  beneficiaries: BeneficiaryLite[];
  realValue: RealValueRow[];
  benchmark: BenchmarkCompareResult | null;
}

type TabKey = "cashflow" | "performance" | "realvalue" | "benchmark";

export function RaporlarClient({ txns, realized, categories, beneficiaries, realValue, benchmark }: Props) {
  const [tab, setTab] = useState<TabKey>("cashflow");
  const [rangeKey, setRangeKey] = useState<RangeKey>("ytd");
  const [customFrom, setCustomFrom] = useState<string>(isoStartOfYear());
  const [customTo, setCustomTo] = useState<string>(isoToday());

  const { from, to, label } = useMemo(() => {
    if (rangeKey === "custom") {
      return {
        from: customFrom,
        to: customTo,
        label: `${customFrom} → ${customTo}`,
      };
    }
    const preset = PRESETS.find((p) => p.key === rangeKey) ?? PRESETS[1];
    const r = preset.resolve();
    return { from: r.from, to: r.to, label: preset.label };
  }, [rangeKey, customFrom, customTo]);

  const filtered = useMemo(
    () => txns.filter((t) => t.occurred_on >= from && t.occurred_on <= to),
    [txns, from, to],
  );

  const monthly: MonthBucket[] = useMemo(() => {
    const periods = monthIter(from, to);
    const map = new Map<string, MonthBucket>(
      periods.map((p) => [p, { period: p, inflow: 0, outflow: 0 }]),
    );
    for (const t of filtered) {
      const p = t.occurred_on.slice(0, 7);
      const b = map.get(p);
      if (!b) continue;
      if (t.direction === "inflow") b.inflow += Number(t.amount);
      else if (t.direction === "outflow") b.outflow += Number(t.amount);
    }
    return periods.map((p) => map.get(p)!);
  }, [filtered, from, to]);

  const totalInflow = monthly.reduce((s, b) => s + b.inflow, 0);
  const totalOutflow = monthly.reduce((s, b) => s + b.outflow, 0);

  // Kategori bazlı
  const catMap = Object.fromEntries(categories.map((c) => [c.id, c]));
  const aggregate = (direction: "inflow" | "outflow", keyOf: (t: RawTxn) => string | null) => {
    const m = new Map<string, number>();
    for (const t of filtered) {
      if (t.direction !== direction) continue;
      const k = keyOf(t) ?? "__none__";
      m.set(k, (m.get(k) ?? 0) + Number(t.amount));
    }
    return m;
  };
  const buildCatRows = (
    map: Map<string, number>,
  ): Array<{ id: string; name: string; icon: string; value: number }> =>
    Array.from(map.entries())
      .map(([id, value]) => ({
        id,
        name: id === "__none__" ? "(Kategorisiz)" : (catMap[id]?.name ?? "?"),
        icon: id === "__none__" ? "" : (catMap[id]?.icon ?? ""),
        value,
      }))
      .filter((r) => r.value > 0)
      .sort((a, b) => b.value - a.value);

  const expCatRows = buildCatRows(aggregate("outflow", (t) => t.category_id));
  const incCatRows = buildCatRows(aggregate("inflow", (t) => t.category_id));

  // Kişi bazlı gider
  const benMap = Object.fromEntries(beneficiaries.map((b) => [b.id, b]));
  const byBenOut = aggregate("outflow", (t) => t.beneficiary_id);
  const benRows = Array.from(byBenOut.entries())
    .map(([id, value]) => ({
      id,
      name: id === "__none__" ? "(Atanmamış)" : (benMap[id]?.name ?? "?"),
      color: id === "__none__" ? "#7d8699" : (benMap[id]?.color ?? "#7d8699"),
      value,
    }))
    .filter((r) => r.value > 0)
    .sort((a, b) => b.value - a.value);

  // En büyük 10 gider (seçili dönem) — taksitli ("(N/M)") işlemleri gruplar
  interface ExpenseAgg {
    earliestDate: string;
    amount: number;
    count: number;            // kaç işlem (taksit sayısı)
    expectedTotal?: number;   // beklenen toplam taksit (örn. 3 in (1/3))
    merchant: string;         // sade base merchant
    categoryId: string | null;
    benIds: Set<string | null>;
  }

  /** "MAPFRE(1/3) İSTANBUL" → { base: "MAPFRE İSTANBUL", isInstallment: true, total: 3 } */
  const extractInstallment = (merchant: string): { base: string; isInstallment: boolean; total?: number } => {
    const m = merchant.match(/\((\d+)\/(\d+)\)/);
    if (!m) return { base: merchant, isInstallment: false };
    const total = parseInt(m[2], 10);
    const base = merchant.replace(/\s*\(\d+\/\d+\)\s*/g, " ").replace(/\s+/g, " ").trim();
    return { base, isInstallment: true, total };
  };

  const installmentMap = new Map<string, ExpenseAgg>();
  const singles: ExpenseAgg[] = [];

  // Aynı merchant+kategori farklı tarih/tutarda birden fazla taksitli alıma sahip
  // olabilir (örn. 2 ayrı vergi tahakkuku, ikisi de 3-taksit). Grup anahtarına
  // expectedTotal + (yaklaşık) amount eklenerek farklı alımlar ayrılır.
  const amountBucket = (n: number): number => Math.round(n / 100) * 100;

  for (const t of filtered) {
    if (t.direction !== "outflow") continue;
    const rawMerch = t.merchant_raw || t.description || "—";
    const { base, isInstallment, total } = extractInstallment(rawMerch);
    const amount = Number(t.amount);
    if (isInstallment) {
      const key = `${base.toUpperCase()}|${t.category_id ?? ""}|tot:${total ?? "?"}|amt:${amountBucket(amount)}`;
      const existing = installmentMap.get(key);
      if (existing) {
        existing.amount += amount;
        existing.count += 1;
        existing.benIds.add(t.beneficiary_id);
        if (t.occurred_on < existing.earliestDate) existing.earliestDate = t.occurred_on;
      } else {
        installmentMap.set(key, {
          earliestDate: t.occurred_on,
          amount,
          count: 1,
          expectedTotal: total,
          merchant: base,
          categoryId: t.category_id,
          benIds: new Set([t.beneficiary_id]),
        });
      }
    } else {
      singles.push({
        earliestDate: t.occurred_on,
        amount,
        count: 1,
        merchant: rawMerch,
        categoryId: t.category_id,
        benIds: new Set([t.beneficiary_id]),
      });
    }
  }

  const topExpenses = [...installmentMap.values(), ...singles]
    .sort((a, b) => b.amount - a.amount)
    .slice(0, 10)
    .map((agg) => {
      const cat = agg.categoryId ? catMap[agg.categoryId] : null;
      const benList = Array.from(agg.benIds);
      let benName: string;
      let benColor: string;
      if (benList.length === 1) {
        const id = benList[0];
        const b = id ? benMap[id] : null;
        benName = b?.name ?? "(atanmamış)";
        benColor = b?.color ?? "#7d8699";
      } else {
        benName = `Çeşitli (${benList.length})`;
        benColor = "#7d8699";
      }
      // Etiket: tüm taksitler toplanmışsa "N/N taksit", eksikse "N taksit"
      let installmentLabel = "";
      if (agg.count > 1) {
        if (agg.expectedTotal && agg.count === agg.expectedTotal) {
          installmentLabel = ` · ${agg.count}/${agg.expectedTotal} taksit`;
        } else if (agg.expectedTotal) {
          installmentLabel = ` · ${agg.count}/${agg.expectedTotal} taksit (eksik)`;
        } else {
          installmentLabel = ` · ${agg.count} taksit`;
        }
      }
      return {
        date: agg.earliestDate,
        merchant: agg.merchant + installmentLabel,
        categoryName: cat?.name ?? "(kategorisiz)",
        categoryIcon: cat?.icon ?? "",
        benName,
        benColor,
        amount: agg.amount,
      };
    });

  const top10Total = topExpenses.reduce((s, e) => s + e.amount, 0);
  const top10Pct = totalOutflow > 0 ? (top10Total / totalOutflow) * 100 : 0;

  // ---------- Yatırım Performansı hesapları ----------
  const filteredRealized = useMemo(
    () =>
      realized.filter((r) => {
        const d = r.closed_at.slice(0, 10);
        return d >= from && d <= to;
      }),
    [realized, from, to],
  );

  const realizedTotals = useMemo(() => {
    let cost = 0;
    let proceeds = 0;
    let pnl = 0;
    let net = 0;
    let wht = 0;
    let holdingSum = 0;
    let holdingCount = 0;
    const closedSellIds = new Set<string>();
    for (const l of filteredRealized) {
      cost += l.cost_basis_try;
      proceeds += l.proceeds_try;
      pnl += l.realized_pnl_try;
      net += l.net_realized_pnl_try;
      wht += l.withholding_try;
      if (l.holding_period_days != null) {
        holdingSum += l.holding_period_days;
        holdingCount += 1;
      }
      closedSellIds.add(l.sell_trade_id);
    }
    const gainers = filteredRealized.filter((l) => l.realized_pnl_try > 0);
    const losers = filteredRealized.filter((l) => l.realized_pnl_try < 0);
    return {
      cost,
      proceeds,
      pnl,
      net,
      wht,
      avgHoldingDays: holdingCount > 0 ? holdingSum / holdingCount : null,
      closedSellCount: closedSellIds.size,
      lotCount: filteredRealized.length,
      winCount: gainers.length,
      lossCount: losers.length,
      winPnl: gainers.reduce((s, l) => s + l.realized_pnl_try, 0),
      lossPnl: losers.reduce((s, l) => s + l.realized_pnl_try, 0),
    };
  }, [filteredRealized]);

  const bySymbol = useMemo(() => {
    const m = new Map<string, {
      symbol: string;
      name: string;
      asset_class: string;
      qty: number;
      cost: number;
      proceeds: number;
      pnl: number;
      net: number;
      wht: number;
      count: number;
    }>();
    for (const l of filteredRealized) {
      const cur = m.get(l.asset_id) ?? {
        symbol: l.asset_symbol,
        name: l.asset_name,
        asset_class: l.asset_class,
        qty: 0,
        cost: 0,
        proceeds: 0,
        pnl: 0,
        net: 0,
        wht: 0,
        count: 0,
      };
      cur.qty += l.quantity;
      cur.cost += l.cost_basis_try;
      cur.proceeds += l.proceeds_try;
      cur.pnl += l.realized_pnl_try;
      cur.net += l.net_realized_pnl_try;
      cur.wht += l.withholding_try;
      cur.count += 1;
      m.set(l.asset_id, cur);
    }
    return Array.from(m.values()).sort((a, b) => b.pnl - a.pnl);
  }, [filteredRealized]);

  const byPortfolio = useMemo(() => {
    const m = new Map<string, { name: string; pnl: number; net: number; count: number }>();
    for (const l of filteredRealized) {
      const cur = m.get(l.portfolio_id) ?? { name: l.portfolio_name, pnl: 0, net: 0, count: 0 };
      cur.pnl += l.realized_pnl_try;
      cur.net += l.net_realized_pnl_try;
      cur.count += 1;
      m.set(l.portfolio_id, cur);
    }
    return Array.from(m.values()).sort((a, b) => b.pnl - a.pnl);
  }, [filteredRealized]);

  const byBeneficiary = useMemo(() => {
    const benMap2 = Object.fromEntries(beneficiaries.map((b) => [b.id, b]));
    const m = new Map<string, { name: string; color: string; pnl: number; net: number; count: number }>();
    for (const l of filteredRealized) {
      const bid = l.beneficiary_id ?? "__none__";
      const bref = l.beneficiary_id ? benMap2[l.beneficiary_id] : null;
      const cur = m.get(bid) ?? {
        name: bid === "__none__" ? "(Atanmamış)" : bref?.name ?? "?",
        color: bref?.color ?? "#7d8699",
        pnl: 0,
        net: 0,
        count: 0,
      };
      cur.pnl += l.realized_pnl_try;
      cur.net += l.net_realized_pnl_try;
      cur.count += 1;
      m.set(bid, cur);
    }
    return Array.from(m.values()).sort((a, b) => b.pnl - a.pnl);
  }, [filteredRealized, beneficiaries]);

  const topLots = useMemo(
    () => [...filteredRealized].sort((a, b) => b.realized_pnl_try - a.realized_pnl_try).slice(0, 5),
    [filteredRealized],
  );
  const bottomLots = useMemo(
    () => [...filteredRealized].sort((a, b) => a.realized_pnl_try - b.realized_pnl_try).slice(0, 5),
    [filteredRealized],
  );

  return (
    <div>
      <div className="page-head">
        <div>
          <div className="page-title">Raporlar</div>
          <div className="page-sub">
            {label} ·{" "}
            {tab === "cashflow"
              ? `${filtered.length} nakit işlem`
              : `${filteredRealized.length} kapanan lot`}
          </div>
        </div>
        {tab !== "realvalue" && tab !== "benchmark" && (
          <div className="page-actions" style={{ flexWrap: "wrap", gap: 6 }}>
            {PRESETS.map((p) => (
              <button
                key={p.key}
                className={`btn btn-sm ${rangeKey === p.key ? "btn-prim" : ""}`}
                onClick={() => setRangeKey(p.key)}
              >
                {p.label}
              </button>
            ))}
            <button
              className={`btn btn-sm ${rangeKey === "custom" ? "btn-prim" : ""}`}
              onClick={() => setRangeKey("custom")}
            >
              Özel
            </button>
          </div>
        )}
      </div>

      <div style={{ display: "flex", gap: 4, marginBottom: 14, borderBottom: "1px solid var(--border-soft)", flexWrap: "wrap" }}>
        <TabBtn active={tab === "cashflow"} onClick={() => setTab("cashflow")}>
          Nakit Akış
        </TabBtn>
        <TabBtn active={tab === "performance"} onClick={() => setTab("performance")}>
          Yatırım Performansı
        </TabBtn>
        {realValue.length > 0 && (
          <TabBtn active={tab === "realvalue"} onClick={() => setTab("realvalue")}>
            Reel Değer
          </TabBtn>
        )}
        {benchmark && (
          <TabBtn active={tab === "benchmark"} onClick={() => setTab("benchmark")}>
            Benchmark
          </TabBtn>
        )}
      </div>

      {rangeKey === "custom" && tab !== "realvalue" && tab !== "benchmark" && (
        <div className="card card-pad" style={{ marginBottom: 14, display: "flex", gap: 10, alignItems: "center", flexWrap: "wrap" }}>
          <span style={{ fontSize: 12, color: "var(--muted)" }}>Başlangıç</span>
          <input
            type="date"
            value={customFrom}
            onChange={(e) => setCustomFrom(e.target.value)}
            style={inp}
          />
          <span style={{ fontSize: 12, color: "var(--muted)" }}>Bitiş</span>
          <input
            type="date"
            value={customTo}
            onChange={(e) => setCustomTo(e.target.value)}
            style={inp}
          />
        </div>
      )}

      {tab === "benchmark" ? (
        benchmark ? <BenchmarkTab data={benchmark} /> : null
      ) : tab === "realvalue" ? (
        <RealValueTab rows={realValue} />
      ) : tab === "performance" ? (
        <PerformanceTab
          filteredRealized={filteredRealized}
          totals={realizedTotals}
          bySymbol={bySymbol}
          byPortfolio={byPortfolio}
          byBeneficiary={byBeneficiary}
          topLots={topLots}
          bottomLots={bottomLots}
          label={label}
        />
      ) : (
        <>
      {/* Nakit akış kartı: chart + 4 KPI altta */}
      <div style={{ marginBottom: 18 }}>
        <CashflowCard months={monthly} badgeText={label} />
      </div>

      {/* Kategori bazlı */}
      <div className="grid-base grid-2" style={{ gap: 16, marginBottom: 18, alignItems: "start" }}>
        <CategoryCard
          title="Gider Kategorileri"
          rows={expCatRows}
          color="var(--negative)"
          total={totalOutflow}
          label={label}
        />
        <CategoryCard
          title="Gelir Kategorileri"
          rows={incCatRows}
          color="var(--positive)"
          total={totalInflow}
          label={label}
        />
      </div>

      {topExpenses.length > 0 && (
        <div className="card" style={{ marginBottom: 18 }}>
          <div className="card-head">
            <div className="card-title">En Büyük 10 Gider</div>
            <div className="card-sub">
              {label} · top 10 toplamı {fmt.tr(top10Total, 0)} ₺ ({top10Pct.toFixed(1)}% / toplam gider)
            </div>
          </div>
          <table className="dg">
            <thead>
              <tr>
                <th style={{ width: 92 }}>Tarih</th>
                <th>İşlem</th>
                <th style={{ width: 160 }}>Kategori</th>
                <th style={{ width: 140 }}>Kişi</th>
                <th className="num" style={{ width: 130 }}>Tutar</th>
              </tr>
            </thead>
            <tbody>
              {topExpenses.map((e, i) => (
                <tr key={`${e.date}-${i}`}>
                  <td className="tabular hint">{e.date}</td>
                  <td style={{ fontSize: 13 }}>{e.merchant}</td>
                  <td style={{ fontSize: 13 }}>
                    {e.categoryIcon && (
                      <span style={{ marginRight: 6 }}>{e.categoryIcon}</span>
                    )}
                    {e.categoryName}
                  </td>
                  <td style={{ fontSize: 13 }}>
                    <span style={{ display: "inline-flex", alignItems: "center", gap: 6 }}>
                      <span style={{
                        width: 8, height: 8, borderRadius: 50, background: e.benColor,
                      }} />
                      {e.benName}
                    </span>
                  </td>
                  <td
                    className="num tabular"
                    style={{ fontWeight: 600, color: "var(--negative)" }}
                  >
                    -{fmt.tr(e.amount, 0)} ₺
                  </td>
                </tr>
              ))}
            </tbody>
            <tfoot>
              <tr style={{ borderTop: "2px solid var(--border)" }}>
                <td colSpan={3} style={{ fontWeight: 600, padding: "10px 12px" }}>
                  İlk 10 toplamı
                </td>
                <td className="num tabular hint" style={{ fontSize: 12 }}>
                  toplam giderin %{top10Pct.toFixed(1)}
                </td>
                <td
                  className="num tabular"
                  style={{ fontWeight: 700, color: "var(--negative)" }}
                >
                  -{fmt.tr(top10Total, 0)} ₺
                </td>
              </tr>
            </tfoot>
          </table>
        </div>
      )}

      {benRows.length > 0 && (
        <div className="card">
          <div className="card-head">
            <div className="card-title">Kişi Bazlı Gider</div>
            <div className="card-sub">{label}</div>
          </div>
          <table className="dg">
            <thead>
              <tr>
                <th>Kişi</th>
                <th className="num">Toplam Gider</th>
                <th className="num" style={{ width: 80 }}>Pay</th>
                <th style={{ width: "40%" }}>Görsel</th>
              </tr>
            </thead>
            <tbody>
              {benRows.map((r) => {
                const pct = totalOutflow > 0 ? (r.value / totalOutflow) * 100 : 0;
                return (
                  <tr key={r.id}>
                    <td>
                      <span style={{ display: "inline-flex", alignItems: "center", gap: 8 }}>
                        <span style={{ width: 8, height: 8, borderRadius: 50, background: r.color }} />
                        {r.name}
                      </span>
                    </td>
                    <td className="num tabular" style={{ fontWeight: 600 }}>
                      {fmt.tr(r.value, 0)} ₺
                    </td>
                    <td className="num tabular hint">%{pct.toFixed(1)}</td>
                    <td>
                      <div
                        style={{
                          height: 8,
                          background: r.color,
                          borderRadius: 4,
                          width: `${Math.max(2, pct)}%`,
                          opacity: 0.7,
                        }}
                      />
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
        </>
      )}
    </div>
  );
}

function TabBtn({
  active,
  onClick,
  children,
}: {
  active: boolean;
  onClick: () => void;
  children: React.ReactNode;
}) {
  return (
    <button
      onClick={onClick}
      style={{
        background: "transparent",
        border: "none",
        borderBottom: `2px solid ${active ? "var(--primary, #4a86ff)" : "transparent"}`,
        color: active ? "var(--fg)" : "var(--muted)",
        padding: "10px 14px",
        fontSize: 13,
        fontWeight: active ? 600 : 500,
        cursor: "pointer",
        marginBottom: -1,
      }}
    >
      {children}
    </button>
  );
}

interface PerformanceTotals {
  cost: number;
  proceeds: number;
  pnl: number;
  net: number;
  wht: number;
  avgHoldingDays: number | null;
  closedSellCount: number;
  lotCount: number;
  winCount: number;
  lossCount: number;
  winPnl: number;
  lossPnl: number;
}

interface SymbolAgg {
  symbol: string;
  name: string;
  asset_class: string;
  qty: number;
  cost: number;
  proceeds: number;
  pnl: number;
  net: number;
  wht: number;
  count: number;
}

interface PortfolioAgg {
  name: string;
  pnl: number;
  net: number;
  count: number;
}

interface BeneficiaryAgg {
  name: string;
  color: string;
  pnl: number;
  net: number;
  count: number;
}

function PerformanceTab({
  filteredRealized,
  totals,
  bySymbol,
  byPortfolio,
  byBeneficiary,
  topLots,
  bottomLots,
  label,
}: {
  filteredRealized: RawRealizedLot[];
  totals: PerformanceTotals;
  bySymbol: SymbolAgg[];
  byPortfolio: PortfolioAgg[];
  byBeneficiary: BeneficiaryAgg[];
  topLots: RawRealizedLot[];
  bottomLots: RawRealizedLot[];
  label: string;
}) {
  if (filteredRealized.length === 0) {
    return (
      <div className="empty">
        <div className="title">Bu dönemde kapanan pozisyon yok</div>
        <div style={{ marginTop: 8, lineHeight: 1.6 }}>
          Sadece satışlar (kapanan lot&apos;lar) burada görünür. Hâlâ elindeki
          pozisyonların anlık K/Z&apos;sini <b>Portföy</b> sayfasından görebilirsin.
        </div>
      </div>
    );
  }
  const pnlPct = totals.cost > 0 ? (totals.pnl / totals.cost) * 100 : null;
  const netPct = totals.cost > 0 ? (totals.net / totals.cost) * 100 : null;

  return (
    <div>
      <div className="grid-base grid-4" style={{ marginBottom: 18, gap: 16 }}>
        <KpiCard
          label="Realized K/Z"
          value={fmt.try(totals.pnl, 0)}
          sub={pnlPct != null ? fmt.pct(pnlPct, 2) + " maliyete göre" : "—"}
          color={totals.pnl >= 0 ? "var(--positive)" : "var(--negative)"}
        />
        <KpiCard
          label="Net K/Z (stopaj sonrası)"
          value={fmt.try(totals.net, 0)}
          sub={netPct != null ? fmt.pct(netPct, 2) : "—"}
          color={totals.net >= 0 ? "var(--positive)" : "var(--negative)"}
        />
        <KpiCard
          label="Kapatılan işlem"
          value={String(totals.closedSellCount)}
          sub={`${totals.lotCount} lot · ${totals.winCount} kâr / ${totals.lossCount} zarar`}
        />
        <KpiCard
          label="Ort. tutma süresi"
          value={
            totals.avgHoldingDays != null
              ? fmt.tr(totals.avgHoldingDays, 0) + " gün"
              : "—"
          }
          sub={
            totals.wht > 0
              ? `Stopaj: ${fmt.tr(totals.wht, 0)} ₺`
              : "Stopaj hesaplanmadı"
          }
        />
      </div>

      <div className="card" style={{ marginBottom: 18 }}>
        <div className="card-head">
          <div className="card-title">Sembol Bazlı Realized K/Z</div>
          <div className="card-sub">{bySymbol.length} sembol · {label}</div>
        </div>
        <table className="dg">
          <thead>
            <tr>
              <th>Sembol</th>
              <th className="num">Kapatılan adet</th>
              <th className="num">Maliyet</th>
              <th className="num">Satış hasıla</th>
              <th className="num">K/Z</th>
              <th className="num">K/Z %</th>
              <th className="num" style={{ width: 60 }}>Lot</th>
            </tr>
          </thead>
          <tbody>
            {bySymbol.map((r) => {
              const pct = r.cost > 0 ? (r.pnl / r.cost) * 100 : null;
              const color = r.pnl >= 0 ? "var(--positive)" : "var(--negative)";
              return (
                <tr key={r.symbol}>
                  <td>
                    <div style={{ fontSize: 13, fontWeight: 600 }}>{r.symbol}</div>
                    <div className="hint" style={{ fontSize: 11 }}>{r.name}</div>
                  </td>
                  <td className="num tabular">
                    {fmt.tr(r.qty, r.asset_class === "crypto" ? 4 : r.asset_class === "fund" ? 4 : 0)}
                  </td>
                  <td className="num tabular">{fmt.tr(r.cost, 0)} ₺</td>
                  <td className="num tabular">{fmt.tr(r.proceeds, 0)} ₺</td>
                  <td className="num tabular" style={{ fontWeight: 600, color }}>
                    {r.pnl >= 0 ? "+" : ""}{fmt.tr(r.pnl, 0)} ₺
                  </td>
                  <td className="num tabular" style={{ color }}>
                    {pct != null ? fmt.pct(pct, 1) : "—"}
                  </td>
                  <td className="num tabular hint">{r.count}</td>
                </tr>
              );
            })}
          </tbody>
          <tfoot>
            <tr style={{ borderTop: "2px solid var(--border)" }}>
              <td colSpan={2} style={{ fontWeight: 600, padding: "10px 12px" }}>
                Toplam ({label})
              </td>
              <td className="num tabular" style={{ fontWeight: 600 }}>{fmt.tr(totals.cost, 0)} ₺</td>
              <td className="num tabular" style={{ fontWeight: 600 }}>{fmt.tr(totals.proceeds, 0)} ₺</td>
              <td
                className="num tabular"
                style={{ fontWeight: 700, color: totals.pnl >= 0 ? "var(--positive)" : "var(--negative)" }}
              >
                {totals.pnl >= 0 ? "+" : ""}{fmt.tr(totals.pnl, 0)} ₺
              </td>
              <td
                className="num tabular"
                style={{ color: totals.pnl >= 0 ? "var(--positive)" : "var(--negative)" }}
              >
                {pnlPct != null ? fmt.pct(pnlPct, 1) : "—"}
              </td>
              <td className="num tabular hint">{totals.lotCount}</td>
            </tr>
          </tfoot>
        </table>
      </div>

      <div className="grid-base grid-2" style={{ gap: 16, marginBottom: 18, alignItems: "start" }}>
        <div className="card">
          <div className="card-head">
            <div className="card-title">Portföy Bazlı Realized K/Z</div>
            <div className="card-sub">{byPortfolio.length} portföy · {label}</div>
          </div>
          <table className="dg">
            <thead>
              <tr>
                <th>Portföy</th>
                <th className="num">K/Z</th>
                <th className="num">Net K/Z</th>
                <th className="num" style={{ width: 60 }}>Lot</th>
              </tr>
            </thead>
            <tbody>
              {byPortfolio.map((r) => {
                const color = r.pnl >= 0 ? "var(--positive)" : "var(--negative)";
                return (
                  <tr key={r.name}>
                    <td style={{ fontSize: 13 }}>{r.name}</td>
                    <td className="num tabular" style={{ fontWeight: 600, color }}>
                      {r.pnl >= 0 ? "+" : ""}{fmt.tr(r.pnl, 0)} ₺
                    </td>
                    <td className="num tabular" style={{ color }}>
                      {r.net >= 0 ? "+" : ""}{fmt.tr(r.net, 0)} ₺
                    </td>
                    <td className="num tabular hint">{r.count}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>

        <div className="card">
          <div className="card-head">
            <div className="card-title">Kişi Bazlı Realized K/Z</div>
            <div className="card-sub">{byBeneficiary.length} kişi · {label}</div>
          </div>
          <table className="dg">
            <thead>
              <tr>
                <th>Kişi</th>
                <th className="num">K/Z</th>
                <th className="num">Net K/Z</th>
                <th className="num" style={{ width: 60 }}>Lot</th>
              </tr>
            </thead>
            <tbody>
              {byBeneficiary.map((r) => {
                const color = r.pnl >= 0 ? "var(--positive)" : "var(--negative)";
                return (
                  <tr key={r.name}>
                    <td>
                      <span style={{ display: "inline-flex", alignItems: "center", gap: 8 }}>
                        <span style={{ width: 8, height: 8, borderRadius: 50, background: r.color }} />
                        <span style={{ fontSize: 13 }}>{r.name}</span>
                      </span>
                    </td>
                    <td className="num tabular" style={{ fontWeight: 600, color }}>
                      {r.pnl >= 0 ? "+" : ""}{fmt.tr(r.pnl, 0)} ₺
                    </td>
                    <td className="num tabular" style={{ color }}>
                      {r.net >= 0 ? "+" : ""}{fmt.tr(r.net, 0)} ₺
                    </td>
                    <td className="num tabular hint">{r.count}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </div>

      <div className="grid-base grid-2" style={{ gap: 16, alignItems: "start" }}>
        <LotListCard
          title="En İyi 5 Kapanan Lot"
          lots={topLots}
          empty="Bu dönemde kârla kapanan lot yok."
          positive
        />
        <LotListCard
          title="En Kötü 5 Kapanan Lot"
          lots={bottomLots}
          empty="Bu dönemde zararla kapanan lot yok."
          positive={false}
        />
      </div>
    </div>
  );
}

// ============================ Benchmark ==============================

function signedTry(n: number): string {
  return (n >= 0 ? "+" : "") + fmt.tr(n, 0) + " ₺";
}

/** "hisse − benchmark" avantajı (pozitif = hisse kazandı). */
function edgeOf(actualProfit: number, benchProfit: number): number {
  return actualProfit - benchProfit;
}

function BenchmarkTab({ data }: { data: BenchmarkCompareResult }) {
  const { symbols, total, asOf, tradeCount } = data;
  const codes = total.benches.map((b) => b.code);

  const actualRetPct = total.buyTry > 0 ? (total.actualProfit / total.buyTry) * 100 : null;

  return (
    <div>
      {/* Özet hero */}
      <div className="grid-base grid-2" style={{ gap: 16, marginBottom: 18, alignItems: "stretch" }}>
        <div className="card" style={{ padding: 18 }}>
          <div className="hint" style={{ fontSize: 11, marginBottom: 6, textTransform: "uppercase", letterSpacing: "0.06em" }}>
            Yatırımının Gerçek K/Z&apos;si
          </div>
          <div
            className="tabular"
            style={{ fontSize: 26, fontWeight: 800, color: total.actualProfit >= 0 ? "var(--positive)" : "var(--negative)" }}
          >
            {signedTry(total.actualProfit)}
          </div>
          <div className="hint" style={{ fontSize: 12, marginTop: 8, lineHeight: 1.6 }}>
            Net yatırım {fmt.tr(total.netInvested, 0)} ₺ · güncel değer {fmt.tr(total.currentMv, 0)} ₺
            {actualRetPct != null && <> · {fmt.pct(actualRetPct, 1)} (yatırılana göre)</>}
          </div>
        </div>

        <div className="card" style={{ padding: 18 }}>
          <div className="hint" style={{ fontSize: 11, marginBottom: 10, textTransform: "uppercase", letterSpacing: "0.06em" }}>
            Aynı parayı şuna koysaydın
          </div>
          <div style={{ display: "grid", gap: 8 }}>
            {total.benches.map((b) => {
              const edge = edgeOf(total.actualProfit, b.profit);
              const edgeColor = edge >= 0 ? "var(--positive)" : "var(--negative)";
              return (
                <div key={b.code} style={{ display: "flex", alignItems: "center", gap: 10, fontSize: 13 }}>
                  <span style={{ width: 92, fontWeight: 600 }}>{BENCH_META[b.code].label}</span>
                  <span className="tabular" style={{ width: 120, textAlign: "right", color: b.profit >= 0 ? "var(--positive)" : "var(--negative)" }}>
                    {signedTry(b.profit)}
                  </span>
                  <span
                    className="tabular"
                    style={{ marginLeft: "auto", fontWeight: 700, color: edgeColor }}
                    title="Hisse yatırımın bu benchmark'a göre farkı"
                  >
                    {edge >= 0 ? "hisse " : "benchmark "}
                    {edge >= 0 ? "+" : ""}
                    {fmt.tr(Math.abs(edge), 0)} ₺
                  </span>
                </div>
              );
            })}
          </div>
        </div>
      </div>

      {/* Sembol bazlı karşılaştırma */}
      <div className="card" style={{ marginBottom: 18 }}>
        <div className="card-head">
          <div className="card-title">Sembol Bazlı Benchmark Karşılaştırması</div>
          <div className="card-sub">{symbols.length} sembol · {tradeCount} işlem</div>
        </div>
        <table className="dg">
          <thead>
            <tr>
              <th>Sembol</th>
              <th className="num">Net Yatırım</th>
              <th className="num">Güncel Değer</th>
              <th className="num">K/Z</th>
              {codes.map((c) => (
                <th key={c} className="num" title={`Hisse − ${BENCH_META[c].label} (pozitif = hisse kazandı)`}>
                  vs {BENCH_META[c].label}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {symbols.map((s: SymbolCompare) => {
              const pnlColor = s.actualProfit >= 0 ? "var(--positive)" : "var(--negative)";
              return (
                <tr key={s.asset_id}>
                  <td>
                    <div style={{ fontSize: 13, fontWeight: 600 }}>
                      {s.symbol}
                      {!s.priced && <span className="hint" title="Güncel fiyat bulunamadı — maliyet bazı kullanıldı"> ⚠</span>}
                    </div>
                    <div className="hint">{s.name}</div>
                  </td>
                  <td className="num tabular">{fmt.tr(s.netInvested, 0)} ₺</td>
                  <td className="num tabular">{fmt.tr(s.currentMv, 0)} ₺</td>
                  <td className="num tabular" style={{ fontWeight: 600, color: pnlColor }}>{signedTry(s.actualProfit)}</td>
                  {s.benches.map((b) => {
                    const edge = edgeOf(s.actualProfit, b.profit);
                    const color = edge >= 0 ? "var(--positive)" : "var(--negative)";
                    return (
                      <td key={b.code} className="num tabular" style={{ color }}>
                        {signedTry(edge)}
                      </td>
                    );
                  })}
                </tr>
              );
            })}
          </tbody>
          <tfoot>
            <tr style={{ borderTop: "2px solid var(--border)" }}>
              <td style={{ fontWeight: 700 }}>Toplam</td>
              <td className="num tabular" style={{ fontWeight: 700 }}>{fmt.tr(total.netInvested, 0)} ₺</td>
              <td className="num tabular" style={{ fontWeight: 700 }}>{fmt.tr(total.currentMv, 0)} ₺</td>
              <td className="num tabular" style={{ fontWeight: 700, color: total.actualProfit >= 0 ? "var(--positive)" : "var(--negative)" }}>
                {signedTry(total.actualProfit)}
              </td>
              {total.benches.map((b) => {
                const edge = edgeOf(total.actualProfit, b.profit);
                const color = edge >= 0 ? "var(--positive)" : "var(--negative)";
                return (
                  <td key={b.code} className="num tabular" style={{ fontWeight: 700, color }}>
                    {signedTry(edge)}
                  </td>
                );
              })}
            </tr>
          </tfoot>
        </table>
      </div>

      <div
        style={{
          padding: "12px 16px",
          fontSize: 11,
          color: "var(--muted)",
          lineHeight: 1.7,
          background: "var(--surface-2)",
          borderRadius: 8,
        }}
      >
        <b>Nasıl hesaplanır.</b> Her alışta harcadığın TL&apos;yi o günkü benchmark fiyatına (altın/USD/EUR/BIST)
        bölerek &quot;o gün bunu almış olsaydın&quot; senaryosunu kurar; her satışta çıkan TL&apos;yi de aynı gün
        fiyatından düşer. Kalan benchmark pozisyonu bugünün fiyatıyla değerlenip senin gerçek sonucunla
        karşılaştırılır. <b>vs</b> sütunu = hisse K/Z − benchmark K/Z; pozitif (yeşil) ise hisse o benchmark&apos;ı
        geçmiş demektir.
        <br />
        <br />
        Güncel hisse fiyatı Yahoo Finance, fon NAV&apos;ı TEFAS. Benchmark fiyatları {asOf} tarihine kadar günlük.
        Fiyatı çekilemeyen sembollerde (⚠) maliyet bazı kullanılır.
      </div>
    </div>
  );
}

// ============================ Reel Değer =============================

type RvUnitKey = "try" | "realtry" | "usd" | "eur" | "gold";

interface RvUnit {
  key: RvUnitKey;
  label: string;
  fmt: (v: number) => string;
  /** Satırı bu birime çevir; veri eksikse null. */
  value: (r: RealValueRow, cpiLatest: number | null) => number | null;
}

const RV_UNITS: RvUnit[] = [
  {
    key: "try",
    label: "Nominal ₺",
    fmt: (v) => fmt.tr(v, 0) + " ₺",
    value: (r) => r.total_try,
  },
  {
    key: "realtry",
    label: "Reel ₺ (enflasyon)",
    fmt: (v) => fmt.tr(v, 0) + " ₺",
    value: (r, cpiLatest) =>
      r.cpi_index && cpiLatest ? r.total_try * (cpiLatest / r.cpi_index) : null,
  },
  {
    key: "usd",
    label: "USD",
    fmt: (v) => "$" + fmt.tr(v, 0),
    value: (r) => (r.usd_try ? r.total_try / r.usd_try : null),
  },
  {
    key: "eur",
    label: "EUR",
    fmt: (v) => "€" + fmt.tr(v, 0),
    value: (r) => (r.eur_try ? r.total_try / r.eur_try : null),
  },
  {
    key: "gold",
    label: "Gram Altın",
    fmt: (v) => fmt.tr(v, 0) + " gr",
    value: (r) => (r.gram_gold ? r.total_try / r.gram_gold : null),
  },
];

function rvChange(
  rows: RealValueRow[],
  unit: RvUnit,
  cpiLatest: number | null,
): { first: number; last: number; pct: number | null } | null {
  const vals = rows
    .map((r) => unit.value(r, cpiLatest))
    .filter((v): v is number => v != null);
  if (vals.length < 1) return null;
  const first = vals[0];
  const last = vals[vals.length - 1];
  const pct = first !== 0 ? (last / first - 1) * 100 : null;
  return { first, last, pct };
}

function RealValueTab({ rows }: { rows: RealValueRow[] }) {
  const [unitKey, setUnitKey] = useState<RvUnitKey>("gold");

  if (rows.length === 0) {
    return (
      <div className="empty">
        <div className="title">Servet snapshot&apos;ı yok</div>
        <div style={{ marginTop: 8, lineHeight: 1.6 }}>
          Reel değer, yıllık net servet kayıtlarını (Varlık → Servet snapshot)
          o yılın kur ve enflasyon verisiyle karşılaştırır. Önce en az bir
          yıllık servet kaydı gir.
        </div>
      </div>
    );
  }

  const cpiLatest = (() => {
    for (let i = rows.length - 1; i >= 0; i--) {
      if (rows[i].cpi_index != null) return rows[i].cpi_index;
    }
    return null;
  })();

  const selected = RV_UNITS.find((u) => u.key === unitKey) ?? RV_UNITS[0];
  const firstYear = rows[0].period;
  const lastYear = rows[rows.length - 1].period;

  // KPI kartları: ilk→son dönem toplam değişimi
  const kpiUnits = RV_UNITS.filter((u) =>
    ["try", "realtry", "usd", "gold"].includes(u.key),
  );

  // Seçili birim serisi (bar chart)
  const series = rows.map((r) => ({
    period: r.period,
    value: selected.value(r, cpiLatest),
  }));
  const maxVal = Math.max(...series.map((s) => s.value ?? 0), 1);

  // İçgörü metni: nominal vs altın vs reel TL
  const nominalCh = rvChange(rows, RV_UNITS[0], cpiLatest);
  const realCh = rvChange(rows, RV_UNITS[1], cpiLatest);
  const goldCh = rvChange(rows, RV_UNITS[4], cpiLatest);

  return (
    <div>
      <div className="grid-base grid-4" style={{ marginBottom: 18, gap: 16 }}>
        {kpiUnits.map((u) => {
          const ch = rvChange(rows, u, cpiLatest);
          if (!ch) {
            return <KpiCard key={u.key} label={u.label} value="—" sub="veri yok" />;
          }
          const color =
            ch.pct == null
              ? undefined
              : ch.pct >= 0
              ? "var(--positive)"
              : "var(--negative)";
          return (
            <KpiCard
              key={u.key}
              label={u.label}
              value={u.fmt(ch.last)}
              sub={
                ch.pct != null
                  ? `${fmt.pct(ch.pct, 1)} · ${firstYear}→${lastYear}`
                  : `${firstYear}→${lastYear}`
              }
              color={color}
            />
          );
        })}
      </div>

      {nominalCh && goldCh && realCh && (
        <div
          className="card card-pad"
          style={{ marginBottom: 18, lineHeight: 1.7, fontSize: 13 }}
        >
          <b>Özet.</b> {firstYear}–{lastYear} arasında net servetin nominal ₺
          bazında{" "}
          <b style={{ color: "var(--positive)" }}>
            {nominalCh.pct != null ? fmt.pct(nominalCh.pct, 0) : "—"}
          </b>{" "}
          arttı. Ama enflasyondan arındırılınca reel artış{" "}
          <b
            style={{
              color:
                (realCh.pct ?? 0) >= 0 ? "var(--positive)" : "var(--negative)",
            }}
          >
            {realCh.pct != null ? fmt.pct(realCh.pct, 0) : "—"}
          </b>
          , gram altın cinsinden ise{" "}
          <b
            style={{
              color:
                (goldCh.pct ?? 0) >= 0 ? "var(--positive)" : "var(--negative)",
            }}
          >
            {goldCh.pct != null ? fmt.pct(goldCh.pct, 0) : "—"}
          </b>
          {(goldCh.pct ?? 0) >= 0 ? " oldu" : " geriledi"}. Yani nominal büyümenin
          önemli kısmı TL&apos;nin değer kaybını telafi etmekten geliyor.
        </div>
      )}

      <div className="card" style={{ marginBottom: 18 }}>
        <div className="card-head" style={{ flexWrap: "wrap", gap: 10 }}>
          <div className="card-title">Yıllara Göre Reel Değer</div>
          <div style={{ marginLeft: "auto", display: "flex", gap: 6, flexWrap: "wrap" }}>
            {RV_UNITS.map((u) => (
              <button
                key={u.key}
                className={`btn btn-sm ${unitKey === u.key ? "btn-prim" : ""}`}
                onClick={() => setUnitKey(u.key)}
              >
                {u.label}
              </button>
            ))}
          </div>
        </div>

        {/* Seçili birim bar görünümü */}
        <div style={{ padding: "4px 16px 14px" }}>
          {series.map((s) => {
            const pct = s.value != null ? (s.value / maxVal) * 100 : 0;
            return (
              <div
                key={s.period}
                style={{ display: "flex", alignItems: "center", gap: 12, padding: "6px 0" }}
              >
                <div style={{ width: 48, fontSize: 12, color: "var(--muted)" }}>
                  {s.period}
                </div>
                <div style={{ flex: 1, background: "var(--surface-2)", borderRadius: 4, height: 22, position: "relative", overflow: "hidden" }}>
                  <div
                    style={{
                      position: "absolute",
                      inset: 0,
                      width: `${Math.max(2, pct)}%`,
                      background: "var(--accent)",
                      opacity: 0.35,
                      borderRadius: 4,
                    }}
                  />
                </div>
                <div className="tabular" style={{ width: 130, textAlign: "right", fontSize: 13, fontWeight: 600 }}>
                  {s.value != null ? selected.fmt(s.value) : "—"}
                </div>
              </div>
            );
          })}
        </div>
      </div>

      {/* Tüm birimler tablo */}
      <div className="card" style={{ marginBottom: 18 }}>
        <div className="card-head">
          <div className="card-title">Birim Karşılaştırma Tablosu</div>
          <div className="card-sub">{rows.length} dönem</div>
        </div>
        <table className="dg">
          <thead>
            <tr>
              <th>Yıl</th>
              {RV_UNITS.map((u) => (
                <th key={u.key} className="num">{u.label}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {rows.map((r) => (
              <tr key={r.period}>
                <td style={{ fontWeight: 600 }}>{r.period}</td>
                {RV_UNITS.map((u) => {
                  const v = u.value(r, cpiLatest);
                  return (
                    <td key={u.key} className="num tabular">
                      {v != null ? u.fmt(v) : <span className="hint">—</span>}
                    </td>
                  );
                })}
              </tr>
            ))}
          </tbody>
          <tfoot>
            <tr style={{ borderTop: "2px solid var(--border)" }}>
              <td style={{ fontWeight: 700 }}>Değişim</td>
              {RV_UNITS.map((u) => {
                const ch = rvChange(rows, u, cpiLatest);
                const color =
                  ch?.pct == null
                    ? undefined
                    : ch.pct >= 0
                    ? "var(--positive)"
                    : "var(--negative)";
                return (
                  <td key={u.key} className="num tabular" style={{ fontWeight: 700, color }}>
                    {ch?.pct != null ? fmt.pct(ch.pct, 1) : "—"}
                  </td>
                );
              })}
            </tr>
          </tfoot>
        </table>
      </div>

      <div
        style={{
          padding: "12px 16px",
          fontSize: 11,
          color: "var(--muted)",
          lineHeight: 1.7,
          background: "var(--surface-2)",
          borderRadius: 8,
        }}
      >
        <b>Nasıl okunur.</b> Her yılın net serveti, o yıl sonundaki USD/EUR/gram
        altın kuru ve TÜFE endeksi ile birime çevrilir. <b>Reel ₺</b>, geçmiş
        serveti bugünün alım gücüne getirir (enflasyondan arındırır). Bir birimde
        değer artıyorsa servetin o cinsten <i>gerçekten</i> büyümüş demektir;
        sabit veya azalıyorsa nominal ₺ büyümesi çoğunlukla değer kaybını telafi
        ediyordur.
        <br />
        <br />
        Not: Bu tablo <b>toplam net serveti</b> baz alır — maaş/kira/emekli gibi
        gelirlerden gelen birikim ile yatırım getirisi burada birleşiktir.
        Yalnızca borsa/yatırım getirisini izole görmek için{" "}
        <b>Yatırım Performansı</b> sekmesini kullan.
      </div>
    </div>
  );
}

function KpiCard({
  label,
  value,
  sub,
  color,
}: {
  label: string;
  value: string;
  sub?: string;
  color?: string;
}) {
  return (
    <div className="card" style={{ padding: 16 }}>
      <div className="hint" style={{ fontSize: 11, marginBottom: 6, textTransform: "uppercase", letterSpacing: "0.06em" }}>
        {label}
      </div>
      <div className="tabular" style={{ fontSize: 22, fontWeight: 700, color: color ?? "var(--fg)" }}>
        {value}
      </div>
      {sub && (
        <div className="hint" style={{ fontSize: 11, marginTop: 6 }}>
          {sub}
        </div>
      )}
    </div>
  );
}

function LotListCard({
  title,
  lots,
  empty,
  positive,
}: {
  title: string;
  lots: RawRealizedLot[];
  empty: string;
  positive: boolean;
}) {
  return (
    <div className="card">
      <div className="card-head">
        <div className="card-title">{title}</div>
        <div className="card-sub">{lots.length} lot</div>
      </div>
      {lots.length === 0 ? (
        <div className="empty"><div>{empty}</div></div>
      ) : (
        <table className="dg">
          <thead>
            <tr>
              <th style={{ width: 92 }}>Tarih</th>
              <th>Sembol</th>
              <th className="num">Adet</th>
              <th className="num">K/Z</th>
            </tr>
          </thead>
          <tbody>
            {lots.map((l) => {
              const color = positive ? "var(--positive)" : "var(--negative)";
              return (
                <tr key={l.id}>
                  <td className="mono" style={{ color: "var(--muted)", fontSize: 11 }}>
                    {l.closed_at.slice(0, 10)}
                  </td>
                  <td>
                    <div style={{ fontSize: 13, fontWeight: 600 }}>{l.asset_symbol}</div>
                    <div className="hint" style={{ fontSize: 11 }}>{l.asset_name}</div>
                  </td>
                  <td className="num tabular hint" style={{ fontSize: 12 }}>
                    {fmt.tr(l.quantity, l.asset_class === "fund" ? 4 : 0)}
                  </td>
                  <td className="num tabular" style={{ fontWeight: 600, color }}>
                    {l.realized_pnl_try >= 0 ? "+" : ""}{fmt.tr(l.realized_pnl_try, 0)} ₺
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      )}
    </div>
  );
}

const inp: React.CSSProperties = {
  background: "var(--surface)",
  border: "1px solid var(--border)",
  color: "var(--fg)",
  padding: "6px 10px",
  borderRadius: 6,
  fontSize: 13,
  outline: "none",
};

function CategoryCard({
  title,
  rows,
  color,
  total,
  label,
}: {
  title: string;
  rows: Array<{ id: string; name: string; icon: string; value: number }>;
  color: string;
  total: number;
  label: string;
}) {
  return (
    <div className="card">
      <div className="card-head">
        <div className="card-title">{title}</div>
        <div className="card-sub">{rows.length} kategori · {label}</div>
      </div>
      {rows.length === 0 ? (
        <div className="empty"><div>Bu dönemde kayıt yok.</div></div>
      ) : (
        <table className="dg">
          <thead>
            <tr>
              <th>Kategori</th>
              <th className="num">Tutar</th>
              <th className="num" style={{ width: 60 }}>Pay</th>
              <th style={{ width: "35%" }}>Görsel</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((r) => {
              const pct = total > 0 ? (r.value / total) * 100 : 0;
              return (
                <tr key={r.id}>
                  <td style={{ fontSize: 13 }}>
                    {r.icon && <span style={{ marginRight: 6 }}>{r.icon}</span>}
                    {r.name}
                  </td>
                  <td className="num tabular" style={{ fontWeight: 600, color }}>
                    {fmt.tr(r.value, 0)} ₺
                  </td>
                  <td className="num tabular hint">%{pct.toFixed(1)}</td>
                  <td>
                    <div
                      style={{
                        height: 6,
                        background: color,
                        borderRadius: 3,
                        width: `${Math.max(2, pct)}%`,
                        opacity: 0.6,
                      }}
                    />
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      )}
    </div>
  );
}

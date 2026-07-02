"use client";

import { useMemo, useState } from "react";

import { fmt } from "@/lib/finance/fmt";

import type { RawRealizedLot, RawTxn } from "@/app/(app)/_lib/reports-actions";
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
}

type TabKey = "cashflow" | "performance";

export function RaporlarClient({ txns, realized, categories, beneficiaries }: Props) {
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
      </div>

      <div style={{ display: "flex", gap: 4, marginBottom: 14, borderBottom: "1px solid var(--border-soft)" }}>
        <TabBtn active={tab === "cashflow"} onClick={() => setTab("cashflow")}>
          Nakit Akış
        </TabBtn>
        <TabBtn active={tab === "performance"} onClick={() => setTab("performance")}>
          Yatırım Performansı
        </TabBtn>
      </div>

      {rangeKey === "custom" && (
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

      {tab === "performance" ? (
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

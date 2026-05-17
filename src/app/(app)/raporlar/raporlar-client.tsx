"use client";

import { useMemo, useState } from "react";

import { fmt } from "@/lib/finance/fmt";

import type { RawTxn } from "@/app/(app)/_lib/reports-actions";
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
  categories: CategoryRow[];
  beneficiaries: BeneficiaryLite[];
}

export function RaporlarClient({ txns, categories, beneficiaries }: Props) {
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

  return (
    <div>
      <div className="page-head">
        <div>
          <div className="page-title">Raporlar</div>
          <div className="page-sub">{label} · {filtered.length} işlem</div>
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

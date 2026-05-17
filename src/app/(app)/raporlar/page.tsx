import { listBeneficiariesLite } from "@/app/(app)/hesaplar/actions";
import { listCategories } from "@/app/(app)/ayarlar/actions";
import { listTransactionsForReports, type RawTxn } from "@/app/(app)/_lib/reports-actions";
import { Icon } from "@/components/ui/icon";
import { fmt } from "@/lib/finance/fmt";

export const dynamic = "force-dynamic";

const MONTH_TR = ["Oca", "Şub", "Mar", "Nis", "May", "Haz", "Tem", "Ağu", "Eyl", "Eki", "Kas", "Ara"];

function monthLabel(period: string): string {
  const [y, m] = period.split("-");
  return `${MONTH_TR[Number(m) - 1]} ${y.slice(2)}`;
}

interface MonthBucket {
  period: string; // YYYY-MM
  inflow: number;
  outflow: number;
}

function bucketByMonth(txns: RawTxn[], months: number): MonthBucket[] {
  const today = new Date();
  const buckets: MonthBucket[] = [];
  for (let i = months - 1; i >= 0; i--) {
    const d = new Date(today.getFullYear(), today.getMonth() - i, 1);
    const period = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
    buckets.push({ period, inflow: 0, outflow: 0 });
  }
  const map = new Map(buckets.map((b) => [b.period, b]));
  for (const t of txns) {
    const period = t.occurred_on.slice(0, 7);
    const b = map.get(period);
    if (!b) continue;
    if (t.direction === "inflow") b.inflow += Number(t.amount);
    else if (t.direction === "outflow") b.outflow += Number(t.amount);
  }
  return buckets;
}

function aggregateByKey(
  txns: RawTxn[],
  direction: "inflow" | "outflow",
  keyOf: (t: RawTxn) => string | null,
): Map<string, number> {
  const m = new Map<string, number>();
  for (const t of txns) {
    if (t.direction !== direction) continue;
    const k = keyOf(t) ?? "__none__";
    m.set(k, (m.get(k) ?? 0) + Number(t.amount));
  }
  return m;
}

export default async function RaporlarPage() {
  const [txns, categories, beneficiaries] = await Promise.all([
    listTransactionsForReports(12),
    listCategories(),
    listBeneficiariesLite(),
  ]);

  const catMap = Object.fromEntries(categories.map((c) => [c.id, c]));
  const benMap = Object.fromEntries(beneficiaries.map((b) => [b.id, b]));

  const monthly = bucketByMonth(txns, 12);
  const totalInflow12m = monthly.reduce((s, b) => s + b.inflow, 0);
  const totalOutflow12m = monthly.reduce((s, b) => s + b.outflow, 0);
  const totalNet12m = totalInflow12m - totalOutflow12m;
  const avgMonthlyNet = totalNet12m / 12;

  // Bu ay ve geçen ay karşılaştırma
  const thisMonth = monthly[monthly.length - 1] ?? { inflow: 0, outflow: 0, period: "" };
  const lastMonth = monthly[monthly.length - 2] ?? { inflow: 0, outflow: 0, period: "" };

  // Kategori bazlı (son 12 ay)
  const byCatOut = aggregateByKey(txns, "outflow", (t) => t.category_id);
  const byCatIn = aggregateByKey(txns, "inflow", (t) => t.category_id);
  const expCatRows = Array.from(byCatOut.entries())
    .map(([id, value]) => ({
      id,
      name: id === "__none__" ? "(Kategorisiz)" : (catMap[id]?.name ?? "?"),
      icon: id === "__none__" ? "" : (catMap[id]?.icon ?? ""),
      value,
    }))
    .filter((r) => r.value > 0)
    .sort((a, b) => b.value - a.value);
  const incCatRows = Array.from(byCatIn.entries())
    .map(([id, value]) => ({
      id,
      name: id === "__none__" ? "(Kategorisiz)" : (catMap[id]?.name ?? "?"),
      icon: id === "__none__" ? "" : (catMap[id]?.icon ?? ""),
      value,
    }))
    .filter((r) => r.value > 0)
    .sort((a, b) => b.value - a.value);

  // Kişi bazlı gider
  const byBenOut = aggregateByKey(txns, "outflow", (t) => t.beneficiary_id);
  const benRows = Array.from(byBenOut.entries())
    .map(([id, value]) => ({
      id,
      name: id === "__none__" ? "(Atanmamış)" : (benMap[id]?.name ?? "?"),
      color: id === "__none__" ? "#7d8699" : (benMap[id]?.color ?? "#7d8699"),
      value,
    }))
    .filter((r) => r.value > 0)
    .sort((a, b) => b.value - a.value);

  // Bar chart maks
  const maxMonthValue = Math.max(
    ...monthly.map((b) => Math.max(b.inflow, b.outflow)),
    1,
  );

  if (txns.length === 0) {
    return (
      <div>
        <div className="page-head">
          <div>
            <div className="page-title">Raporlar</div>
            <div className="page-sub">12 aylık nakit akış · kategori dağılımı · kişi analizi.</div>
          </div>
        </div>
        <div className="empty">
          <div className="title">
            <Icon name="report" size={20} /> Henüz veri yok
          </div>
          <div style={{ marginTop: 8, lineHeight: 1.6 }}>
            Gelir veya gider kaydı eklenince burada raporlar canlıya çıkacak.
          </div>
        </div>
      </div>
    );
  }

  return (
    <div>
      <div className="page-head">
        <div>
          <div className="page-title">Raporlar</div>
          <div className="page-sub">Son 12 ay · {txns.length} işlem</div>
        </div>
      </div>

      {/* KPI'lar */}
      <div className="grid-base grid-4" style={{ gap: 16, marginBottom: 18 }}>
        <div className="card" style={{ padding: 16 }}>
          <div className="hint" style={{ fontSize: 11, marginBottom: 6 }}>12 AY GELİR</div>
          <div className="tabular" style={{ fontSize: 22, fontWeight: 700, color: "var(--positive)" }}>
            +{fmt.try(totalInflow12m)}
          </div>
        </div>
        <div className="card" style={{ padding: 16 }}>
          <div className="hint" style={{ fontSize: 11, marginBottom: 6 }}>12 AY GİDER</div>
          <div className="tabular" style={{ fontSize: 22, fontWeight: 700, color: "var(--negative)" }}>
            -{fmt.try(totalOutflow12m)}
          </div>
        </div>
        <div className="card" style={{ padding: 16 }}>
          <div className="hint" style={{ fontSize: 11, marginBottom: 6 }}>12 AY NET</div>
          <div
            className="tabular"
            style={{ fontSize: 22, fontWeight: 700, color: totalNet12m >= 0 ? "var(--positive)" : "var(--negative)" }}
          >
            {totalNet12m >= 0 ? "+" : ""}
            {fmt.try(totalNet12m)}
          </div>
          <div className="hint" style={{ fontSize: 11 }}>
            ortalama {avgMonthlyNet >= 0 ? "+" : ""}{fmt.try(avgMonthlyNet)} / ay
          </div>
        </div>
        <div className="card" style={{ padding: 16 }}>
          <div className="hint" style={{ fontSize: 11, marginBottom: 6 }}>BU AY VS GEÇEN AY (NET)</div>
          <div className="tabular" style={{ fontSize: 16, fontWeight: 600 }}>
            <span style={{ color: thisMonth.inflow - thisMonth.outflow >= 0 ? "var(--positive)" : "var(--negative)" }}>
              {fmt.try(thisMonth.inflow - thisMonth.outflow)}
            </span>
            <span style={{ color: "var(--muted)", margin: "0 6px" }}>vs</span>
            <span style={{ color: lastMonth.inflow - lastMonth.outflow >= 0 ? "var(--positive)" : "var(--negative)" }}>
              {fmt.try(lastMonth.inflow - lastMonth.outflow)}
            </span>
          </div>
        </div>
      </div>

      {/* Aylık nakit akış bar chart */}
      <div className="card" style={{ marginBottom: 18 }}>
        <div className="card-head">
          <div className="card-title">Aylık Nakit Akış</div>
          <div className="card-sub">Son 12 ay · yeşil gelir, kırmızı gider, sağda net</div>
        </div>
        <div style={{ padding: "20px 24px" }}>
          <div
            style={{
              display: "grid",
              gridTemplateColumns: `repeat(${monthly.length}, 1fr)`,
              gap: 8,
              alignItems: "end",
              height: 180,
              paddingBottom: 24,
              borderBottom: "1px solid var(--border-soft)",
            }}
          >
            {monthly.map((b) => {
              const inH = (b.inflow / maxMonthValue) * 100;
              const outH = (b.outflow / maxMonthValue) * 100;
              return (
                <div key={b.period} style={{ display: "flex", flexDirection: "column", alignItems: "center", height: "100%", justifyContent: "flex-end", position: "relative" }}>
                  <div style={{ display: "flex", gap: 2, height: "100%", alignItems: "flex-end" }}>
                    <div
                      title={`Gelir ${fmt.tr(b.inflow, 0)} ₺`}
                      style={{
                        width: 10,
                        height: `${inH}%`,
                        background: "var(--positive)",
                        borderRadius: "2px 2px 0 0",
                        minHeight: b.inflow > 0 ? 2 : 0,
                      }}
                    />
                    <div
                      title={`Gider ${fmt.tr(b.outflow, 0)} ₺`}
                      style={{
                        width: 10,
                        height: `${outH}%`,
                        background: "var(--negative)",
                        borderRadius: "2px 2px 0 0",
                        minHeight: b.outflow > 0 ? 2 : 0,
                      }}
                    />
                  </div>
                  <div
                    style={{
                      position: "absolute",
                      bottom: -22,
                      fontSize: 10,
                      color: "var(--muted)",
                      whiteSpace: "nowrap",
                    }}
                  >
                    {monthLabel(b.period)}
                  </div>
                </div>
              );
            })}
          </div>

          <table className="dg" style={{ marginTop: 12 }}>
            <thead>
              <tr>
                <th>Ay</th>
                <th className="num">Gelir</th>
                <th className="num">Gider</th>
                <th className="num">Net</th>
              </tr>
            </thead>
            <tbody>
              {[...monthly].reverse().map((b) => {
                const net = b.inflow - b.outflow;
                return (
                  <tr key={b.period}>
                    <td>{monthLabel(b.period)}</td>
                    <td className="num tabular" style={{ color: "var(--positive)" }}>
                      {b.inflow > 0 ? "+" + fmt.tr(b.inflow, 0) : "—"}
                    </td>
                    <td className="num tabular" style={{ color: "var(--negative)" }}>
                      {b.outflow > 0 ? "-" + fmt.tr(b.outflow, 0) : "—"}
                    </td>
                    <td
                      className="num tabular"
                      style={{ fontWeight: 600, color: net >= 0 ? "var(--positive)" : "var(--negative)" }}
                    >
                      {net >= 0 ? "+" : ""}
                      {fmt.tr(net, 0)}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </div>

      {/* Kategori bazlı gider + gelir yan yana */}
      <div className="grid-base grid-2" style={{ gap: 16, marginBottom: 18, alignItems: "start" }}>
        <CategoryCard
          title="Gider Kategorileri"
          rows={expCatRows}
          color="var(--negative)"
          total={totalOutflow12m}
        />
        <CategoryCard
          title="Gelir Kategorileri"
          rows={incCatRows}
          color="var(--positive)"
          total={totalInflow12m}
        />
      </div>

      {/* Kişi bazlı gider */}
      {benRows.length > 0 && (
        <div className="card">
          <div className="card-head">
            <div className="card-title">Kişi Bazlı Gider</div>
            <div className="card-sub">Son 12 ay</div>
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
                const pct = totalOutflow12m > 0 ? (r.value / totalOutflow12m) * 100 : 0;
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

function CategoryCard({
  title,
  rows,
  color,
  total,
}: {
  title: string;
  rows: Array<{ id: string; name: string; icon: string; value: number }>;
  color: string;
  total: number;
}) {
  return (
    <div className="card">
      <div className="card-head">
        <div className="card-title">{title}</div>
        <div className="card-sub">{rows.length} kategori · 12 ay</div>
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

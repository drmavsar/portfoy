import { Donut } from "@/components/charts/donut";
import { CatChip, PersonChip } from "@/components/ui/chips";
import { Icon } from "@/components/ui/icon";
import { KpiCard } from "@/components/ui/kpi-card";
import { fmt } from "@/lib/finance/fmt";
import {
  BEN_SPEND,
  CAT_SPEND_YEAR,
  KPIS,
  PEOPLE,
  TX_BASE,
  YEARLY_COMPARE,
} from "@/lib/sample/data";

// Bu yılın en büyük 5 giderini ve en büyük 5 gelirini çıkar
const yearTx = TX_BASE; // örnek; gerçek DB'de tarih filtresi olacak
const topExpenses = [...yearTx.filter((t) => t.dir === "out")]
  .sort((a, b) => b.amount - a.amount)
  .slice(0, 5);
const topIncomes = [...yearTx.filter((t) => t.dir === "in")]
  .sort((a, b) => b.amount - a.amount)
  .slice(0, 5);

const cur = YEARLY_COMPARE[YEARLY_COMPARE.length - 1];
const prev = YEARLY_COMPARE[YEARLY_COMPARE.length - 2];

export default function CashflowPage() {
  return (
    <div>
      <div className="page-head">
        <div>
          <div className="page-title">Nakit Akışı</div>
          <div className="page-sub">Yıl boyunca para nereye gitti, ne biriktirdik?</div>
        </div>
        <div className="page-actions">
          <button className="btn">
            <Icon name="upload2" size={14} /> Ekstre Yükle
          </button>
          <button className="btn">
            <Icon name="download" size={14} /> CSV
          </button>
          <button className="btn btn-prim">
            <Icon name="plus" size={14} /> Yeni Gider / Gelir
          </button>
        </div>
      </div>

      {/* Bu ay KPI'lar */}
      <div className="grid-base grid-4" style={{ marginBottom: 18 }}>
        <KpiCard
          label="Bu Ay Gelir"
          value={fmt.try(KPIS.cashflowMonth.income)}
          delta={fmt.pct(12.0)}
          deltaPos
          deltaLabel="geçen aya göre"
        />
        <KpiCard
          label="Bu Ay Gider"
          value={fmt.try(KPIS.cashflowMonth.expense)}
          delta={fmt.pct(-3.2)}
          deltaPos
          deltaLabel="geçen aya göre"
        />
        <KpiCard
          label="Tasarruf"
          value={"+" + fmt.try(KPIS.cashflowMonth.savings)}
          delta={fmt.pct(KPIS.cashflowMonth.savingsPctChangeMoM)}
          deltaPos
          deltaLabel={`%${((KPIS.cashflowMonth.savings / KPIS.cashflowMonth.income) * 100).toFixed(1)} oran`}
        />
        <KpiCard
          label="Açık Kart Borcu"
          value={fmt.try(KPIS.cardDebt)}
          delta={`${KPIS.cardLimitPct.toFixed(1)}% limit`}
          deltaLabel={`son ödeme ${KPIS.cardDueDate}`}
          footer={
            <div className="bar bar-warn" style={{ marginTop: 4 }}>
              <span style={{ width: `${KPIS.cardLimitPct}%` }} />
            </div>
          }
        />
      </div>

      {/* Yıllık Özet */}
      <div className="grid-base grid-3" style={{ marginBottom: 18 }}>
        <div className="card">
          <div className="card-head">
            <div className="card-title">2026 YTD</div>
            <div className="card-sub">vs {prev.year}</div>
          </div>
          <div className="card-pad" style={{ display: "grid", gap: 10 }}>
            <Row label="Gelir" cur={cur.income} prev={prev.income} dir="up" />
            <Row label="Gider" cur={cur.expense} prev={prev.expense} dir="down" />
            <Row label="Net" cur={cur.net} prev={prev.net} dir="up" />
          </div>
        </div>
        <div className="card">
          <div className="card-head">
            <div className="card-title">Bu Ay Faydalanıcı Payı</div>
          </div>
          <div className="card-pad">
            <Donut
              size={150}
              thickness={22}
              data={BEN_SPEND.map((b) => ({
                label: b.label,
                value: b.amount,
                color: PEOPLE.find((p) => p.id === b.id)?.color ?? "#7d8699",
              }))}
            />
          </div>
        </div>
        <div className="card">
          <div className="card-head">
            <div className="card-title">Yıl Boyunca En Büyük Gider</div>
          </div>
          <div className="card-pad" style={{ display: "grid", gap: 10 }}>
            {CAT_SPEND_YEAR.slice(0, 5).map((c) => (
              <div
                key={c.id}
                style={{
                  display: "grid",
                  gridTemplateColumns: "140px 1fr 80px",
                  alignItems: "center",
                  gap: 10,
                  fontSize: 12,
                }}
              >
                <CatChip id={c.id} size="sm" />
                <div className="bar" style={{ height: 6 }}>
                  <span style={{ width: `${c.pct}%`, background: "var(--accent)" }} />
                </div>
                <span className="tabular" style={{ textAlign: "right" }}>
                  {fmt.k(c.amount)} ₺
                </span>
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* Yıl içindeki en büyük 5 gider + 5 gelir */}
      <div className="grid-base grid-2" style={{ marginBottom: 18 }}>
        <div className="card">
          <div className="card-head">
            <div className="card-title">2026 YTD En Büyük 5 Gider</div>
            <div className="card-sub">tek seferlik / önemli kalemler</div>
          </div>
          <table className="dg">
            <thead>
              <tr>
                <th>Tarih</th>
                <th>Açıklama</th>
                <th>Kategori</th>
                <th>Kim için</th>
                <th className="num">Tutar</th>
              </tr>
            </thead>
            <tbody>
              {topExpenses.map((t, i) => (
                <tr key={i}>
                  <td className="tabular hint">{t.date}</td>
                  <td style={{ fontWeight: 500 }}>{t.merchant}</td>
                  <td>
                    <CatChip id={t.cat} size="sm" />
                  </td>
                  <td>
                    <PersonChip id={t.ben} size="sm" />
                  </td>
                  <td className="num tabular delta-neg" style={{ fontWeight: 600 }}>
                    {fmt.try(t.amount)}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        <div className="card">
          <div className="card-head">
            <div className="card-title">2026 YTD En Büyük 5 Gelir</div>
          </div>
          <table className="dg">
            <thead>
              <tr>
                <th>Tarih</th>
                <th>Açıklama</th>
                <th>Kategori</th>
                <th>Kim için</th>
                <th className="num">Tutar</th>
              </tr>
            </thead>
            <tbody>
              {topIncomes.map((t, i) => (
                <tr key={i}>
                  <td className="tabular hint">{t.date}</td>
                  <td style={{ fontWeight: 500 }}>{t.merchant}</td>
                  <td>
                    <CatChip id={t.cat} size="sm" />
                  </td>
                  <td>
                    <PersonChip id={t.ben} size="sm" />
                  </td>
                  <td className="num tabular delta-pos" style={{ fontWeight: 600 }}>
                    {fmt.try(t.amount)}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      {/* Yıllık hareket listesi (tüm gider/gelir) */}
      <div className="card">
        <div className="card-head">
          <div className="card-title">2026 — Yıllık Hareketler</div>
          <div className="card-sub">{TX_BASE.length} satır · ekstre yüklendikçe genişler</div>
          <div className="row gap-8" style={{ marginLeft: "auto" }}>
            <button className="btn btn-sm">
              <Icon name="filter" size={11} /> Filtre
            </button>
            <button className="btn btn-sm">
              <Icon name="download" size={11} /> Dışa Aktar
            </button>
          </div>
        </div>
        <table className="dg">
          <thead>
            <tr>
              <th>Tarih</th>
              <th>Hesap</th>
              <th>Açıklama</th>
              <th>Kategori</th>
              <th>Kim için</th>
              <th className="num">Tutar</th>
            </tr>
          </thead>
          <tbody>
            {TX_BASE.map((t, i) => (
              <tr key={i}>
                <td className="tabular hint">{t.date}</td>
                <td className="hint">{t.acc}</td>
                <td style={{ fontWeight: 500 }}>{t.merchant}</td>
                <td>
                  <CatChip id={t.cat} size="sm" />
                </td>
                <td>
                  <PersonChip id={t.ben} size="sm" />
                </td>
                <td
                  className={`num tabular ${t.dir === "in" ? "delta-pos" : "delta-neg"}`}
                  style={{ fontWeight: 600 }}
                >
                  {t.dir === "in" ? "+" : "−"}
                  {fmt.try(t.amount)}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

function Row({
  label,
  cur,
  prev,
  dir,
}: {
  label: string;
  cur: number;
  prev: number;
  dir: "up" | "down";
}) {
  const pct = ((cur - prev) / prev) * 100;
  const good = dir === "up" ? pct >= 0 : pct <= 0;
  return (
    <div
      style={{
        display: "grid",
        gridTemplateColumns: "60px 1fr 100px",
        gap: 8,
        alignItems: "center",
        fontSize: 13,
      }}
    >
      <span className="hint">{label}</span>
      <span className="tabular" style={{ fontWeight: 600 }}>
        {fmt.try(cur)}
      </span>
      <span className={`tabular ${good ? "delta-pos" : "delta-neg"}`} style={{ textAlign: "right" }}>
        {fmt.pct(pct)}
      </span>
    </div>
  );
}

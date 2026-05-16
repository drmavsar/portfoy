import { BarChart } from "@/components/charts/bar-chart";
import { Donut } from "@/components/charts/donut";
import { Heatmap } from "@/components/charts/heatmap";
import { LineChart, type LineSeries } from "@/components/charts/line-chart";
import { SectorBars } from "@/components/charts/sector-bars";
import { Sparkline } from "@/components/charts/sparkline";
import { Treemap } from "@/components/charts/treemap";
import { Waterfall, type WaterfallItem } from "@/components/charts/waterfall";
import { CatChip, PersonChip, PolarityBadge } from "@/components/ui/chips";
import { Icon } from "@/components/ui/icon";
import { KpiCard } from "@/components/ui/kpi-card";
import { fmt } from "@/lib/finance/fmt";
import {
  ALLOCATION,
  BEN_SPEND,
  CASHFLOW_12,
  CAT_SPEND_YEAR,
  CORR,
  CORR_SYMS,
  HOLDINGS,
  KAP_STREAM,
  KPIS,
  NET_WORTH_SPARK,
  PEOPLE,
  REAL_VS_NOM,
  SECTORS_1M,
  TOP_WEEK,
  YEARLY_COMPARE,
} from "@/lib/sample/data";

// Bugünkü K/Z (varlık bazlı + toplam)
const todayMoves = HOLDINGS.map((h) => {
  const prev = h.prev ?? h.last;
  const pnl = (h.last - prev) * h.qty;
  const pct = prev > 0 ? (h.last / prev - 1) * 100 : 0;
  return { ...h, pnl, pct };
}).sort((a, b) => b.pnl - a.pnl);

const todayTopWinners = todayMoves.filter((m) => m.pnl > 0).slice(0, 3);
const todayTopLosers = todayMoves.filter((m) => m.pnl < 0).slice(0, 3);
const todayTotalPnl = todayMoves.reduce((s, m) => s + m.pnl, 0);

// Hane bireyi başına portföy (dinamik — PEOPLE listesinden türetilir)
const PORTFOLIO_BY_PERSON = PEOPLE.filter((p) => p.role !== "household" && p.role !== "parents")
  .map((p) => {
    const rows = HOLDINGS.filter((h) => h.sub === p.id);
    const mv = rows.reduce((s, h) => s + h.qty * h.last, 0);
    const cb = rows.reduce((s, h) => s + h.qty * h.wac, 0);
    const todayPnl = rows.reduce((s, h) => s + (h.last - (h.prev ?? h.last)) * h.qty, 0);
    const pnl = mv - cb;
    return { id: p.id, name: p.name, color: p.color, marketValue: mv, costBasis: cb, pnl, pnlPct: cb > 0 ? (pnl / cb) * 100 : 0, todayPnl };
  })
  .filter((r) => r.marketValue > 0);

const waterfall: WaterfallItem[] = [
  { label: "Eyl 2025", value: 4_120_000, type: "start" },
  { label: "Gelir", value: +1_580_000, sub: "12 ay" },
  { label: "Gider", value: -940_000, sub: "12 ay" },
  { label: "Yatırım K/Z", value: +318_180, sub: "realize+bekleyen" },
  { label: "Katkı", value: -236_000, sub: "çocuk + ebeveyn" },
  { label: "May 2026", value: 4_842_180, type: "end" },
];

const realVsNomSeries: LineSeries[] = [
  { name: "Portföy (Nom)", values: REAL_VS_NOM.port, color: "var(--accent)", strong: true },
  { name: "TÜFE", values: REAL_VS_NOM.cpi, color: "var(--negative)", dash: "4 2" },
  { name: "USD", values: REAL_VS_NOM.usd, color: "var(--c-teal)" },
  { name: "Altın", values: REAL_VS_NOM.xau, color: "var(--c-amber)" },
  { name: "BIST100", values: REAL_VS_NOM.bist, color: "var(--c-violet)" },
];

const cur = YEARLY_COMPARE[YEARLY_COMPARE.length - 1];
const prev = YEARLY_COMPARE[YEARLY_COMPARE.length - 2];
const yoyIncomePct = ((cur.income - prev.income) / prev.income) * 100;
const yoyExpensePct = ((cur.expense - prev.expense) / prev.expense) * 100;
const yoyNetPct = ((cur.net - prev.net) / prev.net) * 100;

export default function DashboardPage() {
  return (
    <div>
      <div className="page-head">
        <div>
          <div className="page-title">Özet</div>
          <div className="page-sub">Sabah 30 saniyede ne oldu, neye dikkat etmeliyim?</div>
        </div>
        <div className="page-actions">
          <button className="btn">
            <Icon name="refresh" size={14} /> Yenile <span className="hint" style={{ marginLeft: 4 }}>09:18</span>
          </button>
          <button className="btn">
            <Icon name="download" size={14} /> Rapor
          </button>
          <button className="btn btn-prim">
            <Icon name="plus" size={14} /> İşlem Ekle
          </button>
        </div>
      </div>

      {/* 4 KPI cards */}
      <div className="grid-base grid-4" style={{ marginBottom: 18 }}>
        <KpiCard
          label="Net Servet"
          value={fmt.try(KPIS.netWorth)}
          delta={fmt.pct(KPIS.netWorthDeltaMonthPct)}
          deltaPos
          deltaLabel={`bugün ${KPIS.netWorthDeltaDay >= 0 ? "+" : ""}${fmt.k(KPIS.netWorthDeltaDay)} ₺`}
          spark={NET_WORTH_SPARK}
          sparkColor="var(--accent)"
        />
        <KpiCard
          label="Bugünkü Portföy K/Z"
          value={`${todayTotalPnl >= 0 ? "+" : ""}${fmt.try(todayTotalPnl)}`}
          delta={fmt.pct(KPIS.todayPortfolioDeltaPct)}
          deltaPos={todayTotalPnl >= 0}
          deltaLabel={`${todayMoves.filter((m) => m.pnl > 0).length} yukarı · ${todayMoves.filter((m) => m.pnl < 0).length} aşağı`}
        />
        <KpiCard
          label="Bu Ay Tasarruf"
          value={"+" + fmt.try(KPIS.cashflowMonth.savings)}
          delta={fmt.pct(KPIS.cashflowMonth.savingsPctChangeMoM)}
          deltaPos
          deltaLabel={`gelir ${fmt.k(KPIS.cashflowMonth.income)} ₺ · gider ${fmt.k(KPIS.cashflowMonth.expense)} ₺`}
          spark={[44000, 46000, 49000, 52000, 48000, 51000, 54140]}
          sparkColor="var(--positive)"
        />
        <KpiCard
          label="Reel Getiri YTD"
          value={fmt.pct(KPIS.portfolioRealYTD)}
          delta={`nominal ${fmt.pct(KPIS.portfolioNominalYTD)}`}
          deltaPos
          deltaLabel={`TÜFE ${fmt.pct(KPIS.cpiYTD)}`}
          footer={
            <div className="row gap-8" style={{ fontFamily: "var(--font-mono)", fontSize: 10 }}>
              <span>BIST {fmt.pct(KPIS.benchmarks[0].ytd)}</span>
              <span>USD {fmt.pct(KPIS.benchmarks[1].ytd)}</span>
              <span>XAU {fmt.pct(KPIS.benchmarks[2].ytd)}</span>
            </div>
          }
        />
      </div>

      {/* Bugünkü K/Z (varlık bazlı top 3 / top 3) */}
      <div className="grid-base grid-2" style={{ marginBottom: 18 }}>
        <div className="card">
          <div className="card-head">
            <div className="card-title">Bugün En Çok Kazandıran</div>
            <div className="card-sub">portföyündeki varlıklar</div>
          </div>
          <div style={{ padding: "2px 0" }}>
            {todayTopWinners.map((m, i) => (
              <div
                key={m.sym}
                style={{
                  display: "grid",
                  gridTemplateColumns: "60px 1fr auto auto",
                  gap: 12,
                  padding: "10px 16px",
                  borderTop: i === 0 ? "none" : "1px solid var(--border-soft)",
                  alignItems: "center",
                }}
              >
                <span className="chip chip-sm chip-acc" style={{ justifySelf: "start" }}>
                  {m.sym}
                </span>
                <div>
                  <div style={{ fontSize: 13, fontWeight: 500 }}>{m.name}</div>
                  <div className="hint">{m.qty} adet · WAC {fmt.tr(m.wac, 2)}</div>
                </div>
                <div className="tabular delta-pos" style={{ fontWeight: 600 }}>
                  +{fmt.try(m.pnl)}
                </div>
                <div className="tabular delta-pos">{fmt.pct(m.pct)}</div>
              </div>
            ))}
            {todayTopWinners.length === 0 && <div className="empty">Bugün artıda hisse yok.</div>}
          </div>
        </div>

        <div className="card">
          <div className="card-head">
            <div className="card-title">Bugün En Çok Kaybettiren</div>
            <div className="card-sub">portföyündeki varlıklar</div>
          </div>
          <div style={{ padding: "2px 0" }}>
            {todayTopLosers.map((m, i) => (
              <div
                key={m.sym}
                style={{
                  display: "grid",
                  gridTemplateColumns: "60px 1fr auto auto",
                  gap: 12,
                  padding: "10px 16px",
                  borderTop: i === 0 ? "none" : "1px solid var(--border-soft)",
                  alignItems: "center",
                }}
              >
                <span className="chip chip-sm chip-acc" style={{ justifySelf: "start" }}>
                  {m.sym}
                </span>
                <div>
                  <div style={{ fontSize: 13, fontWeight: 500 }}>{m.name}</div>
                  <div className="hint">{m.qty} adet · WAC {fmt.tr(m.wac, 2)}</div>
                </div>
                <div className="tabular delta-neg" style={{ fontWeight: 600 }}>
                  {fmt.try(m.pnl)}
                </div>
                <div className="tabular delta-neg">{fmt.pct(m.pct)}</div>
              </div>
            ))}
            {todayTopLosers.length === 0 && <div className="empty">Bugün eksi hisse yok 🟢</div>}
          </div>
        </div>
      </div>

      {/* Hane bireyleri portföyleri (DİNAMİK — PEOPLE'a yeni kişi eklenince burada da görünür) */}
      <div className="card" style={{ marginBottom: 18 }}>
        <div className="card-head">
          <div className="card-title">Hane Bireyleri — Portföy Görünümü</div>
          <div className="card-sub">listede yeni kişi eklenince buraya da düşer</div>
        </div>
        <div
          className="grid-base"
          style={{
            gridTemplateColumns: `repeat(${PORTFOLIO_BY_PERSON.length || 1}, 1fr)`,
            padding: 16,
            gap: 12,
          }}
        >
          {PORTFOLIO_BY_PERSON.map((p) => (
            <div
              key={p.id}
              style={{
                border: "1px solid var(--border-soft)",
                borderRadius: 8,
                padding: 14,
                background: "var(--surface-2)",
              }}
            >
              <div className="row gap-8" style={{ marginBottom: 6 }}>
                <span className="chip-dot" style={{ background: p.color, width: 8, height: 8 }} />
                <span style={{ fontSize: 13, fontWeight: 600 }}>{p.name}</span>
              </div>
              <div
                className="tabular"
                style={{ fontSize: 22, fontWeight: 600, letterSpacing: "-0.02em" }}
              >
                {fmt.try(p.marketValue)}
              </div>
              <div className="row gap-8" style={{ marginTop: 4, fontSize: 12 }}>
                <span className={p.pnl >= 0 ? "delta-pos" : "delta-neg"}>
                  {p.pnl >= 0 ? "▲" : "▼"} {fmt.pct(p.pnlPct)}
                </span>
                <span className="delta-mut">
                  Bugün {p.todayPnl >= 0 ? "+" : ""}
                  {fmt.k(p.todayPnl)} ₺
                </span>
              </div>
              <div className="hint" style={{ marginTop: 4 }}>
                Maliyet {fmt.k(p.costBasis)} ₺
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* Yıllık Özet (önceki yıllarla kıyas) */}
      <div className="card" style={{ marginBottom: 18 }}>
        <div className="card-head">
          <div className="card-title">Yıllık Özet</div>
          <div className="card-sub">2026 YTD vs önceki yıllar</div>
        </div>
        <div className="card-pad">
          <table className="dg">
            <thead>
              <tr>
                <th>Yıl</th>
                <th className="num">Gelir</th>
                <th className="num">Gider</th>
                <th className="num">Net</th>
                <th>Trend</th>
              </tr>
            </thead>
            <tbody>
              {YEARLY_COMPARE.map((y) => (
                <tr key={y.year}>
                  <td>
                    <span style={{ fontWeight: 600 }}>{y.year}</span>
                  </td>
                  <td className="num tabular delta-pos">{fmt.try(y.income)}</td>
                  <td className="num tabular delta-neg">{fmt.try(y.expense)}</td>
                  <td
                    className={`num tabular ${y.net >= 0 ? "delta-pos" : "delta-neg"}`}
                    style={{ fontWeight: 600 }}
                  >
                    {fmt.try(y.net)}
                  </td>
                  <td>
                    <Sparkline
                      values={YEARLY_COMPARE.map((p) => p.net)}
                      width={120}
                      height={22}
                      stroke={1.4}
                    />
                  </td>
                </tr>
              ))}
            </tbody>
          </table>

          <div className="grid-base grid-3" style={{ marginTop: 14, gap: 10 }}>
            <div
              className="row gap-8"
              style={{
                padding: "10px 14px",
                background: "var(--surface-2)",
                borderRadius: 8,
                border: "1px solid var(--border-soft)",
              }}
            >
              <span className="chip chip-pos chip-sm">YoY Gelir</span>
              <span className={`tabular ${yoyIncomePct >= 0 ? "delta-pos" : "delta-neg"}`}>
                {fmt.pct(yoyIncomePct)}
              </span>
              <span className="hint" style={{ marginLeft: "auto" }}>
                {fmt.k(cur.income - prev.income)} ₺ fark
              </span>
            </div>
            <div
              className="row gap-8"
              style={{
                padding: "10px 14px",
                background: "var(--surface-2)",
                borderRadius: 8,
                border: "1px solid var(--border-soft)",
              }}
            >
              <span className="chip chip-neg chip-sm">YoY Gider</span>
              <span className={`tabular ${yoyExpensePct >= 0 ? "delta-neg" : "delta-pos"}`}>
                {fmt.pct(yoyExpensePct)}
              </span>
              <span className="hint" style={{ marginLeft: "auto" }}>
                {fmt.k(cur.expense - prev.expense)} ₺ fark
              </span>
            </div>
            <div
              className="row gap-8"
              style={{
                padding: "10px 14px",
                background: "var(--surface-2)",
                borderRadius: 8,
                border: "1px solid var(--border-soft)",
              }}
            >
              <span className="chip chip-acc chip-sm">YoY Net</span>
              <span className={`tabular ${yoyNetPct >= 0 ? "delta-pos" : "delta-neg"}`}>
                {fmt.pct(yoyNetPct)}
              </span>
              <span className="hint" style={{ marginLeft: "auto" }}>
                {fmt.k(cur.net - prev.net)} ₺ fark
              </span>
            </div>
          </div>
        </div>
      </div>

      {/* Bu yıl en büyük gider kalemleri */}
      <div className="card" style={{ marginBottom: 18 }}>
        <div className="card-head">
          <div className="card-title">2026 YTD — En Büyük Gider Kalemleri</div>
          <div className="card-sub">kategori bazında, top 10</div>
        </div>
        <div className="card-pad" style={{ display: "grid", gap: 8 }}>
          {CAT_SPEND_YEAR.map((c) => (
            <div
              key={c.id}
              style={{
                display: "grid",
                gridTemplateColumns: "180px 1fr 90px 60px",
                alignItems: "center",
                gap: 12,
                fontSize: 13,
              }}
            >
              <CatChip id={c.id} />
              <div className="bar" style={{ height: 8 }}>
                <span style={{ width: `${c.pct}%`, background: "var(--accent)" }} />
              </div>
              <span className="tabular" style={{ textAlign: "right" }}>
                {fmt.try(c.amount)}
              </span>
              <span className="tabular hint" style={{ textAlign: "right" }}>
                {c.pct.toFixed(1)}%
              </span>
            </div>
          ))}
        </div>
      </div>

      {/* Orta blok — Waterfall + Aylık cashflow + Reel/Nominal */}
      <div className="grid-base" style={{ gridTemplateColumns: "1.7fr 1fr", marginBottom: 18 }}>
        <div className="grid-base" style={{ gap: 16 }}>
          <div className="card">
            <div className="card-head">
              <div className="card-title">12 Ay Servet Akışı</div>
              <div className="card-sub">Açılış → Gelir → Gider → Yatırım → Kapanış</div>
            </div>
            <div className="card-pad">
              <Waterfall items={waterfall} width={760} height={230} />
            </div>
          </div>

          <div className="card">
            <div className="card-head">
              <div className="card-title">Aylık Nakit Akışı</div>
              <div className="card-sub">son 12 ay · gelir / gider / net</div>
            </div>
            <div className="card-pad">
              <BarChart data={CASHFLOW_12} width={760} height={220} showNet />
            </div>
          </div>

          <div className="card">
            <div className="card-head">
              <div className="card-title">Reel vs Nominal Getiri</div>
              <div className="card-sub">12 ay endeksli · başlangıç = 100</div>
            </div>
            <div className="card-pad">
              <LineChart series={realVsNomSeries} labels={REAL_VS_NOM.labels} width={760} height={250} />
              <div
                className="row gap-12"
                style={{ marginTop: 8, fontSize: 11, color: "var(--muted-2)", flexWrap: "wrap" }}
              >
                {realVsNomSeries.map((s) => (
                  <span key={s.name} style={{ display: "inline-flex", gap: 6, alignItems: "center" }}>
                    <span style={{ width: 14, height: 2, background: s.color }} /> {s.name}
                  </span>
                ))}
              </div>
            </div>
          </div>
        </div>

        <div className="grid-base" style={{ gap: 16 }}>
          <div className="card">
            <div className="card-head">
              <div className="card-title">Faydalanıcı Dağılımı</div>
              <div className="card-sub">bu ay · gider</div>
            </div>
            <div className="card-pad">
              <Donut
                size={170}
                thickness={26}
                centerLabel="Toplam"
                centerValue={fmt.k(BEN_SPEND.reduce((s, b) => s + b.amount, 0)) + " ₺"}
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
              <div className="card-title">Varlık Dağılımı</div>
              <div className="card-sub">{fmt.k(ALLOCATION.reduce((s, a) => s + a.value, 0))} ₺</div>
            </div>
            <div className="card-pad">
              <Treemap data={ALLOCATION} width={440} height={220} />
            </div>
          </div>

          <div className="card">
            <div className="card-head">
              <div className="card-title">Bu Hafta Top 5 Harcama</div>
            </div>
            <div style={{ padding: "2px 0" }}>
              {TOP_WEEK.map((t, i) => (
                <div
                  key={i}
                  style={{
                    display: "grid",
                    gridTemplateColumns: "40px 1fr auto",
                    gap: 10,
                    padding: "10px 16px",
                    borderTop: i === 0 ? "none" : "1px solid var(--border-soft)",
                    alignItems: "center",
                  }}
                >
                  <div
                    style={{ fontFamily: "var(--font-mono)", fontSize: 11, color: "var(--muted)" }}
                  >
                    {t.date}
                  </div>
                  <div>
                    <div style={{ fontSize: 13, fontWeight: 500 }}>{t.merchant}</div>
                    <div className="row gap-8" style={{ marginTop: 3 }}>
                      <CatChip id={t.cat} size="sm" />
                      <PersonChip id={t.ben} size="sm" />
                    </div>
                  </div>
                  <div style={{ fontFamily: "var(--font-mono)", fontSize: 13, fontWeight: 600 }}>
                    {fmt.tr(t.amount, 2)} ₺
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>
      </div>

      {/* Alt blok — Korelasyon + Sektör + KAP */}
      <div
        className="grid-base"
        style={{ gridTemplateColumns: "1.1fr 1fr 1.3fr", marginBottom: 18 }}
      >
        <div className="card">
          <div className="card-head">
            <div className="card-title">Korelasyon · 90 Gün</div>
            <div className="card-sub">portföydeki varlıklar</div>
          </div>
          <div className="card-pad" style={{ display: "grid", placeItems: "center" }}>
            <Heatmap symbols={CORR_SYMS} matrix={CORR} size={42} />
            <div
              className="row gap-12"
              style={{ marginTop: 12, fontSize: 10, color: "var(--muted)" }}
            >
              <span>
                <span
                  style={{
                    display: "inline-block",
                    width: 10,
                    height: 10,
                    background: "rgb(248,81,73)",
                    borderRadius: 2,
                    marginRight: 4,
                    verticalAlign: "middle",
                  }}
                />{" "}
                -1 (ters)
              </span>
              <span>
                <span
                  style={{
                    display: "inline-block",
                    width: 10,
                    height: 10,
                    background: "rgb(80,40,60)",
                    borderRadius: 2,
                    marginRight: 4,
                    verticalAlign: "middle",
                  }}
                />{" "}
                0
              </span>
              <span>
                <span
                  style={{
                    display: "inline-block",
                    width: 10,
                    height: 10,
                    background: "rgb(35,200,254)",
                    borderRadius: 2,
                    marginRight: 4,
                    verticalAlign: "middle",
                  }}
                />{" "}
                +1 (paralel)
              </span>
            </div>
          </div>
        </div>

        <div className="card">
          <div className="card-head">
            <div className="card-title">Sektör Rotasyonu</div>
            <div className="card-sub">son 1 ay</div>
          </div>
          <div className="card-pad">
            <SectorBars sectors={SECTORS_1M} />
          </div>
        </div>

        <div className="card">
          <div className="card-head">
            <div className="card-title">KAP Akışı</div>
            <div className="card-sub">portföyündeki hisseler · LLM özet</div>
            <span className="chip chip-pos chip-sm" style={{ marginLeft: 8 }}>
              5 yeni
            </span>
          </div>
          <div style={{ padding: "2px 0" }}>
            {KAP_STREAM.map((k, i) => (
              <div
                key={i}
                style={{
                  padding: "10px 16px",
                  borderTop: i === 0 ? "none" : "1px solid var(--border-soft)",
                }}
              >
                <div className="row gap-8" style={{ marginBottom: 4 }}>
                  <span
                    style={{ fontFamily: "var(--font-mono)", fontSize: 11, color: "var(--muted)" }}
                  >
                    {k.time}
                  </span>
                  <span className="chip chip-sm chip-acc">{k.sym}</span>
                  <PolarityBadge kind={k.polarity as "positive" | "neutral" | "negative"} />
                </div>
                <div style={{ fontSize: 13, fontWeight: 500, marginBottom: 2 }}>{k.title}</div>
                <div style={{ fontSize: 12, color: "var(--muted)" }}>{k.summary}</div>
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}

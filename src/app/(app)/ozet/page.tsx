import Link from "next/link";

import { Heatmap } from "@/components/charts/heatmap";
import { SectorBars } from "@/components/charts/sector-bars";
import { Sparkline } from "@/components/charts/sparkline";
import { Treemap } from "@/components/charts/treemap";
import { CatChip, PersonChip, PolarityBadge } from "@/components/ui/chips";
import { Icon } from "@/components/ui/icon";
import { KpiCard } from "@/components/ui/kpi-card";
import { fmt } from "@/lib/finance/fmt";
import {
  ALLOCATION,
  CORR,
  CORR_SYMS,
  HOLDINGS,
  KAP_STREAM,
  KPIS,
  NET_WORTH_SPARK,
  PEOPLE,
  SECTORS_1M,
  TODAY_MOVERS,
  TOP_WEEK,
  TWEETS,
  YEARLY,
} from "@/lib/sample/data";

const HOUSE_PEOPLE = PEOPLE.filter((p) => ["ben", "aburak", "salih"].includes(p.id));

function houseSummary() {
  return HOUSE_PEOPLE.map((p) => {
    const own = HOLDINGS.filter((h) => h.sub === p.id);
    const mv = own.reduce((s, h) => s + h.qty * h.last, 0);
    const cost = own.reduce((s, h) => s + h.qty * h.wac, 0);
    const today = own.reduce((s, h) => s + h.qty * h.last * (h.chgDay / 100), 0);
    return {
      p, mv, cost,
      pl: mv - cost,
      plPct: cost ? ((mv - cost) / cost) * 100 : 0,
      today,
      count: own.length,
    };
  });
}

function genSpark2(income: number, expense: number): number[] {
  const n = income / expense;
  const out: number[] = [];
  let v = 50;
  for (let i = 0; i < 10; i++) {
    v += (n - 1) * 4 + (Math.random() - 0.5) * 4;
    out.push(v);
  }
  return out;
}

interface MoverRow {
  sym: string; name: string; qty: number; wac: number;
  plToday: number; plPct: number; chgDay: number; plTotal: number;
}

function MoverCard({ kind, title, rows }: { kind: "winners" | "losers"; title: string; rows: MoverRow[] }) {
  const pos = kind === "winners";
  return (
    <div className="mover-card">
      <div className="card-head">
        <div className="card-title row gap-8">
          <Icon name={pos ? "arrowUp" : "arrowDown"} size={14} stroke={2.2} style={{ color: pos ? "var(--positive)" : "var(--negative)" }} />
          {title}
        </div>
        <div className="card-sub">{rows.length} pozisyon</div>
      </div>
      {rows.map((r, i) => (
        <div key={i} className="mover-row">
          <div style={{ display: "flex", alignItems: "center" }}>
            <span className="mono" style={{ fontWeight: 600, fontSize: 13 }}>{r.sym}</span>
          </div>
          <div>
            <div style={{ fontSize: 13 }}>{r.name}</div>
            <div className="hint">{r.qty} adet · WAC {fmt.tr(r.wac, r.wac > 1000 ? 0 : 2)}</div>
          </div>
          <div style={{ textAlign: "right" }}>
            <div className="tabular" style={{ fontWeight: 600, color: pos ? "var(--positive)" : "var(--negative)" }}>
              {r.plToday >= 0 ? "+" : ""}{fmt.k(Math.round(r.plToday))} ₺
            </div>
            <div className="hint" style={{ textAlign: "right", fontFamily: "var(--font-mono)" }}>{fmt.pct(r.chgDay)}</div>
          </div>
          <div style={{ textAlign: "right", borderLeft: "1px solid var(--border-soft)", paddingLeft: 10 }}>
            <div className="hint" style={{ fontSize: 10 }}>Toplam K/Z</div>
            <div className="tabular" style={{ fontSize: 12, fontWeight: 600, color: r.plTotal >= 0 ? "var(--positive)" : "var(--negative)" }}>
              {fmt.pct(r.plPct)}
            </div>
          </div>
        </div>
      ))}
    </div>
  );
}

function DeltaCard({ label, value, sub, pos }: { label: string; value: string; sub: string; pos: boolean }) {
  return (
    <div className="kpi" style={{ padding: "12px 14px" }}>
      <div className="kpi-label">{label}</div>
      <div className="kpi-value" style={{ fontSize: 22, color: pos ? "var(--positive)" : "var(--negative)" }}>{value}</div>
      <div className="hint" style={{ marginTop: 2 }}>{sub}</div>
    </div>
  );
}

export default function OzetPage() {
  const summary = houseSummary();

  return (
    <div>
      <div className="page-head">
        <div>
          <div className="page-title">Özet</div>
          <div className="page-sub">Sabah 30 saniyede ne oldu, neye dikkat etmeliyim?</div>
        </div>
        <div className="page-actions">
          <button className="btn"><Icon name="refresh" size={14} /> Yenile <span className="hint" style={{ marginLeft: 4 }}>09:18</span></button>
          <button className="btn btn-prim"><Icon name="plus" size={14} /> İşlem Ekle</button>
        </div>
      </div>

      <div className="grid-base grid-4" style={{ marginBottom: 18 }}>
        <KpiCard
          label="Bugünkü Net Servet Δ"
          value={(KPIS.netWorthDeltaDay >= 0 ? "+" : "") + fmt.try(KPIS.netWorthDeltaDay)}
          delta={fmt.pct(KPIS.netWorthDeltaDayPct)}
          deltaPos={KPIS.netWorthDeltaDay >= 0}
          deltaLabel={`toplam ${fmt.k(KPIS.netWorth)} ₺`}
          spark={NET_WORTH_SPARK}
          sparkColor="var(--accent)"
        />
        <KpiCard
          label="Bugünkü Portföy K/Z"
          value={(KPIS.portfolioToday >= 0 ? "+" : "") + fmt.try(Math.round(KPIS.portfolioToday))}
          delta={fmt.pct(KPIS.portfolioTodayPct)}
          deltaPos={KPIS.portfolioToday >= 0}
          deltaLabel="piyasa kapanışına göre"
          spark={[120000, 140000, 110000, 160000, 130000, 175000, Math.round(KPIS.portfolioToday)]}
          sparkColor={KPIS.portfolioToday >= 0 ? "var(--positive)" : "var(--negative)"}
        />
        <KpiCard
          label="Bu Ay Tasarruf"
          value={"+" + fmt.try(KPIS.cashflowMonth.savings)}
          delta={fmt.pct(KPIS.cashflowMonth.savingsPctChangeMoM)}
          deltaPos
          deltaLabel={`gelir ${fmt.k(KPIS.cashflowMonth.income)} · gider ${fmt.k(KPIS.cashflowMonth.expense)}`}
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
            <div className="row gap-8" style={{ fontFamily: "var(--font-mono)", fontSize: 10, color: "var(--muted)" }}>
              <span>BIST {fmt.pct(KPIS.benchmarks[0].ytd)}</span>
              <span>USD {fmt.pct(KPIS.benchmarks[1].ytd)}</span>
              <span>XAU {fmt.pct(KPIS.benchmarks[2].ytd)}</span>
            </div>
          }
        />
      </div>

      <div className="grid-base grid-2" style={{ marginBottom: 18 }}>
        <MoverCard kind="winners" title="Bugün En Çok Kazandıran" rows={TODAY_MOVERS.winners} />
        <MoverCard kind="losers" title="Bugün En Çok Kaybettiren" rows={TODAY_MOVERS.losers} />
      </div>

      <div className="section-title">
        Hâne Bireyleri — Portföy <small>{HOUSE_PEOPLE.length} kişi · ayarlardan ekle / sil</small>
      </div>
      <div className="grid-base grid-3" style={{ marginBottom: 18 }}>
        {summary.map(({ p, mv, pl, plPct, today, count }) => (
          <div key={p.id} className="house-card">
            <div className="accent-bar" style={{ background: p.color }} />
            <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 10 }}>
              <div className="avatar" style={{ background: p.color, color: "#0a0d14", width: 32, height: 32 }}>{p.name[0]}</div>
              <div style={{ flex: 1 }}>
                <div style={{ fontSize: 14, fontWeight: 600 }}>{p.name}</div>
                <div className="hint">{count} pozisyon · {p.role === "self" ? "kendisi" : "oğul"}</div>
              </div>
              <button className="icon-btn" data-tip="Detay"><Icon name="chev" size={12} /></button>
            </div>
            <div style={{ fontSize: 24, fontWeight: 600, fontFamily: "var(--font-sans)", fontVariantNumeric: "tabular-nums", letterSpacing: "-0.02em" }}>
              {fmt.k(mv)} ₺
            </div>
            <div className="row gap-12" style={{ marginTop: 6, fontSize: 12 }}>
              <span style={{ color: pl >= 0 ? "var(--positive)" : "var(--negative)", fontWeight: 600 }}>
                {pl >= 0 ? "▲" : "▼"} {fmt.pct(plPct)} <span style={{ color: "var(--muted)", fontWeight: 400 }}>toplam K/Z</span>
              </span>
              <span style={{ color: today >= 0 ? "var(--positive)" : "var(--negative)" }}>
                {today >= 0 ? "+" : ""}{fmt.k(Math.round(today))} <span style={{ color: "var(--muted)" }}>bugün</span>
              </span>
            </div>
          </div>
        ))}
      </div>

      <div className="grid-base" style={{ gridTemplateColumns: "1.4fr 1fr", marginBottom: 18 }}>
        <div className="card">
          <div className="card-head">
            <div className="card-title">Yıllık Özet</div>
            <div className="card-sub">son 4 yıl · 2026 YTD</div>
          </div>
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
              {YEARLY.map((y) => (
                <tr key={y.year}>
                  <td>
                    <span className="mono" style={{ fontWeight: 600 }}>{y.year}</span>
                    {y.ytd && <span className="chip chip-sm chip-acc" style={{ marginLeft: 6 }}>YTD</span>}
                  </td>
                  <td className="num tabular" style={{ color: "var(--positive)" }}>+{fmt.k(y.income)}</td>
                  <td className="num tabular" style={{ color: "var(--negative)" }}>−{fmt.k(y.expense)}</td>
                  <td className="num tabular" style={{ fontWeight: 600 }}>{fmt.k(y.net)}</td>
                  <td><Sparkline values={genSpark2(y.income, y.expense)} width={60} height={20} /></td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        <div className="grid-base" style={{ gridTemplateColumns: "1fr", gap: 12 }}>
          <DeltaCard label="YoY Gelir" value={"+" + fmt.pct(21.9)} sub="2025 → 2024" pos />
          <DeltaCard label="YoY Gider" value={"+" + fmt.pct(19.1)} sub="enflasyon altı" pos />
          <DeltaCard label="YoY Net Tasarruf" value={"+" + fmt.pct(26.1)} sub="kazanan tarafa geçiş" pos />
        </div>
      </div>

      <div className="grid-base" style={{ gridTemplateColumns: "1.3fr 1fr", marginBottom: 18 }}>
        <div className="card">
          <div className="card-head">
            <div className="card-title">Bu Hafta En Büyük 5 Gider</div>
            <Link href="/giderler" className="btn btn-ghost btn-sm" style={{ marginLeft: "auto" }}>
              Tümü <Icon name="chev" size={11} />
            </Link>
          </div>
          <table className="dg">
            <thead>
              <tr>
                <th style={{ width: 60 }}>Tarih</th>
                <th>Merchant</th>
                <th>Kategori</th>
                <th>Kişi</th>
                <th className="num">Tutar</th>
              </tr>
            </thead>
            <tbody>
              {TOP_WEEK.map((t, i) => (
                <tr key={i}>
                  <td className="mono" style={{ color: "var(--muted)", fontSize: 11 }}>{t.date}</td>
                  <td style={{ fontWeight: 500 }}>{t.merchant}</td>
                  <td><CatChip id={t.cat} size="sm" /></td>
                  <td><PersonChip id={t.ben} size="sm" /></td>
                  <td className="num tabular" style={{ fontWeight: 600 }}>−{fmt.tr(t.amount, 2)} ₺</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <div className="card">
          <div className="card-head">
            <div className="card-title">Varlık Dağılımı</div>
            <div className="card-sub">{fmt.k(ALLOCATION.reduce((s, a) => s + a.value, 0))} ₺</div>
          </div>
          <div className="card-pad">
            <Treemap data={ALLOCATION} width={420} height={220} />
          </div>
        </div>
      </div>

      <div className="grid-base" style={{ gridTemplateColumns: "1fr 1fr 1.3fr", marginBottom: 18 }}>
        <div className="card">
          <div className="card-head">
            <div className="card-title">Korelasyon · 90 Gün</div>
            <div className="card-sub">portföy varlıkları</div>
          </div>
          <div className="card-pad" style={{ display: "grid", placeItems: "center" }}>
            <Heatmap symbols={CORR_SYMS} matrix={CORR} size={40} />
          </div>
        </div>

        <div className="card">
          <div className="card-head">
            <div className="card-title">Sektör Rotasyonu</div>
            <div className="card-sub">son 1 ay</div>
          </div>
          <div className="card-pad">
            <SectorBars sectors={SECTORS_1M.slice(0, 7)} />
          </div>
        </div>

        <div className="card">
          <div className="card-head">
            <div className="card-title">KAP Akışı</div>
            <div className="card-sub">portföy + LLM özet</div>
            <span className="chip chip-pos chip-sm" style={{ marginLeft: 8 }}>5 yeni</span>
          </div>
          <div style={{ padding: "2px 0" }}>
            {KAP_STREAM.map((k, i) => (
              <div key={i} style={{ padding: "10px 16px", borderTop: i === 0 ? "none" : "1px solid var(--border-soft)" }}>
                <div className="row gap-8" style={{ marginBottom: 4 }}>
                  <span style={{ fontFamily: "var(--font-mono)", fontSize: 11, color: "var(--muted)" }}>{k.time}</span>
                  <span className="chip chip-sm chip-acc">{k.sym}</span>
                  <PolarityBadge kind={k.polarity} />
                </div>
                <div style={{ fontSize: 13, fontWeight: 500, marginBottom: 2 }}>{k.title}</div>
                <div style={{ fontSize: 12, color: "var(--muted)" }}>{k.summary}</div>
              </div>
            ))}
          </div>
        </div>
      </div>

      <div className="card">
        <div className="card-head">
          <div className="card-title row gap-8"><Icon name="twitter" size={14} /> Cashtag Akışı</div>
          <div className="card-sub">portföydeki sembollere ait son gönderiler · doğrulanmış hesap filtresi açık</div>
          <div className="row gap-8" style={{ marginLeft: "auto" }}>
            <span className="chip chip-sm">$ASELS</span>
            <span className="chip chip-sm">$THYAO</span>
            <span className="chip chip-sm">$TUPRS</span>
            <span className="chip chip-sm">$KOZAL</span>
          </div>
        </div>
        <div className="grid-base grid-2" style={{ gap: 0 }}>
          {TWEETS.map((t, i) => (
            <div
              key={i}
              style={{
                padding: "12px 16px",
                borderTop: "1px solid var(--border-soft)",
                borderRight: i % 2 === 0 ? "1px solid var(--border-soft)" : "none",
              }}
            >
              <div className="row gap-8" style={{ marginBottom: 4 }}>
                <span style={{ fontWeight: 600, fontSize: 13 }}>{t.handle}</span>
                {t.verified && <span data-tip="Doğrulanmış" style={{ color: "var(--accent)", fontSize: 12 }}>✓</span>}
                <span className="chip chip-sm chip-acc">{t.sym}</span>
                <span className="hint" style={{ marginLeft: "auto" }}>{t.time}</span>
              </div>
              <div style={{ fontSize: 13, color: "var(--fg-soft)" }}>{t.text}</div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

"use client";

import Link from "next/link";
import { useMemo, useState } from "react";

import { Donut } from "@/components/charts/donut";
import { LineChart } from "@/components/charts/line-chart";
import { Sparkline } from "@/components/charts/sparkline";
import { Icon } from "@/components/ui/icon";
import { KpiCard } from "@/components/ui/kpi-card";
import { W52Band } from "@/components/ui/chips";
import { fmt } from "@/lib/finance/fmt";
import { HOLDINGS, KPIS, PEOPLE, REAL_VS_NOM, type Holding } from "@/lib/sample/data";

interface EnrichedRow extends Holding {
  mv: number;
  cost: number;
  plUnreal: number;
  plPct: number;
  plToday: number;
}

function genFakeSpark(dir: 1 | -1 = 1): number[] {
  const out: number[] = [];
  let v = 50;
  for (let i = 0; i < 24; i++) {
    v += dir * (0.6 + Math.random() * 0.8) + (Math.random() - 0.5) * 1.4;
    out.push(v);
  }
  return out;
}

export default function YatirimlarPage() {
  const [sub, setSub] = useState<string>("all");

  const rows: EnrichedRow[] = useMemo(
    () =>
      HOLDINGS.filter((h) => sub === "all" || h.sub === sub).map((h) => ({
        ...h,
        mv: h.qty * h.last,
        cost: h.qty * h.wac,
        plUnreal: h.qty * (h.last - h.wac),
        plPct: ((h.last - h.wac) / h.wac) * 100,
        plToday: h.qty * h.last * (h.chgDay / 100),
      })),
    [sub],
  );

  const totals = rows.reduce(
    (acc, r) => {
      acc.mv += r.mv; acc.cost += r.cost; acc.pl += r.plUnreal; acc.today += r.plToday;
      return acc;
    },
    { mv: 0, cost: 0, pl: 0, today: 0 },
  );

  const peopleWithHoldings = PEOPLE.filter((p) => HOLDINGS.some((h) => h.sub === p.id));

  const grouped = useMemo(() => {
    const map: Record<string, Record<string, EnrichedRow[]>> = {};
    rows.forEach((r) => {
      if (!map[r.sub]) map[r.sub] = {};
      if (!map[r.sub][r.custody]) map[r.sub][r.custody] = [];
      map[r.sub][r.custody].push(r);
    });
    return map;
  }, [rows]);

  const klassColors: Record<string, string> = { BIST: "#6ea8fe", FX: "#4cc9b0", Altın: "#d4a056", Kripto: "#b388f2" };
  const custodyColors: Record<string, string> = {
    Midas: "#6ea8fe",
    "Garanti BBVA": "#4cc9b0",
    "Garanti Kripto": "#b388f2",
    Kasa: "#d4a056",
  };

  const klassDonut = (() => {
    const m: Record<string, number> = {};
    rows.forEach((r) => { m[r.klass] = (m[r.klass] ?? 0) + r.mv; });
    return Object.entries(m).map(([k, v]) => ({ label: k, value: v, color: klassColors[k] ?? "#7d8699" }));
  })();
  const custodyDonut = (() => {
    const m: Record<string, number> = {};
    rows.forEach((r) => { m[r.custody] = (m[r.custody] ?? 0) + r.mv; });
    return Object.entries(m).map(([k, v]) => ({ label: k, value: v, color: custodyColors[k] ?? "#7d8699" }));
  })();

  return (
    <div>
      <div className="page-head">
        <div>
          <div className="page-title">Yatırımlar</div>
          <div className="page-sub">Neyim var, ne kazandırıyor, reel mi?</div>
        </div>
        <div className="page-actions">
          <button className="btn"><Icon name="download" size={14} /> CSV</button>
          <Link href="/islemler" className="btn btn-prim">
            <Icon name="plus" size={14} /> Yeni İşlem
          </Link>
        </div>
      </div>

      <div className="tabs" style={{ marginBottom: 18 }}>
        <button className={`tab ${sub === "all" ? "active" : ""}`} onClick={() => setSub("all")}>
          Tümü <span className="count">{HOLDINGS.length}</span>
        </button>
        {peopleWithHoldings.map((p) => (
          <button key={p.id} className={`tab ${sub === p.id ? "active" : ""}`} onClick={() => setSub(p.id)}>
            <span
              className="chip-dot"
              style={{ background: p.color, display: "inline-block", width: 8, height: 8, borderRadius: 50, marginRight: 6 }}
            />
            {p.name} <span className="count">{HOLDINGS.filter((h) => h.sub === p.id).length}</span>
          </button>
        ))}
      </div>

      <div className="grid-base" style={{ gridTemplateColumns: "repeat(6,1fr)", marginBottom: 18 }}>
        <KpiCard label="Toplam Değer" value={fmt.try(totals.mv)} delta={fmt.pct((totals.pl / totals.cost) * 100)} deltaPos={totals.pl >= 0} />
        <KpiCard label="Toplam Maliyet" value={fmt.try(totals.cost)} deltaLabel="WAC × adet" />
        <KpiCard
          label="Bekleyen K/Z"
          value={(totals.pl >= 0 ? "+" : "") + fmt.k(totals.pl) + " ₺"}
          delta={fmt.pct((totals.pl / totals.cost) * 100)}
          deltaPos={totals.pl >= 0}
        />
        <KpiCard label="Getiri Oranı" value={fmt.pct((totals.pl / totals.cost) * 100)} deltaPos={totals.pl >= 0} deltaLabel="kümülatif" />
        <KpiCard
          label="Bugün K/Z"
          value={(totals.today >= 0 ? "+" : "") + fmt.k(Math.round(totals.today)) + " ₺"}
          delta={fmt.pct((totals.today / totals.mv) * 100)}
          deltaPos={totals.today >= 0}
        />
        <KpiCard label="Max Drawdown" value={fmt.pct(-8.4)} deltaPos={false} deltaLabel="son 12 ay" />
      </div>

      {Object.entries(grouped).map(([personId, byCustody]) => {
        const person = PEOPLE.find((p) => p.id === personId);
        if (!person) return null;
        const allRows = Object.values(byCustody).flat();
        const personMV = allRows.reduce((s, r) => s + r.mv, 0);
        const personPL = allRows.reduce((s, r) => s + r.plUnreal, 0);
        return (
          <div key={personId} style={{ marginBottom: 18 }}>
            <div style={{ display: "flex", alignItems: "baseline", gap: 10, marginBottom: 8, padding: "0 4px" }}>
              <span className="chip-dot" style={{ background: person.color, width: 10, height: 10 }} />
              <span style={{ fontSize: 14, fontWeight: 700 }}>{person.name}&apos;in Portföyü</span>
              <span className="hint">{allRows.length} pozisyon</span>
              <span className="spacer" />
              <span className="hint">
                T: <span className="tabular" style={{ color: "var(--fg)", fontWeight: 600 }}>{fmt.k(personMV)} ₺</span>
              </span>
              <span className="hint">
                · K/Z:{" "}
                <span className="tabular" style={{ color: personPL >= 0 ? "var(--positive)" : "var(--negative)", fontWeight: 600 }}>
                  {personPL >= 0 ? "+" : ""}{fmt.k(personPL)} ₺
                </span>
              </span>
            </div>

            {Object.entries(byCustody).map(([custody, custodyRows]) => (
              <div key={custody} className="card" style={{ marginBottom: 8 }}>
                <div className="card-head" style={{ padding: "10px 16px" }}>
                  <div style={{ fontSize: 12, fontWeight: 600, color: "var(--fg-soft)" }}>{custody}</div>
                  <span className="hint" style={{ marginLeft: 8 }}>{custodyRows.length} pozisyon</span>
                  <span className="spacer" />
                  <span className="hint">{fmt.k(custodyRows.reduce((s, r) => s + r.mv, 0))} ₺</span>
                </div>
                <table className="dg">
                  <thead>
                    <tr>
                      <th style={{ width: 90 }}>Sembol</th>
                      <th>Ad / Sektör</th>
                      <th className="num">Adet</th>
                      <th className="num">Fiyat</th>
                      <th className="num">Günlük %</th>
                      <th className="num">WAC</th>
                      <th className="num">Değer</th>
                      <th className="num">K/Z (₺)</th>
                      <th className="num">K/Z (%)</th>
                      <th style={{ width: 120 }}>52H</th>
                      <th>30g</th>
                    </tr>
                  </thead>
                  <tbody>
                    {custodyRows.map((r, i) => (
                      <tr key={i}>
                        <td className="mono" style={{ fontWeight: 600 }}>
                          {r.sym}{" "}
                          <span className="hint" style={{ fontWeight: 400 }}>
                            ({r.qty.toLocaleString("tr-TR", { maximumFractionDigits: r.klass === "Kripto" ? 4 : 0 })})
                          </span>
                        </td>
                        <td>
                          <div style={{ fontSize: 13 }}>{r.name}</div>
                          <div className="hint">{r.sector}</div>
                        </td>
                        <td className="num tabular">
                          {r.qty.toLocaleString("tr-TR", { maximumFractionDigits: r.klass === "Kripto" ? 4 : 0 })}
                        </td>
                        <td className="num tabular" style={{ fontWeight: 600 }}>{fmt.tr(r.last, r.last > 1000 ? 0 : 2)}</td>
                        <td
                          className="num tabular"
                          style={{ color: r.chgDay >= 0 ? "var(--positive)" : "var(--negative)", fontWeight: 600 }}
                        >
                          {fmt.pct(r.chgDay)}
                        </td>
                        <td className="num tabular">{fmt.tr(r.wac, r.wac > 1000 ? 0 : 2)}</td>
                        <td className="num tabular" style={{ fontWeight: 600 }}>{fmt.k(r.mv)} ₺</td>
                        <td
                          className="num tabular"
                          style={{ color: r.plUnreal >= 0 ? "var(--positive)" : "var(--negative)" }}
                        >
                          {r.plUnreal >= 0 ? "+" : ""}{fmt.k(r.plUnreal)}
                        </td>
                        <td
                          className="num tabular"
                          style={{ color: r.plPct >= 0 ? "var(--positive)" : "var(--negative)", fontWeight: 600 }}
                        >
                          {fmt.pct(r.plPct)}
                        </td>
                        <td><W52Band low={r.w52l} high={r.w52h} last={r.last} /></td>
                        <td><Sparkline values={genFakeSpark(r.sparkDir)} width={60} height={20} /></td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            ))}
          </div>
        );
      })}

      <div className="grid-base grid-3" style={{ gap: 16, marginTop: 18 }}>
        <div className="card">
          <div className="card-head"><div className="card-title">Sınıf Dağılımı</div></div>
          <div className="card-pad">
            <Donut data={klassDonut} size={170} thickness={26} centerLabel="Sınıf" centerValue={fmt.k(totals.mv) + " ₺"} />
          </div>
        </div>
        <div className="card">
          <div className="card-head"><div className="card-title">Saklama Yeri</div></div>
          <div className="card-pad">
            <Donut data={custodyDonut} size={170} thickness={26} centerLabel="Lokasyon" centerValue={fmt.k(totals.mv) + " ₺"} />
          </div>
        </div>
        <div className="card">
          <div className="card-head"><div className="card-title">Reel vs Nominal</div></div>
          <div className="card-pad">
            <LineChart
              labels={REAL_VS_NOM.labels}
              series={[
                { name: "Portföy Nom.", values: REAL_VS_NOM.port, color: "var(--accent)", strong: true },
                { name: "TÜFE", values: REAL_VS_NOM.cpi, color: "var(--negative)", dash: "4 2" },
              ]}
              width={420}
              height={170}
            />
            <div className="hint" style={{ marginTop: 8 }}>
              portföy {fmt.pct(KPIS.portfolioNominalYTD)} nominal · {fmt.pct(KPIS.portfolioRealYTD)} reel
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

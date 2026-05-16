"use client";

import { useMemo, useState } from "react";

import { Sparkline } from "@/components/charts/sparkline";
import { Treemap } from "@/components/charts/treemap";
import { Icon } from "@/components/ui/icon";
import { KpiCard } from "@/components/ui/kpi-card";
import { W52Band } from "@/components/ui/chips";
import { fmt } from "@/lib/finance/fmt";
import {
  ALLOCATION,
  HOLDINGS,
  KPIS,
  PEOPLE,
  TRADES,
  type Holding,
} from "@/lib/sample/data";

type SubTab = "positions" | "trades" | "allocation";

const personOptions = [
  { id: "all", name: "Tümü", color: "var(--accent)" },
  ...PEOPLE.filter((p) => p.role === "self" || p.role === "son" || p.role === "spouse"),
];

function fakeSpark(h: Holding) {
  const arr: number[] = [];
  let v = h.wac;
  const step = (h.last - h.wac) / 20;
  for (let i = 0; i < 20; i++) {
    v += step + (Math.sin(i + h.sym.length) * 0.01) * h.wac;
    arr.push(v);
  }
  arr[19] = h.last;
  return arr;
}

export default function WealthPage() {
  const [tab, setTab] = useState<SubTab>("positions");
  const [person, setPerson] = useState<string>("all");

  const holdings = useMemo(
    () => (person === "all" ? HOLDINGS : HOLDINGS.filter((h) => h.sub === person)),
    [person],
  );
  const trades = useMemo(
    () => (person === "all" ? TRADES : TRADES.filter((t) => t.sub === person)),
    [person],
  );

  const mv = holdings.reduce((s, h) => s + h.qty * h.last, 0);
  const cb = holdings.reduce((s, h) => s + h.qty * h.wac, 0);
  const pnl = mv - cb;
  const pnlPct = cb > 0 ? (pnl / cb) * 100 : 0;
  const todayPnl = holdings.reduce((s, h) => s + (h.last - (h.prev ?? h.last)) * h.qty, 0);
  const realizedYTD = trades
    .filter((t) => t.side === "sell")
    .reduce((s, t) => {
      const h = HOLDINGS.find((x) => x.sym === t.sym);
      const wac = h?.wac ?? t.price;
      return s + (t.price - wac) * t.qty - t.fees;
    }, 0);

  return (
    <div>
      <div className="page-head">
        <div>
          <div className="page-title">Varlık Yönetimi</div>
          <div className="page-sub">Hisse · Döviz · Altın · Kripto. Ağırlıklı maliyet ve reel getiri tek panelde.</div>
        </div>
        <div className="page-actions">
          <button className="btn">
            <Icon name="download" size={14} /> CSV
          </button>
          <button className="btn btn-prim">
            <Icon name="plus" size={14} /> Yeni İşlem (Alım/Satım)
          </button>
        </div>
      </div>

      {/* Hane bireyi seçici (dinamik) */}
      <div className="tabs" style={{ marginBottom: 16 }}>
        {personOptions.map((p) => (
          <button
            key={p.id}
            className={`tab ${person === p.id ? "active" : ""}`}
            onClick={() => setPerson(p.id)}
          >
            {p.name}
            <span className="count">{HOLDINGS.filter((h) => p.id === "all" || h.sub === p.id).length}</span>
          </button>
        ))}
      </div>

      {/* KPI */}
      <div className="grid-base grid-4" style={{ marginBottom: 18 }}>
        <KpiCard label="Toplam Değer" value={fmt.try(mv)} delta={fmt.pct(KPIS.portfolioNominalYTD)} deltaPos deltaLabel="YTD nominal" />
        <KpiCard
          label="Bugünkü K/Z"
          value={`${todayPnl >= 0 ? "+" : ""}${fmt.try(todayPnl)}`}
          delta={fmt.pct((todayPnl / mv) * 100)}
          deltaPos={todayPnl >= 0}
        />
        <KpiCard
          label="Bekleyen K/Z"
          value={`${pnl >= 0 ? "+" : ""}${fmt.try(pnl)}`}
          delta={fmt.pct(pnlPct)}
          deltaPos={pnl >= 0}
          deltaLabel={`maliyet ${fmt.k(cb)} ₺`}
        />
        <KpiCard
          label="Realize K/Z (YTD)"
          value={`${realizedYTD >= 0 ? "+" : ""}${fmt.try(realizedYTD)}`}
          delta={`${trades.filter((t) => t.side === "sell").length} satış`}
          deltaPos={realizedYTD >= 0}
        />
      </div>

      {/* Sub-tabs */}
      <div className="tabs" style={{ marginBottom: 16 }}>
        <button className={`tab ${tab === "positions" ? "active" : ""}`} onClick={() => setTab("positions")}>
          Pozisyonlar <span className="count">{holdings.length}</span>
        </button>
        <button className={`tab ${tab === "trades" ? "active" : ""}`} onClick={() => setTab("trades")}>
          İşlemler <span className="count">{trades.length}</span>
        </button>
        <button className={`tab ${tab === "allocation" ? "active" : ""}`} onClick={() => setTab("allocation")}>
          Dağılım
        </button>
      </div>

      {tab === "positions" && (
        <div className="card">
          <table className="dg">
            <thead>
              <tr>
                <th>Sembol</th>
                <th>Sınıf</th>
                <th>Kişi</th>
                <th>Saklama</th>
                <th className="num">Adet</th>
                <th className="num">WAC</th>
                <th className="num">Son</th>
                <th className="num">Değer</th>
                <th className="num">Bek. K/Z</th>
                <th className="num">Bugün</th>
                <th>52H Bandı</th>
                <th>Trend</th>
              </tr>
            </thead>
            <tbody>
              {holdings.map((h) => {
                const value = h.qty * h.last;
                const pnl = value - h.qty * h.wac;
                const pnlPct = ((h.last - h.wac) / h.wac) * 100;
                const today = (h.last - (h.prev ?? h.last)) * h.qty;
                const todayPct = h.prev ? (h.last / h.prev - 1) * 100 : 0;
                return (
                  <tr key={h.sym + h.sub}>
                    <td style={{ fontWeight: 600 }}>{h.sym}</td>
                    <td>
                      <span className="chip chip-sm">{h.klass}</span>
                    </td>
                    <td className="hint">{PEOPLE.find((p) => p.id === h.sub)?.name ?? "—"}</td>
                    <td className="hint">{h.custody}</td>
                    <td className="num tabular">{fmt.tr(h.qty, h.qty < 10 ? 4 : 0)}</td>
                    <td className="num tabular">{fmt.tr(h.wac, 2)}</td>
                    <td className="num tabular">{fmt.tr(h.last, 2)}</td>
                    <td className="num tabular" style={{ fontWeight: 600 }}>
                      {fmt.k(value)} ₺
                    </td>
                    <td className={`num tabular ${pnl >= 0 ? "delta-pos" : "delta-neg"}`}>
                      <div>{fmt.k(pnl)}</div>
                      <div style={{ fontSize: 10, opacity: 0.8 }}>{fmt.pct(pnlPct)}</div>
                    </td>
                    <td className={`num tabular ${today >= 0 ? "delta-pos" : "delta-neg"}`}>
                      <div>{fmt.k(today)}</div>
                      <div style={{ fontSize: 10, opacity: 0.8 }}>{fmt.pct(todayPct)}</div>
                    </td>
                    <td>
                      <W52Band low={h.w52l} high={h.w52h} last={h.last} />
                    </td>
                    <td>
                      <Sparkline values={fakeSpark(h)} width={70} height={22} />
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}

      {tab === "trades" && (
        <div className="card">
          <div className="card-head">
            <div className="card-title">İşlem Geçmişi</div>
            <div className="card-sub">alım / satım defteri — çocukların işlemleri dahil</div>
          </div>
          <table className="dg">
            <thead>
              <tr>
                <th>Tarih</th>
                <th>Sembol</th>
                <th>Kişi</th>
                <th>Saklama</th>
                <th>Yön</th>
                <th className="num">Adet</th>
                <th className="num">Fiyat</th>
                <th className="num">Tutar</th>
                <th className="num">Komisyon</th>
                <th>Realize K/Z</th>
                <th>Not</th>
              </tr>
            </thead>
            <tbody>
              {trades.map((t) => {
                const total = t.qty * t.price;
                const h = HOLDINGS.find((x) => x.sym === t.sym);
                const realized =
                  t.side === "sell" && h ? (t.price - h.wac) * t.qty - t.fees : null;
                return (
                  <tr key={t.id}>
                    <td className="tabular hint">{t.date}</td>
                    <td style={{ fontWeight: 600 }}>{t.sym}</td>
                    <td className="hint">{PEOPLE.find((p) => p.id === t.sub)?.name ?? "—"}</td>
                    <td className="hint">{t.custody}</td>
                    <td>
                      <span className={`chip chip-sm ${t.side === "buy" ? "chip-pos" : "chip-neg"}`}>
                        {t.side === "buy" ? "AL" : "SAT"}
                      </span>
                    </td>
                    <td className="num tabular">{fmt.tr(t.qty, t.qty < 10 ? 4 : 0)}</td>
                    <td className="num tabular">{fmt.tr(t.price, 2)}</td>
                    <td className="num tabular" style={{ fontWeight: 600 }}>
                      {fmt.try(total)}
                    </td>
                    <td className="num tabular hint">{fmt.tr(t.fees, 2)}</td>
                    <td className={`tabular ${realized != null ? (realized >= 0 ? "delta-pos" : "delta-neg") : "hint"}`}>
                      {realized != null ? `${realized >= 0 ? "+" : ""}${fmt.k(realized)} ₺` : "—"}
                    </td>
                    <td className="hint">{t.notes ?? "—"}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}

      {tab === "allocation" && (
        <div className="grid-base grid-2">
          <div className="card">
            <div className="card-head">
              <div className="card-title">Varlık Sınıfı Dağılımı</div>
            </div>
            <div className="card-pad">
              <Treemap data={ALLOCATION} width={500} height={300} />
            </div>
          </div>
          <div className="card">
            <div className="card-head">
              <div className="card-title">Saklama Yeri</div>
              <div className="card-sub">Midas · Garanti · Kasa · Garanti Kripto</div>
            </div>
            <div className="card-pad" style={{ display: "grid", gap: 8 }}>
              {Object.entries(
                holdings.reduce<Record<string, number>>((acc, h) => {
                  acc[h.custody] = (acc[h.custody] ?? 0) + h.qty * h.last;
                  return acc;
                }, {}),
              )
                .sort((a, b) => b[1] - a[1])
                .map(([cust, val]) => {
                  const pct = (val / mv) * 100;
                  return (
                    <div
                      key={cust}
                      style={{
                        display: "grid",
                        gridTemplateColumns: "160px 1fr 80px 60px",
                        gap: 10,
                        alignItems: "center",
                        fontSize: 13,
                      }}
                    >
                      <span style={{ fontWeight: 500 }}>{cust}</span>
                      <div className="bar" style={{ height: 8 }}>
                        <span style={{ width: `${pct}%`, background: "var(--accent)" }} />
                      </div>
                      <span className="tabular" style={{ textAlign: "right" }}>
                        {fmt.k(val)} ₺
                      </span>
                      <span className="tabular hint" style={{ textAlign: "right" }}>
                        {pct.toFixed(1)}%
                      </span>
                    </div>
                  );
                })}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

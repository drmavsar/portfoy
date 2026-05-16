"use client";

import { useState } from "react";

import { PersonChip } from "@/components/ui/chips";
import { Icon } from "@/components/ui/icon";
import { KpiCard } from "@/components/ui/kpi-card";
import { fmt } from "@/lib/finance/fmt";
import { HOLDINGS, PEOPLE, TRADES } from "@/lib/sample/data";

import { NewTradeModal } from "./new-trade-modal";

export default function IslemlerPage() {
  const [modalOpen, setModalOpen] = useState(false);
  const [side, setSide] = useState<"all" | "BUY" | "SELL">("all");
  const trades = TRADES.filter((t) => side === "all" || t.side === side);

  const realizeYTD = TRADES.filter((t) => t.realize !== null).reduce((s, t) => s + (t.realize ?? 0), 0);

  return (
    <div>
      <div className="page-head">
        <div>
          <div className="page-title">İşlemler</div>
          <div className="page-sub">Al/sat defteri. Her işlem bir lot oluşturur, WAC otomatik hesaplanır.</div>
        </div>
        <div className="page-actions">
          <button className="btn"><Icon name="download" size={14} /> CSV</button>
          <button className="btn btn-prim" onClick={() => setModalOpen(true)}>
            <Icon name="plus" size={14} /> Yeni İşlem
          </button>
        </div>
      </div>

      <div className="grid-base grid-4" style={{ marginBottom: 18 }}>
        <KpiCard label="Toplam İşlem" value={String(TRADES.length)} deltaLabel="son 12 ay" />
        <KpiCard
          label="Bu Ay İşlem"
          value={String(TRADES.filter((t) => t.date.endsWith("05.2026")).length)}
          delta="+2"
          deltaPos
          deltaLabel="son hafta"
        />
        <KpiCard
          label="Realize K/Z (YTD)"
          value={(realizeYTD >= 0 ? "+" : "") + fmt.k(realizeYTD) + " ₺"}
          deltaPos={realizeYTD >= 0}
          delta="kapanan pozisyonlar"
        />
        <KpiCard
          label="Ort. İşlem Büyüklüğü"
          value={fmt.k(TRADES.reduce((s, t) => s + t.qty * t.price, 0) / TRADES.length) + " ₺"}
          deltaLabel="komisyon hariç"
        />
      </div>

      <div className="card" style={{ marginBottom: 16 }}>
        <div style={{ padding: 12, display: "flex", flexWrap: "wrap", alignItems: "center", gap: 10 }}>
          <div className="row gap-8">
            <span className="hint">Yön:</span>
            {(
              [
                ["all", "Tümü"],
                ["BUY", "Alış"],
                ["SELL", "Satış"],
              ] as const
            ).map(([k, l]) => (
              <button
                key={k}
                className="btn btn-sm"
                onClick={() => setSide(k)}
                style={side === k ? { background: "var(--accent-soft)", color: "var(--accent)", borderColor: "transparent" } : undefined}
              >
                {l}
              </button>
            ))}
          </div>
          <span style={{ width: 1, height: 20, background: "var(--border)" }} />
          <div className="row gap-8">
            <span className="hint">Kişi:</span>
            {PEOPLE.filter((p) => HOLDINGS.some((h) => h.sub === p.id)).map((p) => (
              <span key={p.id} className="chip chip-sm" style={{ cursor: "pointer" }}>
                <span className="chip-dot" style={{ background: p.color }} />
                {p.name}
              </span>
            ))}
          </div>
          <span className="spacer" />
          <div className="search" style={{ width: 200 }}>
            <Icon name="search" size={12} />
            <input placeholder="Sembol ara" />
          </div>
        </div>
      </div>

      <div className="card">
        <table className="dg">
          <thead>
            <tr>
              <th style={{ width: 80 }}>Tarih</th>
              <th style={{ width: 80 }}>Sembol</th>
              <th>Kişi</th>
              <th>Saklama</th>
              <th className="center">Yön</th>
              <th className="num">Adet</th>
              <th className="num">Fiyat</th>
              <th className="num">Tutar</th>
              <th className="num">Komisyon</th>
              <th className="num">Realize K/Z</th>
              <th>Not</th>
            </tr>
          </thead>
          <tbody>
            {trades.map((t, i) => (
              <tr key={i}>
                <td className="mono" style={{ color: "var(--muted)", fontSize: 11 }}>{t.date}</td>
                <td className="mono" style={{ fontWeight: 600 }}>{t.sym}</td>
                <td><PersonChip id={t.ben} /></td>
                <td><span className="chip chip-sm">{t.custody}</span></td>
                <td className="center">
                  <span
                    className="chip chip-sm"
                    style={{
                      background: t.side === "BUY" ? "var(--positive-soft)" : "var(--negative-soft)",
                      color: t.side === "BUY" ? "var(--positive)" : "var(--negative)",
                      borderColor: "transparent",
                      fontWeight: 600,
                    }}
                  >
                    {t.side === "BUY" ? "ALIŞ" : "SATIŞ"}
                  </span>
                </td>
                <td className="num tabular">{t.qty}</td>
                <td className="num tabular">{fmt.tr(t.price, t.price > 1000 ? 0 : 2)}</td>
                <td className="num tabular" style={{ fontWeight: 600 }}>{fmt.k(t.qty * t.price)} ₺</td>
                <td className="num tabular" style={{ color: "var(--muted)" }}>{t.comm.toFixed(2)}</td>
                <td
                  className="num tabular"
                  style={{
                    color:
                      t.realize === null
                        ? "var(--muted-2)"
                        : t.realize > 0
                          ? "var(--positive)"
                          : t.realize < 0
                            ? "var(--negative)"
                            : "var(--muted-2)",
                    fontWeight: t.realize !== null ? 600 : 400,
                  }}
                >
                  {t.realize !== null ? (t.realize > 0 ? "+" : "") + fmt.k(t.realize) + " ₺" : "—"}
                </td>
                <td style={{ fontSize: 12, color: "var(--muted)" }}>{t.note || "—"}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {modalOpen && <NewTradeModal onClose={() => setModalOpen(false)} />}
    </div>
  );
}

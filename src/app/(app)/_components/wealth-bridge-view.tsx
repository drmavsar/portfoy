"use client";

import Link from "next/link";
import { useState } from "react";

import { bridgeVerdict, type BridgeParts, type BridgeWindow } from "@/app/(app)/_lib/wealth-bridge";
import type { BridgePeriod, WealthBridgeReport } from "@/app/(app)/_lib/wealth-bridge-actions";
import { fmt } from "@/lib/finance/fmt";

import "./wealth-bridge.css";

const MONTHS = ["Oca", "Şub", "Mar", "Nis", "May", "Haz", "Tem", "Ağu", "Eyl", "Eki", "Kas", "Ara"];

export function money(n: number): string {
  return `${fmt.tr(n, 0)} ₺`;
}

export function signedMoney(n: number): string {
  if (Math.abs(n) < 0.5) return "0 ₺";
  return `${n > 0 ? "+" : "−"}${fmt.tr(Math.abs(n), 0)} ₺`;
}

export function trDate(iso: string): string {
  const [y, m, d] = iso.split("-").map(Number);
  return `${d} ${MONTHS[m - 1]} ${y}`;
}

export const BRIDGE_PARTS: Array<{ key: keyof BridgeParts; label: string; hint: string }> = [
  { key: "savings", label: "Net tasarruf", hint: "Gelir − gider (temettü hariç)" },
  { key: "invest", label: "Hisse ve fon", hint: "Fiyat değişimi ve temettü; alım-satım tutarları sayılmaz" },
  { key: "fx", label: "Döviz kuru", hint: "Döviz hesaplarının kur değişimi (USD/TRY ile)" },
  { key: "metal", label: "Altın", hint: "Altın hesaplarının gram fiyatı değişimi" },
  { key: "other", label: "Diğer", hint: "Kayda girmemiş gelir-gider, faiz, bakiye düzeltmesi, kart zamanlaması" },
  { key: "untracked", label: "Takip öncesi piyasa ve diğer", hint: "Günlük servet kaydı başlamadan önce; sınıflara ayrılamıyor" },
];

/** Tek cümlelik sonuç. Sayılardan sonra ek kullanılmaz (₺53'ü / %50'si gibi ek uyumu sorunlu). */
export function BridgeVerdict({ window: w }: { window: BridgeWindow }) {
  const v = bridgeVerdict(w);
  const up = w.delta >= 0;
  let text: React.ReactNode;
  if (v.kind === "both-up") {
    const s = v.savingsShare ?? 0;
    text = (
      <>
        Servetin <b>{money(w.delta)}</b> arttı. Kaynağı: tasarruf <b>%{fmt.tr(s * 100, 0)}</b>, yatırım ve
        piyasa <b>%{fmt.tr((1 - s) * 100, 0)}</b>.
      </>
    );
  } else if (v.kind === "savings-carried") {
    text = up ? (
      <>
        Artışın tamamı tasarruftan: <b>{money(v.savings)}</b> biriktirdin, yatırım ve piyasa{" "}
        <b>{money(-v.market)}</b> geri götürdü.
      </>
    ) : (
      <>
        <b>{money(v.savings)}</b> biriktirmene rağmen servet <b>{money(-w.delta)}</b> azaldı; yatırım ve piyasa etkisi{" "}
        <b>{signedMoney(v.market)}</b>.
      </>
    );
  } else if (v.kind === "market-carried") {
    text = up ? (
      <>
        Harcamalar gelirini <b>{money(-v.savings)}</b> aştı; servetteki <b>{signedMoney(w.delta)}</b> değişimi yatırım ve
        piyasa getirdi.
      </>
    ) : (
      <>
        Harcamalar gelirini <b>{money(-v.savings)}</b> aştı; yatırım ve piyasa etkisi <b>{signedMoney(v.market)}</b>{" "}
        oldu ve servet <b>{money(-w.delta)}</b> azaldı.
      </>
    );
  } else {
    text = (
      <>
        Hem harcamalar gelirini aştı (<b>{signedMoney(v.savings)}</b>) hem yatırım ve piyasa etkisi negatif oldu (
        <b>{signedMoney(v.market)}</b>).
      </>
    );
  }
  const untracked = w.parts.untracked;
  return (
    <p className="bridge-verdict">
      {text}
      {Math.abs(untracked) >= 1 && (
        <>
          {" "}
          Yatırım ve piyasa kısmının <b>{signedMoney(untracked)}</b> tutarı günlük kayıt başlamadan önceki döneme ait;
          hisse, döviz ve altın olarak ayrılamıyor.
        </>
      )}
    </p>
  );
}

/** Sıfırdan sapan yatay çubuklar: artı sağa, eksi sola; tutar her zaman +/− işaretli yazılır. */
export function BridgeBars({ window: w, compact = false }: { window: BridgeWindow; compact?: boolean }) {
  const rows = BRIDGE_PARTS.filter(
    (p) => p.key === "savings" || p.key === "invest" || Math.abs(w.parts[p.key]) >= 1,
  );
  const max = Math.max(1, ...rows.map((p) => Math.abs(w.parts[p.key])));
  return (
    <div className="bridge-bars" role="table" aria-label="Servet değişiminin kaynakları">
      {rows.map((p) => {
        const v = w.parts[p.key];
        const width = (Math.abs(v) / max) * 50;
        return (
          <div key={p.key} className="bridge-row" role="row" title={`${p.label}: ${signedMoney(v)} — ${p.hint}`}>
            <div className="bridge-label" role="rowheader">
              {p.label}
              {!compact && <span className="bridge-hint">{p.hint}</span>}
            </div>
            <div className="bridge-track" aria-hidden>
              <span className="bridge-zero" />
              {Math.abs(v) >= 1 && (
                <span
                  className={`bridge-fill ${v > 0 ? "is-pos" : "is-neg"}`}
                  style={v > 0 ? { left: "50%", width: `${width}%` } : { right: "50%", width: `${width}%` }}
                />
              )}
            </div>
            <div className={`bridge-value tabular ${v > 0.5 ? "delta-pos" : v < -0.5 ? "delta-neg" : ""}`} role="cell">
              {signedMoney(v)}
            </div>
          </div>
        );
      })}
      <div className="bridge-row bridge-total" role="row">
        <div className="bridge-label" role="rowheader">
          Servet değişimi
        </div>
        <div className="bridge-track" aria-hidden />
        <div className="bridge-value tabular" role="cell">
          {signedMoney(w.delta)}
        </div>
      </div>
    </div>
  );
}

export function UntrackedNote({ window: w }: { window: BridgeWindow }) {
  if (!w.untrackedUntil) return null;
  return (
    <p className="hint bridge-note">
      {trDate(w.start.date)} ile {trDate(w.untrackedUntil)} arasında günlük servet kaydı yok. O dönemin piyasa etkisi hisse,
      döviz ve altın olarak ayrılamıyor; tasarruf yine gelir-gider kayıtlarından ölçülüyor.
    </p>
  );
}

export function PeriodButtons({
  periods,
  active,
  onPick,
}: {
  periods: BridgePeriod[];
  active: string;
  onPick: (key: string) => void;
}) {
  return (
    <div className="bridge-periods" role="group" aria-label="Dönem">
      {periods.map((p) => (
        <button
          key={p.key}
          type="button"
          className={`btn btn-sm ${active === p.key ? "btn-prim" : ""}`}
          aria-pressed={active === p.key}
          onClick={() => onPick(p.key)}
        >
          {p.label}
        </button>
      ))}
    </div>
  );
}

/** Özet kartı: "Bu ay" / "Bu yıl" kısa köprü. */
export function WealthBridgeCard({ report }: { report: WealthBridgeReport }) {
  const shown = report.periods.filter((p) => p.key === "month" || p.key === "year");
  const [key, setKey] = useState(shown.find((p) => p.key === "year")?.key ?? shown[0]?.key ?? "");
  const period = shown.find((p) => p.key === key) ?? shown[0];
  if (!period) return null;
  const w = period.window;
  return (
    <section className="card" style={{ marginBottom: 18 }} aria-labelledby="bridge-card-title">
      <div className="card-head" style={{ flexWrap: "wrap", gap: 10 }}>
        <div className="card-title" id="bridge-card-title">
          Servetin neden değişti?
        </div>
        <div style={{ marginLeft: "auto" }}>
          <PeriodButtons periods={shown} active={period.key} onPick={setKey} />
        </div>
      </div>
      <div className="bridge-body">
        <BridgeVerdict window={w} />
        <BridgeBars window={w} compact />
        <div className="bridge-foot">
          <span className="hint tabular">
            {trDate(w.start.date)}: {money(w.start.value)} → {trDate(w.end.date)}: {money(w.end.value)}
          </span>
          <Link href="/raporlar?tab=bridge" className="bridge-link">
            Ayrıntı ve ay ay kırılım →
          </Link>
        </div>
      </div>
    </section>
  );
}

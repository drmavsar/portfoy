"use client";

import { useState } from "react";

import { fmt } from "@/lib/finance/fmt";
import {
  UNIT_META,
  inUnit,
  unitChange,
  unitDayChange,
  type UnitRates,
  type WealthPoint,
  type WealthUnit,
} from "@/lib/finance/wealth-units";

interface WealthRef {
  key: string;
  /** "30 günde", "2026 başından" */
  label: string;
  point: WealthPoint;
}

interface Props {
  /** TL cinsinden toplam servet (anlık) */
  totalTry: number;
  /** TL cinsinden servet değişimi: son gece kaydından bu yana, nakit dahil */
  dayChangeTry: number;
  /** "YYYY-MM-DD" (İstanbul) */
  today: string;
  /** Anlık kurlar (1 birim = X TRY; XAU = gram altın) */
  rates: UnitRates;
  /** Bir önceki snapshot'ın kurları — birim cinsinden günlük değişim için */
  prevRates: UnitRates | null;
  /** Karşılaştırma noktaları (kendi günlerinin kuruyla) */
  refs: WealthRef[];
  /** TRY değişiminin etiketi ("Bugünkü servet değişimi" ya da son kaydın tarihi) */
  dayLabel?: string;
  /** Aynı dönemde yalnız fiyat/kur kaynaklı değişim (TL); ayrı satırda gösterilir */
  marketChangeTry?: number | null;
}

const MONTHS = ["Oca", "Şub", "Mar", "Nis", "May", "Haz", "Tem", "Ağu", "Eyl", "Eki", "Kas", "Ara"];

function shortDate(iso: string): string {
  return `${Number(iso.slice(8, 10))} ${MONTHS[Number(iso.slice(5, 7)) - 1]}${iso.slice(0, 4) === String(new Date().getFullYear()) ? "" : ` ${iso.slice(0, 4)}`}`;
}

const UNITS: WealthUnit[] = ["TRY", "USD", "EUR", "XAU"];

function formatAmount(v: number, unit: WealthUnit): string {
  if (unit === "TRY") return fmt.trydp(v);
  const m = UNIT_META[unit];
  return `${v.toLocaleString("tr-TR", { minimumFractionDigits: m.decimals, maximumFractionDigits: m.decimals })} ${m.suffix}`;
}

function signed(v: number, d: number): string {
  return `${v >= 0 ? "+" : "−"}${fmt.tr(Math.abs(v), d)}`;
}

export function TotalWealthDisplay({ totalTry, dayChangeTry, today, rates, prevRates, refs, dayLabel, marketChangeTry }: Props) {
  const [unit, setUnit] = useState<WealthUnit>("TRY");
  const meta = UNIT_META[unit];

  const amount = inUnit(totalTry, unit, rates) ?? totalTry;
  // Birim cinsinden günlük değişim kur hareketini de içerir (dünkü kurla)
  const dayChange = unitDayChange(totalTry, dayChangeTry, unit, rates, prevRates);
  const dayBase = dayChange == null ? null : amount - dayChange;
  const dayPct = dayChange != null && dayBase != null && dayBase > 0 ? (dayChange / dayBase) * 100 : null;
  const dayColor = (dayChange ?? 0) >= 0 ? "var(--positive)" : "var(--negative)";
  const dayDecimals = unit === "XAU" ? 1 : 0;

  const nowPoint: WealthPoint = { date: today, totalTry, rates };

  return (
    <div style={{ flex: "0 0 auto" }}>
      {/* Birim seçici */}
      <div style={{ display: "flex", gap: 4, marginBottom: 8 }}>
        {UNITS.map((u) => {
          const active = u === unit;
          const disabled = inUnit(1, u, rates) == null;
          return (
            <button
              key={u}
              type="button"
              onClick={() => !disabled && setUnit(u)}
              disabled={disabled}
              style={{
                fontSize: 11,
                fontWeight: active ? 700 : 500,
                padding: "3px 10px",
                borderRadius: 4,
                border: "1px solid " + (active ? "var(--accent)" : "var(--border-soft)"),
                background: active ? "var(--accent)" : "transparent",
                color: active ? "var(--accent-fg)" : disabled ? "var(--muted)" : "var(--fg-soft)",
                cursor: disabled ? "not-allowed" : "pointer",
                opacity: disabled ? 0.4 : 1,
              }}
              title={disabled ? `${UNIT_META[u].label} kuru çekilemedi` : `${UNIT_META[u].label} cinsinden göster`}
            >
              {UNIT_META[u].label}
            </button>
          );
        })}
      </div>

      {/* Büyük servet rakamı */}
      <div className="tabular" style={{ fontSize: 36, fontWeight: 700, color: "var(--fg)" }}>
        {formatAmount(amount, unit)}
      </div>

      {/* Bugünkü değişim */}
      <div className="tabular" style={{ fontSize: 14, fontWeight: 600, marginTop: 6, color: dayChange == null ? "var(--muted)" : dayColor }}>
        {dayChange == null ? (
          "—"
        ) : (
          <>
            {signed(dayChange, dayDecimals)} {meta.suffix}
            {dayPct != null && dayChange !== 0 && <> · {signed(dayPct, 2)}%</>}
          </>
        )}
      </div>
      <div className="hint" style={{ fontSize: 11, marginTop: 4 }}>
        {unit === "TRY"
          ? (dayLabel ?? "Bugünkü servet değişimi")
          : dayChange == null
            ? "Dünkü kur yok — günlük değişim hesaplanamadı"
            : "Bugünkü değişim (kur hareketi dahil)"}
      </div>
      {unit === "TRY" && marketChangeTry != null && (
        <div className="tabular" style={{ fontSize: 12, marginTop: 6 }}>
          <span className="hint">Piyasa etkisi </span>
          <span style={{ fontWeight: 600, color: marketChangeTry >= 0 ? "var(--positive)" : "var(--negative)" }}>
            {signed(marketChangeTry, 0)} ₺
            {totalTry - dayChangeTry > 0 && marketChangeTry !== 0 && (
              <> · {signed((marketChangeTry / (totalTry - dayChangeTry)) * 100, 2)}%</>
            )}
          </span>
        </div>
      )}

      {/* Dönem karşılaştırmaları — birikim dahil servet değişimi */}
      {refs.length > 0 && (
        <div
          style={{ display: "flex", gap: 14, flexWrap: "wrap", marginTop: 10, fontSize: 12 }}
          title="Servet değişimi: yeni birikim ve harcamalar dahil (getiri değil). Her tarih kendi günün kuruyla çevrilir."
        >
          {refs.map((r) => {
            const c = unitChange(nowPoint, r.point, unit);
            if (!c || c.pct == null) return null;
            const color = c.pct >= 0 ? "var(--positive)" : "var(--negative)";
            return (
              <span
                key={r.key}
                className="tabular"
                title={`${shortDate(r.point.date)}: ${formatAmount(c.base, unit)} → bugün ${formatAmount(c.now, unit)} (${signed(c.abs, unit === "XAU" ? 1 : 0)} ${meta.suffix})`}
              >
                <span className="hint">{r.label} </span>
                <span style={{ color, fontWeight: 650 }}>{signed(c.pct * 100, 1)}%</span>
              </span>
            );
          })}
        </div>
      )}
    </div>
  );
}

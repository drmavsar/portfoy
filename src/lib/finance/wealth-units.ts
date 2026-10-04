/* ============================================================
   Servetin döviz / altın cinsinden ifadesi ve değişimi.
   Her tarih KENDİ kuruyla çevrilir: bugünkü kurla bölmek kur
   hareketini yok sayar ("dolar bazında" değişimi TL değişimiyle
   aynı gösterirdi).
   ============================================================ */

export type WealthUnit = "TRY" | "USD" | "EUR" | "XAU";

export interface UnitRates {
  USD: number | null;
  EUR: number | null;
  /** Gram altın (TRY) */
  XAU: number | null;
}

export interface WealthPoint {
  /** "YYYY-MM-DD" */
  date: string;
  totalTry: number;
  rates: UnitRates;
}

export const UNIT_META: Record<WealthUnit, { label: string; suffix: string; decimals: number }> = {
  TRY: { label: "₺ TRY", suffix: "₺", decimals: 2 },
  USD: { label: "$ USD", suffix: "$", decimals: 2 },
  EUR: { label: "€ EUR", suffix: "€", decimals: 2 },
  XAU: { label: "gr Altın", suffix: "gr", decimals: 1 },
};

function rateOf(rates: UnitRates, unit: WealthUnit): number | null {
  if (unit === "TRY") return 1;
  const r = rates[unit];
  return r != null && r > 0 ? r : null;
}

/** TL tutarı birime çevir; kur yoksa null. */
export function inUnit(totalTry: number, unit: WealthUnit, rates: UnitRates): number | null {
  const r = rateOf(rates, unit);
  return r == null ? null : totalTry / r;
}

/**
 * Bugünkü fiyat kaynaklı değişimin birim karşılığı. dayChangeTry nakit
 * giriş/çıkışı içermez (Özet manşeti); dünkü TL değeri = bugün − değişim,
 * dünkü kurla çevrilir. Böylece kur hareketi de değişime girer.
 */
export function unitDayChange(
  totalTry: number,
  dayChangeTry: number,
  unit: WealthUnit,
  nowRates: UnitRates,
  prevRates: UnitRates | null,
): number | null {
  if (unit === "TRY") return dayChangeTry;
  const now = inUnit(totalTry, unit, nowRates);
  const prev = prevRates ? inUnit(totalTry - dayChangeTry, unit, prevRates) : null;
  if (now == null || prev == null) return null;
  return now - prev;
}

export interface UnitChange {
  base: number;
  now: number;
  abs: number;
  /** oran (0.05 = %5) */
  pct: number | null;
}

/** Referans noktasından bugüne servet değişimi (birikim dahil) birim cinsinden. */
export function unitChange(now: WealthPoint, ref: WealthPoint, unit: WealthUnit): UnitChange | null {
  const n = inUnit(now.totalTry, unit, now.rates);
  const b = inUnit(ref.totalTry, unit, ref.rates);
  if (n == null || b == null) return null;
  return { base: b, now: n, abs: n - b, pct: b > 0 ? n / b - 1 : null };
}

/** Artan sıralı geçmişte tarihe ≤ son nokta. */
export function pointOnOrBefore(history: WealthPoint[], date: string): WealthPoint | null {
  let best: WealthPoint | null = null;
  for (const p of history) {
    if (p.date <= date && (best == null || p.date > best.date)) best = p;
  }
  return best;
}

/** Tarihten kesin önceki son nokta (dünkü snapshot). */
export function pointBefore(history: WealthPoint[], date: string): WealthPoint | null {
  let best: WealthPoint | null = null;
  for (const p of history) {
    if (p.date < date && (best == null || p.date > best.date)) best = p;
  }
  return best;
}

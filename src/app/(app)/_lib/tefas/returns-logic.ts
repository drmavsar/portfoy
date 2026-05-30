// Saf logic — DB bağımsız. Bir fonun NAV zaman serisinden brüt + reel
// getiri pencerelerini hesaplar. Sprint-3 PR-2.
//
// Net getiri ve stopaj uygulaması Sprint-3 PR-3'e ertelendi.
//
// Tüm "return" değerleri ondalık form: 0.15 = %15.

import { cpiPeriodForNavDate, realReturnFromCpiPair } from "./cpi-logic";

/** Tek bir NAV gözlemi. */
export interface NavPoint {
  /** "YYYY-MM-DD" */
  as_of: string;
  nav: number;
}

/** period_month → index_value sözlüğü (CPI). */
export type CpiByPeriod = Record<string, number>;

export interface FundReturnsComputation {
  /** Hesabın yapıldığı referans tarih — genelde latest NAV'ın as_of'u. */
  as_of: string;
  gross_1d: number | null;
  gross_1w: number | null;
  gross_1m: number | null;
  gross_3m: number | null;
  gross_6m: number | null;
  gross_ytd: number | null;
  gross_1y: number | null;
  gross_3y_cagr: number | null;
  gross_5y_cagr: number | null;
  real_1y: number | null;
  real_3y_cagr: number | null;
  real_5y_cagr: number | null;
  /** Reel hesabında kullanılan en güncel CPI dönemi ("YYYY-MM"); yoksa null. */
  computed_from_period: string | null;
  /** Eksik veri / kısa geçmiş gibi uyarılar. */
  warnings: string[];
}

/** İki ISO tarihinin gün cinsinden farkı (b - a). Negatif olabilir. */
function daysBetween(a: string, b: string): number {
  const da = Date.parse(`${a}T00:00:00Z`);
  const db = Date.parse(`${b}T00:00:00Z`);
  return Math.round((db - da) / 86_400_000);
}

/** as_of'tan `daysBack` gün geri giden ISO tarih. */
function shiftIsoBack(asOf: string, daysBack: number): string {
  const ts = Date.parse(`${asOf}T00:00:00Z`);
  const d = new Date(ts - daysBack * 86_400_000);
  return d.toISOString().slice(0, 10);
}

/** Yıl başı: as_of'un yılının "YYYY-01-01"i. */
function yearStart(asOf: string): string {
  return `${asOf.slice(0, 4)}-01-01`;
}

/**
 * NAV serisi içinde `target` tarihine en yakın (target'tan önce veya eşit)
 * gözlemi döndürür. Series **artan** sıralı olmalı.
 *
 * Tolerance: target'tan `maxLookbackDays` günden daha eski bir gözlem
 * kabul edilmez (lookback aralığını aşıyorsa null döner).
 */
function findOnOrBefore(
  series: NavPoint[],
  target: string,
  maxLookbackDays: number = 14,
): NavPoint | null {
  if (series.length === 0) return null;
  // En son tarih hedef'ten önceyse direkt onu kullanırız
  let candidate: NavPoint | null = null;
  for (let i = series.length - 1; i >= 0; i--) {
    if (series[i].as_of <= target) {
      candidate = series[i];
      break;
    }
  }
  if (!candidate) return null;
  const gap = daysBetween(candidate.as_of, target);
  if (gap < 0 || gap > maxLookbackDays) return null;
  return candidate;
}

/** Pencere getirisi: (end.nav / start.nav) - 1 */
function windowReturn(start: NavPoint | null, end: NavPoint): number | null {
  if (!start || start.nav <= 0) return null;
  return end.nav / start.nav - 1;
}

/** Toplam dönem getirisini yıllık CAGR'a çevir. */
function annualize(totalReturn: number | null, years: number): number | null {
  if (totalReturn == null) return null;
  if (years <= 0) return null;
  const ratio = 1 + totalReturn;
  if (ratio <= 0) return null;
  return Math.pow(ratio, 1 / years) - 1;
}

interface ComputeOptions {
  /** Reel hesabı için CPI sözlüğü (period_month → index_value). */
  cpi?: CpiByPeriod;
  /** Pencere için maksimum lookback toleransı (gün); hafta sonu/tatil esnetmesi. */
  windowToleranceDays?: number;
  /** İsteğe bağlı override; verilmezse latest NAV.as_of kullanılır. */
  asOf?: string;
}

/**
 * Bir fonun NAV serisinden brüt + reel getiri pencerelerini hesaplar.
 * Series **artan** sıralı (eski → yeni) olmalı.
 *
 * CPI sözlüğü verilmezse reel_* değerleri null ve "no_cpi_data" warning.
 */
export function computeFundReturns(
  series: NavPoint[],
  options: ComputeOptions = {},
): FundReturnsComputation | null {
  if (series.length === 0) return null;

  const tolerance = options.windowToleranceDays ?? 14;
  const latest = series[series.length - 1];
  const asOf = options.asOf ?? latest.as_of;
  const warnings: string[] = [];

  // Pencere başlangıç noktaları
  const start1d = findOnOrBefore(series, shiftIsoBack(asOf, 1), tolerance);
  const start1w = findOnOrBefore(series, shiftIsoBack(asOf, 7), tolerance);
  const start1m = findOnOrBefore(series, shiftIsoBack(asOf, 30), tolerance);
  const start3m = findOnOrBefore(series, shiftIsoBack(asOf, 90), tolerance);
  const start6m = findOnOrBefore(series, shiftIsoBack(asOf, 180), tolerance);
  const startYtd = findOnOrBefore(series, yearStart(asOf), Math.max(tolerance, 14));
  const start1y = findOnOrBefore(series, shiftIsoBack(asOf, 365), tolerance);
  const start3y = findOnOrBefore(series, shiftIsoBack(asOf, 365 * 3), tolerance * 2);
  const start5y = findOnOrBefore(series, shiftIsoBack(asOf, 365 * 5), tolerance * 2);

  const gross_1d = windowReturn(start1d, latest);
  const gross_1w = windowReturn(start1w, latest);
  const gross_1m = windowReturn(start1m, latest);
  const gross_3m = windowReturn(start3m, latest);
  const gross_6m = windowReturn(start6m, latest);
  const gross_ytd = windowReturn(startYtd, latest);
  const gross_1y = windowReturn(start1y, latest);
  const total_3y = windowReturn(start3y, latest);
  const total_5y = windowReturn(start5y, latest);
  const gross_3y_cagr = annualize(total_3y, 3);
  const gross_5y_cagr = annualize(total_5y, 5);

  if (gross_1y == null) warnings.push("no_1y_history");
  if (gross_3y_cagr == null) warnings.push("no_3y_history");
  if (gross_5y_cagr == null) warnings.push("no_5y_history");

  // Reel
  const cpi = options.cpi;
  let real_1y: number | null = null;
  let real_3y_cagr: number | null = null;
  let real_5y_cagr: number | null = null;
  let computedFromPeriod: string | null = null;

  if (!cpi || Object.keys(cpi).length === 0) {
    warnings.push("no_cpi_data");
  } else {
    const endPeriod = cpiPeriodForNavDate(asOf);
    const endCpi = cpi[endPeriod] ?? null;
    if (endCpi == null) {
      warnings.push("missing_cpi_end");
    } else {
      computedFromPeriod = endPeriod;
      if (gross_1y != null && start1y) {
        const startPeriod = cpiPeriodForNavDate(start1y.as_of);
        real_1y = realReturnFromCpiPair(gross_1y, cpi[startPeriod] ?? null, endCpi);
        if (real_1y == null) warnings.push("missing_cpi_1y");
      }
      if (gross_3y_cagr != null && total_3y != null && start3y) {
        const startPeriod = cpiPeriodForNavDate(start3y.as_of);
        const total_real_3y = realReturnFromCpiPair(total_3y, cpi[startPeriod] ?? null, endCpi);
        real_3y_cagr = annualize(total_real_3y, 3);
        if (total_real_3y == null) warnings.push("missing_cpi_3y");
      }
      if (gross_5y_cagr != null && total_5y != null && start5y) {
        const startPeriod = cpiPeriodForNavDate(start5y.as_of);
        const total_real_5y = realReturnFromCpiPair(total_5y, cpi[startPeriod] ?? null, endCpi);
        real_5y_cagr = annualize(total_real_5y, 5);
        if (total_real_5y == null) warnings.push("missing_cpi_5y");
      }
    }
  }

  return {
    as_of: asOf,
    gross_1d,
    gross_1w,
    gross_1m,
    gross_3m,
    gross_6m,
    gross_ytd,
    gross_1y,
    gross_3y_cagr,
    gross_5y_cagr,
    real_1y,
    real_3y_cagr,
    real_5y_cagr,
    computed_from_period: computedFromPeriod,
    warnings,
  };
}

/**
 * Bir grup sayıdan medyan. Boş veya null-only girişte null.
 * Çift sayıda eleman için iki ortanın aritmetik ortalaması.
 */
export function median(values: Array<number | null | undefined>): number | null {
  const xs = values.filter((v): v is number => v != null && Number.isFinite(v));
  if (xs.length === 0) return null;
  const sorted = [...xs].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  return sorted.length % 2 === 0 ? (sorted[mid - 1] + sorted[mid]) / 2 : sorted[mid];
}

/**
 * Kategori medyanlarından `vs_category` farkını hesapla:
 *   vs = fund_value - category_median
 * Fund value veya medyan null ise null.
 */
export function vsCategoryDelta(
  fundValue: number | null,
  categoryMedian: number | null,
): number | null {
  if (fundValue == null || categoryMedian == null) return null;
  return fundValue - categoryMedian;
}

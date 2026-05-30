// Saf logic — DB bağımsız. Bir fonun NAV zaman serisinden risk metriklerini
// hesaplar. Sprint-4 PR-2.
//
// Tüm "return" değerleri ondalık form: 0.15 = %15.

import type { NavPoint } from "./returns-logic";

/** Yıllık iş günü (Türkiye için BIST açık günleri ~252). */
export const TRADING_DAYS_PER_YEAR = 252;

/**
 * Ardışık NAV gözlemlerinden günlük log-getiriler.
 *
 *   r[i] = ln(nav[i] / nav[i-1])
 *
 * Log-getiri tercih edilir çünkü zaman içinde toplanabilir (Σr = ln(P_n/P_0))
 * ve simetriktir (% kazanç/kayıp matematiksel olarak dengeli).
 *
 * Series **artan** sıralı (eski → yeni) olmalı.
 */
export function logReturns(series: NavPoint[]): number[] {
  if (series.length < 2) return [];
  const out: number[] = [];
  for (let i = 1; i < series.length; i++) {
    const prev = series[i - 1].nav;
    const curr = series[i].nav;
    if (prev <= 0 || curr <= 0 || !Number.isFinite(prev) || !Number.isFinite(curr)) {
      continue;
    }
    out.push(Math.log(curr / prev));
  }
  return out;
}

/**
 * Sample standard deviation (n−1 bölen). Eleman < 2 ise null.
 * Finansal vol için sample stdev (Bessel düzeltmesi) endüstri standardı.
 */
export function sampleStdev(values: number[]): number | null {
  if (values.length < 2) return null;
  const n = values.length;
  let sum = 0;
  for (const v of values) sum += v;
  const mean = sum / n;
  let sse = 0;
  for (const v of values) {
    const d = v - mean;
    sse += d * d;
  }
  return Math.sqrt(sse / (n - 1));
}

/**
 * Yıllıklaştırılmış volatilite. Günlük log-getirilerin sample std'i × √252.
 *
 * Pencere `lookbackDays`: serinin son N noktasından log-getiriler hesaplanır
 * (yaklaşık 252 trading day = 1 yıl).
 *
 * Edge cases:
 *  - Yetersiz veri (lookback için en az `minObservations` getiri yoksa) → null
 *  - Tüm getiriler aynı (stdev = 0) → 0
 */
export function volatilityAnnualized(
  series: NavPoint[],
  options: {
    lookbackDays?: number;
    minObservations?: number;
    periodsPerYear?: number;
  } = {},
): number | null {
  const lookback = options.lookbackDays ?? TRADING_DAYS_PER_YEAR;
  const minObs = options.minObservations ?? Math.floor(lookback * 0.6);
  const periods = options.periodsPerYear ?? TRADING_DAYS_PER_YEAR;

  if (series.length < 2) return null;
  const window = series.slice(Math.max(0, series.length - 1 - lookback));
  const returns = logReturns(window);
  if (returns.length < minObs) return null;

  const stdev = sampleStdev(returns);
  if (stdev == null) return null;
  return stdev * Math.sqrt(periods);
}

/**
 * Max drawdown — pencere içinde en kötü tepe-çukur yüzde düşüş.
 *
 *   peak[i]     = max(nav[0..i])
 *   drawdown[i] = (nav[i] / peak[i]) − 1     // negatif veya 0
 *   max_dd      = min(drawdown[0..end])
 *
 * Sıfır veya pozitif drawdown olmaz; tüm seri monoton artıyorsa 0 döner.
 *
 * Edge cases:
 *  - Eleman < 2 → null
 *  - Yetersiz pencere → null
 */
export function maxDrawdown(
  series: NavPoint[],
  options: { lookbackDays?: number } = {},
): number | null {
  if (series.length < 2) return null;
  const lookback = options.lookbackDays ?? TRADING_DAYS_PER_YEAR * 3;
  const window = series.slice(Math.max(0, series.length - lookback));
  if (window.length < 2) return null;

  let peak = window[0].nav;
  let worst = 0;
  for (const p of window) {
    if (p.nav > peak) peak = p.nav;
    if (peak <= 0) continue;
    const dd = p.nav / peak - 1;
    if (dd < worst) worst = dd;
  }
  return worst;
}

/**
 * Downside volatility (Sortino payda öncülü).
 *
 * Yalnız MAR (minimum acceptable return) altındaki getirilerin std'ini
 * yıllıklaştırır. MAR default = 0 → negatif getirilerin volatilitesi.
 *
 * Klasik Sortino formülünde "downside semi-deviation" da kullanılır:
 *   sqrt(sum(min(r-MAR, 0)^2) / N)
 * Bu fonksiyon **sample stdev of below-MAR returns** kullanır (Bessel +
 * yalnız negatifler). Endüstri ikilemi var; bu sade tanım Sprint-4 için yeter.
 *
 * Edge cases:
 *  - Hiç MAR altı getiri yok → 0 (downside yok)
 *  - Tek negatif → null (sample stdev en az 2 nokta ister)
 *  - Yetersiz seri → null
 */
export function downsideVolatilityAnnualized(
  series: NavPoint[],
  options: {
    lookbackDays?: number;
    mar?: number;
    minObservations?: number;
    periodsPerYear?: number;
  } = {},
): number | null {
  const lookback = options.lookbackDays ?? TRADING_DAYS_PER_YEAR;
  const minObs = options.minObservations ?? Math.floor(lookback * 0.6);
  const mar = options.mar ?? 0;
  const periods = options.periodsPerYear ?? TRADING_DAYS_PER_YEAR;

  if (series.length < 2) return null;
  const window = series.slice(Math.max(0, series.length - 1 - lookback));
  const returns = logReturns(window);
  if (returns.length < minObs) return null;

  const below = returns.filter((r) => r < mar);
  if (below.length === 0) return 0;
  if (below.length < 2) return null;
  const stdev = sampleStdev(below);
  if (stdev == null) return null;
  return stdev * Math.sqrt(periods);
}

/**
 * Sade return / risk ratio — Sharpe-benzeri (risk-free olmadan).
 *
 *   ratio = nominalReturn / volatility
 *
 * - Yüksek = riske göre daha iyi getiri.
 * - vol = 0 → null (tanımsız).
 * - vol null veya nominalReturn null → null.
 *
 * Klasik Sharpe `(r - rf) / σ` formülünde risk-free TL için TLREF kullanılır;
 * Sprint-4 scope'unda risk-free yok. Sprint-5+ EVDS TLREF eklenebilir.
 */
export function returnRiskRatio(
  nominalReturn: number | null,
  volatility: number | null,
): number | null {
  if (nominalReturn == null || volatility == null) return null;
  if (!Number.isFinite(nominalReturn) || !Number.isFinite(volatility)) return null;
  if (volatility <= 0) return null;
  return nominalReturn / volatility;
}

/**
 * 0-100 normalize edilmiş risk skoru. Düşük volatilite = yüksek skor.
 *
 *   score = clamp(0, 100, 100 × (1 − vol / maxVol))
 *
 * - vol = 0      → 100
 * - vol = maxVol → 0
 * - vol > maxVol → 0 (clamp)
 * - vol null     → null
 */
export function normalizedRiskScore(
  volatility: number | null,
  maxVolatility: number = 0.40,
): number | null {
  if (volatility == null || !Number.isFinite(volatility)) return null;
  if (volatility < 0) return null;
  if (maxVolatility <= 0) return null;
  const raw = 100 * (1 - volatility / maxVolatility);
  return Math.max(0, Math.min(100, Math.round(raw)));
}

/**
 * Bir fon için tüm risk metriklerini birden hesapla.
 * Sprint-4 PR-3 scoring motorunda batch çağrı için.
 */
export interface FundRiskMetrics {
  volatility_1y: number | null;
  max_drawdown_3y: number | null;
  downside_volatility_1y: number | null;
  return_risk_ratio_1y: number | null;
  normalized_risk_score: number | null;
}

export function computeFundRiskMetrics(
  series: NavPoint[],
  gross_1y: number | null,
  options: {
    maxVolatility?: number;
  } = {},
): FundRiskMetrics {
  const volatility_1y = volatilityAnnualized(series);
  const max_drawdown_3y = maxDrawdown(series, { lookbackDays: TRADING_DAYS_PER_YEAR * 3 });
  const downside_volatility_1y = downsideVolatilityAnnualized(series);
  const return_risk_ratio_1y = returnRiskRatio(gross_1y, volatility_1y);
  const normalized_risk = normalizedRiskScore(volatility_1y, options.maxVolatility);
  return {
    volatility_1y,
    max_drawdown_3y,
    downside_volatility_1y,
    return_risk_ratio_1y,
    normalized_risk_score: normalized_risk,
  };
}

// Sprint-5.6 PR-B — Backtest performance metrikleri (pure).
//
// Tüm metrikler NavSeriesPoint[] üzerinde hesaplanır:
//   - CAGR        : (end/start)^(1/yıl) - 1
//   - Total Return: end/start - 1
//   - Volatility  : günlük log return std × √252
//   - MaxDD       : min(peak'ten sapma)
//   - Sharpe-like : (cagr - rf) / volatility
//   - Real CAGR   : Fisher — (1+nom)/(1+inf) - 1

const DAYS_PER_YEAR = 365.25;
const TRADING_DAYS_ANNUALIZATION = 252;

/** Yıl cinsinden (kesirli) iki tarih arasındaki süre. */
export function yearsBetween(start: string, end: string): number {
  const s = Date.parse(`${start}T00:00:00Z`);
  const e = Date.parse(`${end}T00:00:00Z`);
  return Math.max(0, (e - s) / (DAYS_PER_YEAR * 86_400_000));
}

/** CAGR — Compound Annual Growth Rate. */
export function computeCagr(
  startValue: number,
  endValue: number,
  years: number,
): number | null {
  if (!Number.isFinite(startValue) || !Number.isFinite(endValue)) return null;
  if (startValue <= 0 || endValue <= 0) return null;
  if (years <= 0) return null;
  return Math.pow(endValue / startValue, 1 / years) - 1;
}

/** Total Return = (end - start) / start. */
export function computeTotalReturn(startValue: number, endValue: number): number | null {
  if (startValue <= 0 || !Number.isFinite(startValue) || !Number.isFinite(endValue)) return null;
  return endValue / startValue - 1;
}

/** Günlük NAV serisinden volatility (annualized, √252 ölçeklemesi). */
export function computeVolatility(navSeries: number[]): number | null {
  if (navSeries.length < 2) return null;
  const logReturns: number[] = [];
  for (let i = 1; i < navSeries.length; i++) {
    if (navSeries[i - 1] <= 0 || navSeries[i] <= 0) continue;
    logReturns.push(Math.log(navSeries[i] / navSeries[i - 1]));
  }
  if (logReturns.length < 2) return null;
  const mean = logReturns.reduce((a, b) => a + b, 0) / logReturns.length;
  const variance =
    logReturns.reduce((a, b) => a + (b - mean) ** 2, 0) / (logReturns.length - 1);
  return Math.sqrt(variance) * Math.sqrt(TRADING_DAYS_ANNUALIZATION);
}

/** Max drawdown (negatif değer, -0.25 = -%25 peak'ten düşüş). */
export function computeMaxDrawdown(navSeries: number[]): number | null {
  if (navSeries.length === 0) return null;
  let peak = navSeries[0];
  let maxDd = 0;
  for (const nav of navSeries) {
    if (nav > peak) peak = nav;
    if (peak <= 0) continue;
    const dd = nav / peak - 1;
    if (dd < maxDd) maxDd = dd;
  }
  return maxDd;
}

/** Sharpe-like: (cagr - rf) / volatility. */
export function computeSharpeLike(
  cagr: number | null,
  volatility: number | null,
  riskFreeRate: number,
): number | null {
  if (cagr == null || volatility == null) return null;
  if (volatility <= 0) return null;
  return (cagr - riskFreeRate) / volatility;
}

/** Fisher: real_cagr = (1+nom)/(1+inf) - 1. */
export function computeRealCagr(
  nominalCagr: number | null,
  cpiCagr: number | null,
): number | null {
  if (nominalCagr == null || cpiCagr == null) return null;
  if (1 + cpiCagr <= 0) return null;
  return (1 + nominalCagr) / (1 + cpiCagr) - 1;
}

/** İki seri (portfolio vs benchmark) win ratio — port > bench olduğu günlerin oranı. */
export function computeWinRatio(
  portfolioSeries: number[],
  benchmarkSeries: number[],
): number | null {
  const n = Math.min(portfolioSeries.length, benchmarkSeries.length);
  if (n === 0) return null;
  let wins = 0;
  let total = 0;
  for (let i = 0; i < n; i++) {
    if (!Number.isFinite(portfolioSeries[i]) || !Number.isFinite(benchmarkSeries[i])) continue;
    if (benchmarkSeries[i] <= 0) continue;
    total++;
    if (portfolioSeries[i] / portfolioSeries[0] > benchmarkSeries[i] / benchmarkSeries[0]) {
      wins++;
    }
  }
  return total > 0 ? wins / total : null;
}

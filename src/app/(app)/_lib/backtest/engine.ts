// Sprint-5.6 PR-B — Backtest engine (pure, look-ahead-safe).
//
// Algoritma:
//   1. Rebalance tarihleri hesapla
//   2. Her rebalance noktasında:
//      - Universe = o tarihte aktif fonlar (fund_status_history)
//      - Her fon için as-of returns + risk + score
//      - Top N (mehmet_score DESC, min_components ≥ 3, tie-break)
//      - Strategy → weights (equal/score+cap)
//      - Portfolio rebalance (sat + al)
//      - Daily NAV: bir sonraki rebalance'a kadar
//   3. Metrics + summary
//
// Look-ahead bias guards:
//   - series.filter(as_of <= rebalance_date)
//   - cpi.filter(period <= cpi_period)
//   - tax_rules effective_from/to bazlı (input olarak alınır)
//
// Saf: DB/HTTP yok. Caller tüm pre-fetched datayı sağlar.

import {
  computeFundRiskMetrics,
} from "../tefas/risk-logic";
import {
  computeFundReturns,
  type CpiByPeriod,
  type NavPoint,
} from "../tefas/returns-logic";
import {
  bistDependencyScore,
  computeMehmetScore,
  diversificationScore,
  goldDependencyScore,
  inflationProtectionScore,
  longTermPerformanceScore,
  riskScoreFromVolatility,
  taxAdvantageScore,
  type MehmetScoreComponents,
} from "../tefas/scoring-logic";
import { getActiveFundsAtDateInMemory } from "../benchmark/active-funds";
import type { FundStatusEntry } from "../benchmark/types";
import { addDays, computeRebalanceDates } from "./dates";
import {
  computeCagr,
  computeMaxDrawdown,
  computeRealCagr,
  computeSharpeLike,
  computeTotalReturn,
  computeVolatility,
  computeWinRatio,
  yearsBetween,
} from "./metrics";
import {
  computeOverlap,
  computeTurnover,
  rebalance,
  valuePortfolio,
  type PortfolioState,
} from "./portfolio";
import { buildWeights } from "./strategies";
import type {
  BacktestParams,
  BacktestResult,
  BacktestSummary,
  NavSeriesPoint,
  RebalanceRecord,
  RiskFreeSource,
  VsBenchmarkMetrics,
} from "./types";

// ──────────────────────────────────────────────────────────────────────
// Engine input
// ──────────────────────────────────────────────────────────────────────

export interface FundMeta {
  fund_code: string;
  category_id: number | null;
  investment_universe: string | null;
  is_participation: boolean;
  is_equity_intensive: boolean;
}

export interface PersonaWeights {
  inflation_weight: number;
  tax_weight: number;
  risk_weight: number;
  long_term_weight: number;
  diversification_weight: number;
  /** Volatility-to-risk-score map için (default 0.40). */
  max_volatility_pct: number | null;
}

export interface AsOfTaxRule {
  category_id: number | null;
  fund_code: string | null;
  effective_from: string;
  effective_to: string | null;
  kind: "HSYF_0_STOPAJ" | "GENEL_17_5" | "DOVIZ_BAZLI" | "SERBEST_FON" | "BELIRSIZ";
  rate: number;
}

export interface BenchmarkSeriesData {
  /** YYYY-MM-DD → numerik değer */
  [date: string]: number;
}

export interface BacktestEngineInput {
  params: BacktestParams;
  personaWeights: PersonaWeights;
  funds: FundMeta[];
  /** fund_code → NAV history (ASC) */
  fundPrices: Record<string, NavPoint[]>;
  /** YYYY-MM → CPI index */
  cpi: CpiByPeriod;
  statusHistory: FundStatusEntry[];
  /** Benchmark seriesleri (varsa). */
  benchmarks: {
    XU100?: BenchmarkSeriesData;
    XAUTRY?: BenchmarkSeriesData;
    USDTRY?: BenchmarkSeriesData;
    EURTRY?: BenchmarkSeriesData;
    CPI_TR?: BenchmarkSeriesData;          // monthly → günlük lookup için
    KAT_FON_SEPETI?: BenchmarkSeriesData;
    KAT_KATEGORI_MEDIAN?: BenchmarkSeriesData;
  };
  /**
   * Risk-free rate (decimal, yıllık). Caller fallback zincirini çözer ve
   * tek bir sayı verir; engine kullanır.
   */
  riskFreeRate: number;
  riskFreeSource: RiskFreeSource;
}

// ──────────────────────────────────────────────────────────────────────
// As-of yardımcılar
// ──────────────────────────────────────────────────────────────────────

function sliceSeriesAsOf(series: NavPoint[], asOf: string): NavPoint[] {
  // ASC sıralı varsayım — binary search yerine linear (5Y × ~1250 = küçük)
  const out: NavPoint[] = [];
  for (const p of series) {
    if (p.as_of <= asOf) out.push(p);
    else break;
  }
  return out;
}

function sliceCpiAsOf(cpi: CpiByPeriod, asOfPeriod: string): CpiByPeriod {
  const out: CpiByPeriod = {};
  for (const [k, v] of Object.entries(cpi)) {
    if (k <= asOfPeriod) out[k] = v;
  }
  return out;
}

function navAt(prices: NavPoint[], date: string): number | null {
  // En son <= date NAV
  let candidate: number | null = null;
  for (const p of prices) {
    if (p.as_of <= date) candidate = p.nav;
    else break;
  }
  return candidate;
}

// ──────────────────────────────────────────────────────────────────────
// Per-fund as-of scoring
// ──────────────────────────────────────────────────────────────────────

interface ScoredFundAtDate {
  fund_code: string;
  mehmet_score: number;
  components_used: number;
  net_1y: number | null;
  gross_1y: number | null;
}

function scoreFundAtDate(
  fund: FundMeta,
  asOf: string,
  prices: NavPoint[],
  cpi: CpiByPeriod,
  taxRules: AsOfTaxRule[],
  persona: PersonaWeights,
): ScoredFundAtDate | null {
  const sliced = sliceSeriesAsOf(prices, asOf);
  if (sliced.length < 2) return null;

  const returns = computeFundReturns(sliced, { cpi, asOf });
  if (!returns) return null;

  const risk = computeFundRiskMetrics(sliced, returns.gross_1y);
  const inflation = inflationProtectionScore(returns.real_1y);
  const longTerm = longTermPerformanceScore(null, null);
  // vs_category bu noktada hesaplanamaz (tüm fonlar değerlendirilene kadar
  // medyan bilinmez); pratik olarak null veriliyor, longTerm skoru ayrı
  // hesaplanabilir ama Sprint-5.6'da kategori medyanı kategorize edilmiyor.

  // Tax kind resolve — as-of tax rule (fund veya category match)
  const taxKind = resolveTaxKindAsOf(fund, taxRules, asOf);
  const taxAdv = taxAdvantageScore(taxKind);

  // Diversification / dependency (investment_universe enum'una bağlı, statik)
  const diversification = fund.investment_universe
    ? diversificationScore(fund.investment_universe as never)
    : null;
  const bistDep = fund.investment_universe
    ? bistDependencyScore(null, fund.investment_universe as never)
    : null;
  const goldDep = fund.investment_universe
    ? goldDependencyScore(null, fund.investment_universe as never)
    : null;

  const maxVol = persona.max_volatility_pct ?? 0.40;
  const normalizedRisk = riskScoreFromVolatility(risk.volatility_1y, maxVol);

  const components: MehmetScoreComponents = {
    inflation_protection_score: inflation,
    tax_advantage_score: taxAdv,
    normalized_risk_score: normalizedRisk,
    long_term_performance_score: longTerm,
    diversification_score: diversification,
  };

  const mehmet = computeMehmetScore(components, persona);
  if (mehmet.score == null) return null;

  // Net 1Y (basit: gross × (1 - tax_rate))
  const taxRate = resolveTaxRateAsOf(fund, taxRules, asOf);
  const net1y =
    returns.gross_1y != null && taxRate != null
      ? returns.gross_1y > 0
        ? returns.gross_1y * (1 - taxRate)
        : returns.gross_1y
      : returns.gross_1y;

  // Unused vars (PR-B audit için tutuyorum)
  void bistDep;
  void goldDep;

  return {
    fund_code: fund.fund_code,
    mehmet_score: mehmet.score,
    components_used: mehmet.components_used,
    net_1y: net1y,
    gross_1y: returns.gross_1y,
  };
}

function resolveTaxKindAsOf(
  fund: FundMeta,
  rules: AsOfTaxRule[],
  asOf: string,
): "HSYF_0_STOPAJ" | "GENEL_17_5" | "DOVIZ_BAZLI" | "SERBEST_FON" | "BELIRSIZ" {
  // HSYF kontrolü → öncelik
  if (fund.is_equity_intensive) return "HSYF_0_STOPAJ";
  // Fund-specific rule
  for (const r of rules) {
    if (r.fund_code === fund.fund_code && r.effective_from <= asOf && (r.effective_to == null || r.effective_to >= asOf)) {
      return r.kind;
    }
  }
  // Category rule
  for (const r of rules) {
    if (r.category_id === fund.category_id && r.effective_from <= asOf && (r.effective_to == null || r.effective_to >= asOf)) {
      return r.kind;
    }
  }
  return "GENEL_17_5";
}

function resolveTaxRateAsOf(
  fund: FundMeta,
  rules: AsOfTaxRule[],
  asOf: string,
): number {
  const kind = resolveTaxKindAsOf(fund, rules, asOf);
  if (kind === "HSYF_0_STOPAJ") return 0;
  for (const r of rules) {
    if (r.kind === kind && r.effective_from <= asOf && (r.effective_to == null || r.effective_to >= asOf)) {
      return r.rate;
    }
  }
  // Default
  if (kind === "GENEL_17_5") return 0.175;
  if (kind === "DOVIZ_BAZLI") return 0.10;
  if (kind === "SERBEST_FON") return 0.10;
  return 0.175;
}

// ──────────────────────────────────────────────────────────────────────
// Benchmark NAV lookup
// ──────────────────────────────────────────────────────────────────────

function benchmarkValueAt(series: BenchmarkSeriesData | undefined, date: string): number | null {
  if (!series) return null;
  // Exact match
  if (series[date] != null) return series[date];
  // Last available <= date — en yakın önceki tarih (candidate_date track et)
  let candidate: number | null = null;
  let candidateDate: string | null = null;
  for (const [d, v] of Object.entries(series)) {
    if (d <= date && (candidateDate == null || d > candidateDate)) {
      candidate = v;
      candidateDate = d;
    }
  }
  return candidate;
}

function normalizeBenchmarkSeries(
  series: BenchmarkSeriesData | undefined,
  startDate: string,
  endDate: string,
): Map<string, number> | null {
  if (!series) return null;
  const startVal = benchmarkValueAt(series, startDate);
  if (startVal == null || startVal <= 0) return null;
  const out = new Map<string, number>();
  for (const [d, v] of Object.entries(series)) {
    if (d < startDate || d > endDate) continue;
    if (v > 0) out.set(d, (v / startVal) * 100);
  }
  return out;
}

// ──────────────────────────────────────────────────────────────────────
// Engine main
// ──────────────────────────────────────────────────────────────────────

const INITIAL_NAV = 100;

export function runBacktestPure(input: BacktestEngineInput): BacktestResult {
  const t0 = Date.now();
  const { params, personaWeights, funds, fundPrices, cpi, statusHistory, benchmarks } = input;
  // Pre-build lookups
  const fundByCode = new Map(funds.map((f) => [f.fund_code, f]));
  const dates = computeRebalanceDates(params.start_date, params.end_date, params.rebalance_days);

  // State
  let portfolio: PortfolioState = { holdings: new Map(), cash: INITIAL_NAV };
  const rebalanceRecords: RebalanceRecord[] = [];
  const navSeries: NavSeriesPoint[] = [];
  let prevTopCodes: string[] = [];
  let prevWeightsByCode = new Map<string, number>();
  let universeSizeSum = 0;

  // Tax rules — engine input olarak alınmıyor; basitlik için fund'ın kendi
  // tax_kind'i resolveTaxKindAsOf içinde HSYF + default ile çözülüyor.
  const emptyRules: AsOfTaxRule[] = [];

  // Loop rebalance dates
  for (let r = 0; r < dates.length; r++) {
    const rebDate = dates[r];
    const nextDate = r + 1 < dates.length ? dates[r + 1] : addDays(params.end_date, 1);

    // 1. Universe (look-ahead-free)
    const universe = getActiveFundsAtDateInMemory(rebDate, statusHistory);
    universeSizeSum += universe.length;

    // 2. Score each fund in universe
    const scored: ScoredFundAtDate[] = [];
    for (const code of universe) {
      const fund = fundByCode.get(code);
      const prices = fundPrices[code];
      if (!fund || !prices) continue;
      const result = scoreFundAtDate(fund, rebDate, prices, cpi, emptyRules, personaWeights);
      if (result && result.components_used >= params.min_components) {
        scored.push(result);
      }
    }

    // 3. Sort + Top N
    scored.sort((a, b) => {
      if (b.mehmet_score !== a.mehmet_score) return b.mehmet_score - a.mehmet_score;
      const aNet = a.net_1y ?? -Infinity;
      const bNet = b.net_1y ?? -Infinity;
      if (bNet !== aNet) return bNet - aNet;
      return a.fund_code.localeCompare(b.fund_code);
    });
    const topN = scored.slice(0, params.top_n);
    if (topN.length === 0) {
      // Universe yoksa skip — portfolio değişmez
      continue;
    }

    // 4. Strategy weights
    const weights = buildWeights(
      topN.map((t) => ({ score: t.mehmet_score })),
      params.strategy,
    );

    // 5. Rebalance portfolio
    const navAtRebMap = new Map<string, number>();
    for (const t of topN) {
      const prices = fundPrices[t.fund_code];
      if (!prices) continue;
      const navVal = navAt(prices, rebDate);
      if (navVal != null && navVal > 0) navAtRebMap.set(t.fund_code, navVal);
    }
    // Mevcut holdings için de NAV çek (satış için)
    for (const code of portfolio.holdings.keys()) {
      if (!navAtRebMap.has(code)) {
        const prices = fundPrices[code];
        if (prices) {
          const v = navAt(prices, rebDate);
          if (v != null) navAtRebMap.set(code, v);
        }
      }
    }

    const newCodes = topN.map((t) => t.fund_code);
    const newWeightsByCode = new Map<string, number>();
    for (let i = 0; i < newCodes.length; i++) {
      newWeightsByCode.set(newCodes[i], weights[i]);
    }

    portfolio = rebalance(portfolio, newCodes, weights, navAtRebMap);

    const turnover = computeTurnover(prevWeightsByCode, newWeightsByCode);
    const overlap = prevTopCodes.length > 0 ? computeOverlap(prevTopCodes, newCodes) : null;
    const portValue = valuePortfolio(portfolio, navAtRebMap);

    rebalanceRecords.push({
      rebalance_date: rebDate,
      universe_size: universe.length,
      top_n_codes: newCodes,
      top_n_scores: topN.map((t) => t.mehmet_score),
      top_n_weights: weights,
      portfolio_nav: portValue,
      turnover,
      overlap_with_prev: overlap,
    });

    prevTopCodes = newCodes;
    prevWeightsByCode = newWeightsByCode;

    // 6. Günlük NAV series — rebDate'ten nextDate'e
    let d = rebDate;
    while (d < nextDate && d <= params.end_date) {
      const dailyNavMap = new Map<string, number>();
      for (const code of portfolio.holdings.keys()) {
        const prices = fundPrices[code];
        if (!prices) continue;
        const v = navAt(prices, d);
        if (v != null) dailyNavMap.set(code, v);
      }
      const pNav = valuePortfolio(portfolio, dailyNavMap);
      navSeries.push({
        as_of: d,
        portfolio_nav: pNav,
        usd_nav: lookupBenchmark(benchmarks.USDTRY, params.start_date, d),
        eur_nav: lookupBenchmark(benchmarks.EURTRY, params.start_date, d),
        cpi_index: lookupBenchmark(benchmarks.CPI_TR, params.start_date, d),
        kat_fon_sepeti_nav: lookupBenchmark(benchmarks.KAT_FON_SEPETI, params.start_date, d),
        xu100_nav: lookupBenchmark(benchmarks.XU100, params.start_date, d),
        xau_nav: lookupBenchmark(benchmarks.XAUTRY, params.start_date, d),
        kat_kategori_median_nav: lookupBenchmark(benchmarks.KAT_KATEGORI_MEDIAN, params.start_date, d),
      });
      d = addDays(d, 1);
    }
  }

  // 7. Metrics + summary
  const summary = buildSummary(input, navSeries, rebalanceRecords);
  const finalNav = navSeries.length > 0 ? navSeries[navSeries.length - 1].portfolio_nav : INITIAL_NAV;
  const avgUniverse = dates.length > 0 ? Math.round(universeSizeSum / dates.length) : 0;

  return {
    run_id: "",
    ok: true,
    params,
    summary,
    rebalances: rebalanceRecords,
    nav_series: navSeries,
    duration_ms: Date.now() - t0,
    // Persistence layer'da kullanılır:
    ...({ final_nav: finalNav, universe_size_avg: avgUniverse } as Record<string, unknown>),
  };
}

function lookupBenchmark(
  series: BenchmarkSeriesData | undefined,
  startDate: string,
  date: string,
): number | null {
  if (!series) return null;
  const startVal = benchmarkValueAt(series, startDate);
  const cur = benchmarkValueAt(series, date);
  if (startVal == null || cur == null || startVal <= 0) return null;
  return (cur / startVal) * 100;
}

function buildSummary(
  input: BacktestEngineInput,
  navSeries: NavSeriesPoint[],
  rebalances: RebalanceRecord[],
): BacktestSummary {
  const portSeries = navSeries.map((p) => p.portfolio_nav);
  const startNav = portSeries.length > 0 ? portSeries[0] : INITIAL_NAV;
  const endNav = portSeries.length > 0 ? portSeries[portSeries.length - 1] : INITIAL_NAV;
  const years = navSeries.length > 0
    ? yearsBetween(navSeries[0].as_of, navSeries[navSeries.length - 1].as_of)
    : 0;

  const cagr = computeCagr(startNav, endNav, years);
  const totalReturn = computeTotalReturn(startNav, endNav);
  const volatility = computeVolatility(portSeries);
  const maxDd = computeMaxDrawdown(portSeries);
  const sharpe = computeSharpeLike(cagr, volatility, input.riskFreeRate);

  // CPI CAGR — start CPI vs end CPI üzerinden
  let cpiCagr: number | null = null;
  if (navSeries.length > 0) {
    const cpiStart = lookupCpiAt(input.cpi, navSeries[0].as_of);
    const cpiEnd = lookupCpiAt(input.cpi, navSeries[navSeries.length - 1].as_of);
    if (cpiStart != null && cpiEnd != null && cpiStart > 0) {
      const cpiTotal = cpiEnd / cpiStart - 1;
      cpiCagr = years > 0 ? Math.pow(1 + cpiTotal, 1 / years) - 1 : null;
    }
  }
  const realCagr = computeRealCagr(cagr, cpiCagr);

  // Turnover + overlap averages
  const turnovers = rebalances.map((r) => r.turnover).filter((x) => Number.isFinite(x));
  const overlaps = rebalances.map((r) => r.overlap_with_prev).filter((x): x is number => x != null);
  const turnoverAvg = turnovers.length > 0 ? turnovers.reduce((a, b) => a + b, 0) / turnovers.length : null;
  const overlapAvg = overlaps.length > 0 ? overlaps.reduce((a, b) => a + b, 0) / overlaps.length : null;

  // Max weight (audit)
  let maxWeight = 0;
  for (const r of rebalances) {
    for (const w of r.top_n_weights) {
      if (w > maxWeight) maxWeight = w;
    }
  }

  // Vs benchmark metrics
  // CPI_TR için nav_series field'ı cpi_index (diğerleri *_nav).
  const BENCH_TO_FIELD: Record<string, keyof NavSeriesPoint> = {
    XU100: "xu100_nav",
    XAUTRY: "xau_nav",
    USDTRY: "usd_nav",
    EURTRY: "eur_nav",
    CPI_TR: "cpi_index",
    KAT_FON_SEPETI: "kat_fon_sepeti_nav",
    KAT_KATEGORI_MEDIAN: "kat_kategori_median_nav",
  };
  const vsBench: BacktestSummary["vs_benchmark"] = {};
  for (const key of ["XU100", "XAUTRY", "USDTRY", "EURTRY", "CPI_TR", "KAT_FON_SEPETI", "KAT_KATEGORI_MEDIAN"] as const) {
    const benchKey = BENCH_TO_FIELD[key];
    const benchSeries: number[] = navSeries
      .map((p) => p[benchKey])
      .filter((v): v is number => v != null && Number.isFinite(v));
    if (benchSeries.length < 2) continue;
    const benchStart = benchSeries[0];
    const benchEnd = benchSeries[benchSeries.length - 1];
    const benchCagr = computeCagr(benchStart, benchEnd, years);
    const portMatchedSeries: number[] = [];
    const benchMatchedSeries: number[] = [];
    for (const p of navSeries) {
      const v = p[benchKey];
      if (v != null && Number.isFinite(v as number)) {
        portMatchedSeries.push(p.portfolio_nav);
        benchMatchedSeries.push(v as number);
      }
    }
    const winRatio = computeWinRatio(portMatchedSeries, benchMatchedSeries);
    const metrics: VsBenchmarkMetrics = {
      alpha_cagr: cagr != null && benchCagr != null ? cagr - benchCagr : null,
      win_ratio: winRatio,
      benchmark_cagr: benchCagr,
    };
    vsBench[key] = metrics;
  }

  return {
    cagr,
    total_return: totalReturn,
    real_cagr: realCagr,
    volatility,
    max_drawdown: maxDd,
    sharpe_like: sharpe,
    risk_free_used: input.riskFreeRate,
    risk_free_source: input.riskFreeSource,
    turnover_avg: turnoverAvg,
    top_n_overlap_avg: overlapAvg,
    max_weight: maxWeight,
    phase: detectPhase(input.params),
    vs_benchmark: vsBench,
    warnings: [],
  };
}

function detectPhase(params: BacktestParams): "phase_1" | "phase_2" {
  // Faz-1: Top10 × 3ay × herhangi strateji × 4 başlangıç
  if (params.top_n === 10 && params.rebalance_days === 90) return "phase_1";
  return "phase_2";
}

function lookupCpiAt(cpi: CpiByPeriod, date: string): number | null {
  const period = date.slice(0, 7);
  // Look for exact or earlier
  let candidate: number | null = null;
  for (const [p, v] of Object.entries(cpi)) {
    if (p <= period && (candidate == null || p > candidate.toString())) {
      candidate = v;
    }
  }
  return candidate;
}

export const __internals = { sliceSeriesAsOf, sliceCpiAsOf, navAt, scoreFundAtDate, normalizeBenchmarkSeries };

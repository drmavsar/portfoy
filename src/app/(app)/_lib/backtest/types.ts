// Sprint-5.6 PR-B — Backtest engine ortak tipler.

export type BacktestStrategy = "equal_weight" | "score_weighted";

export type RiskFreeSource = "TLREF" | "KPPF_MEDIAN" | "FIXED_30" | "AUTO";

export interface BacktestParams {
  /** YYYY-MM-DD */
  start_date: string;
  end_date: string;
  /** 30 / 90 / 180 / 365 */
  rebalance_days: number;
  /** 5 / 10 / 20 */
  top_n: number;
  strategy: BacktestStrategy;
  persona_id: string;
  category_filter: number | null;
  /** En az kaç bileşen hesaplanmış olsun (default 3). */
  min_components: number;
  risk_free_source: RiskFreeSource;
}

export interface RebalanceRecord {
  rebalance_date: string;
  universe_size: number;
  top_n_codes: string[];
  top_n_scores: number[];
  top_n_weights: number[];
  portfolio_nav: number;
  turnover: number;
  overlap_with_prev: number | null;
}

export interface NavSeriesPoint {
  as_of: string;
  portfolio_nav: number;
  // benchmark NAVs (yüklü olanlar — diğerleri null)
  xu100_nav?: number | null;
  xau_nav?: number | null;
  usd_nav?: number | null;
  eur_nav?: number | null;
  cpi_index?: number | null;
  kat_fon_sepeti_nav?: number | null;
  kat_kategori_median_nav?: number | null;
}

export interface VsBenchmarkMetrics {
  /** strategy_cagr - benchmark_cagr (decimal) */
  alpha_cagr: number | null;
  /** % of days strategy_nav > benchmark_nav */
  win_ratio: number | null;
  /** benchmark CAGR for reference */
  benchmark_cagr: number | null;
}

export interface BacktestSummary {
  cagr: number | null;
  total_return: number | null;
  real_cagr: number | null;
  volatility: number | null;
  max_drawdown: number | null;
  sharpe_like: number | null;
  risk_free_used: number | null;
  risk_free_source: RiskFreeSource;
  turnover_avg: number | null;
  top_n_overlap_avg: number | null;
  max_weight: number;
  phase: "phase_1" | "phase_2";
  vs_benchmark: {
    XU100?: VsBenchmarkMetrics;
    XAUTRY?: VsBenchmarkMetrics;
    USDTRY?: VsBenchmarkMetrics;
    EURTRY?: VsBenchmarkMetrics;
    CPI_TR?: VsBenchmarkMetrics;
    KAT_FON_SEPETI?: VsBenchmarkMetrics;
    KAT_KATEGORI_MEDIAN?: VsBenchmarkMetrics;
  };
  /** Faz-1 mi Faz-2 mi olduğunu ve hangi (top_n, rebalance_days) çalıştığını gösterir. */
  warnings: string[];
}

export interface BacktestResult {
  run_id: string;
  ok: boolean;
  params: BacktestParams;
  summary: BacktestSummary;
  rebalances: RebalanceRecord[];
  nav_series: NavSeriesPoint[];
  duration_ms: number;
  error?: string;
}

/** Fon component skorları — score-weighted için gerek. */
export interface FundComponentScores {
  fund_code: string;
  mehmet_score: number | null;
  components_used: number | null;
  net_1y: number | null;
}

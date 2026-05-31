// Sprint-5.6 PR-B — Server-side backtest orchestrator.
//
// runBacktestPure'a gerekli pre-fetched datayı DB'den çeker, çalıştırır,
// sonucu backtest_runs/rebalances/nav_series tablolarına yazar.

import type { NavPoint, CpiByPeriod } from "../tefas/returns-logic";
import type { FundStatusEntry } from "../benchmark/types";
import {
  runBacktestPure,
  type BacktestEngineInput,
  type FundMeta,
  type PersonaWeights,
  type BenchmarkSeriesData,
} from "./engine";
import type {
  BacktestParams,
  BacktestResult,
  BacktestStrategy,
  RiskFreeSource,
} from "./types";

export interface OrchestratorOptions {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  supabase: any;
  params: BacktestParams;
  /** Default %30 fallback; PR-B'de TLREF/KPPF entegrasyonu basitleştirildi. */
  riskFreeRate?: number;
  riskFreeSource?: RiskFreeSource;
}

const PAGE = 1000;

/** PostgREST 1000 satır limitini bypass eden pagination loop. */
async function fetchAllPages<T>(
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  queryBuilder: () => any,
): Promise<T[]> {
  const all: T[] = [];
  for (let off = 0; ; off += PAGE) {
    const { data, error } = await queryBuilder().range(off, off + PAGE - 1);
    if (error) throw new Error(`fetchAllPages: ${JSON.stringify(error)}`);
    const chunk = (data ?? []) as T[];
    all.push(...chunk);
    if (chunk.length < PAGE) break;
  }
  return all;
}

export async function runBacktestWithPersistence(
  opts: OrchestratorOptions,
): Promise<BacktestResult & { run_id: string }> {
  const t0 = Date.now();
  const { supabase, params } = opts;

  // 1. Funds + persona
  const { data: fundsData } = await supabase
    .from("funds")
    .select("code, category_id, investment_universe, is_participation, is_equity_intensive")
    .eq("is_active", true);
  type FundRow = {
    code: string;
    category_id: number | null;
    investment_universe: string | null;
    is_participation: boolean;
    is_equity_intensive: boolean;
  };
  const fundRows: FundRow[] = (fundsData ?? []) as FundRow[];
  const funds: FundMeta[] = fundRows.map((f) => ({
    fund_code: f.code,
    category_id: f.category_id,
    investment_universe: f.investment_universe,
    is_participation: f.is_participation,
    is_equity_intensive: f.is_equity_intensive,
  }));

  const { data: personaData } = await supabase
    .from("user_personas")
    .select("inflation_weight, tax_weight, risk_weight, long_term_weight, diversification_weight, max_volatility_pct")
    .eq("id", params.persona_id)
    .maybeSingle();
  if (!personaData) {
    throw new Error(`Persona not found: ${params.persona_id}`);
  }
  const personaWeights: PersonaWeights = personaData as PersonaWeights;

  // 2. NAV history (start_date'ten 5Y öncesi gerekli — vol/MaxDD için)
  const navCutoff = new Date(Date.parse(`${params.start_date}T00:00:00Z`) - 5 * 365 * 86_400_000)
    .toISOString()
    .slice(0, 10);
  const priceRows = await fetchAllPages<{ fund_code: string; as_of: string; nav: number }>(() =>
    supabase
      .from("fund_prices")
      .select("fund_code, as_of, nav")
      .gte("as_of", navCutoff)
      .lte("as_of", params.end_date)
      .order("fund_code", { ascending: true })
      .order("as_of", { ascending: true }),
  );
  const fundPrices: Record<string, NavPoint[]> = {};
  for (const row of priceRows) {
    if (!fundPrices[row.fund_code]) fundPrices[row.fund_code] = [];
    fundPrices[row.fund_code].push({ as_of: row.as_of, nav: Number(row.nav) });
  }

  // 3. CPI
  const { data: cpiData } = await supabase
    .from("cpi_monthly")
    .select("period_month, index_value")
    .eq("series_code", "CPI_TR_GENERAL");
  const cpi: CpiByPeriod = {};
  for (const c of (cpiData ?? []) as Array<{ period_month: string; index_value: number }>) {
    cpi[c.period_month] = Number(c.index_value);
  }

  // 4. fund_status_history
  const { data: statusData } = await supabase
    .from("fund_status_history")
    .select("fund_code, effective_from, effective_to, status, reason");
  const statusHistory: FundStatusEntry[] = (statusData ?? []) as FundStatusEntry[];

  // 5. Benchmark series — benchmark_points join benchmark_series
  type BenchPoint = {
    as_of: string;
    value: number;
    benchmark_series: { code: string } | null;
  };
  const benchRows = await fetchAllPages<BenchPoint>(() =>
    supabase
      .from("benchmark_points")
      .select("as_of, value, benchmark_series!inner(code)")
      .gte("as_of", params.start_date)
      .lte("as_of", params.end_date)
      .order("as_of", { ascending: true }),
  );
  const benchmarks: BacktestEngineInput["benchmarks"] = {};
  for (const row of benchRows) {
    const code = row.benchmark_series?.code;
    if (!code) continue;
    const key = code as keyof typeof benchmarks;
    if (!benchmarks[key]) benchmarks[key] = {};
    (benchmarks[key] as BenchmarkSeriesData)[row.as_of] = Number(row.value);
  }
  // CPI'yı da benchmark olarak ekle (NAV trajesi için)
  if (Object.keys(cpi).length > 0) {
    const cpiSeries: BenchmarkSeriesData = {};
    for (const [period, val] of Object.entries(cpi)) {
      cpiSeries[`${period}-15`] = val; // ay ortası proxy
    }
    benchmarks.CPI_TR = cpiSeries;
  }

  // 6. Run engine
  const engineInput: BacktestEngineInput = {
    params,
    personaWeights,
    funds,
    fundPrices,
    cpi,
    statusHistory,
    benchmarks,
    riskFreeRate: opts.riskFreeRate ?? 0.30,
    riskFreeSource: opts.riskFreeSource ?? "FIXED_30",
  };
  const result = runBacktestPure(engineInput);
  const finalNav = result.nav_series.length > 0
    ? result.nav_series[result.nav_series.length - 1].portfolio_nav
    : 100;
  const universeAvg = result.rebalances.length > 0
    ? Math.round(result.rebalances.reduce((a, b) => a + b.universe_size, 0) / result.rebalances.length)
    : 0;

  // 7. Persist — backtest_runs
  const { data: insertedRun, error: runErr } = await supabase
    .from("backtest_runs")
    .insert({
      params: params as never,
      summary: result.summary as never,
      final_nav: finalNav,
      total_rebalances: result.rebalances.length,
      universe_size_avg: universeAvg,
      duration_ms: result.duration_ms,
      ok: true,
    })
    .select("id")
    .maybeSingle();
  if (runErr || !insertedRun?.id) {
    return {
      ...result,
      ok: false,
      run_id: "",
      error: runErr?.message ?? "Insert failed",
      duration_ms: Date.now() - t0,
    };
  }
  const runId = insertedRun.id as string;

  // 8. Persist — backtest_rebalances + backtest_nav_series (chunked)
  const rebalancePayload = result.rebalances.map((r) => ({
    run_id: runId,
    rebalance_date: r.rebalance_date,
    universe_size: r.universe_size,
    top_n_codes: r.top_n_codes,
    top_n_scores: r.top_n_scores,
    top_n_weights: r.top_n_weights,
    portfolio_nav: r.portfolio_nav,
    turnover: r.turnover,
    overlap_with_prev: r.overlap_with_prev,
  }));
  if (rebalancePayload.length > 0) {
    await supabase.from("backtest_rebalances").insert(rebalancePayload as never);
  }
  const CHUNK = 500;
  for (let i = 0; i < result.nav_series.length; i += CHUNK) {
    const chunk = result.nav_series.slice(i, i + CHUNK).map((p) => ({
      run_id: runId,
      as_of: p.as_of,
      portfolio_nav: p.portfolio_nav,
      xu100_nav: p.xu100_nav ?? null,
      xau_nav: p.xau_nav ?? null,
      usd_nav: p.usd_nav ?? null,
      eur_nav: p.eur_nav ?? null,
      cpi_index: p.cpi_index ?? null,
      kat_fon_sepeti_nav: p.kat_fon_sepeti_nav ?? null,
      kat_kategori_median_nav: p.kat_kategori_median_nav ?? null,
    }));
    await supabase.from("backtest_nav_series").insert(chunk as never);
  }

  return { ...result, run_id: runId, duration_ms: Date.now() - t0 };
}

/** Faz-1 baseline: 8 run (Top10 × 3ay × 2 strateji × 4 başlangıç). */
export const PHASE_1_START_DATES = ["2022-01-03", "2023-01-02", "2024-01-02", "2025-01-02"];
export const PHASE_1_STRATEGIES: BacktestStrategy[] = ["equal_weight", "score_weighted"];
export const PHASE_1_END_DATE = "2026-05-26";
export const PHASE_1_TOP_N = 10;
export const PHASE_1_REBALANCE_DAYS = 90;

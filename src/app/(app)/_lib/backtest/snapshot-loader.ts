// Sprint-5.6 PR-C — Backtest UI server-side loader.
//
// Tüm sekmelerin ihtiyaç duyduğu aggregated data'yı tek server call'da
// çeker. UI tarafı client'a serileştirilebilir snapshot alır.

import { createClient } from "@supabase/supabase-js";

import {
  bestStrategyAlpha,
  computeConfidence,
  evaluateSprint6,
  type ScenarioBenchmarkAlphas,
} from "./confidence";
import type { BacktestStrategy, VsBenchmarkMetrics } from "./types";

/** Sprint-6 best config kararı (kullanıcı onayı 2026-05-31). */
export const BEST_CONFIG = {
  top_n: 5,
  rebalance_days: 30,
  strategy: "equal_weight" as BacktestStrategy,
} as const;

export const PHASE_1_BASELINE_CONFIG = {
  top_n: 10,
  rebalance_days: 90,
} as const;

export const ALL_SCENARIOS = ["2022-01-03", "2023-01-02", "2024-01-02", "2025-01-02"] as const;

export const BENCHMARK_KEYS = ["KAT_FON_SEPETI", "XU100", "XAUTRY", "USDTRY", "EURTRY", "CPI_TR"] as const;

export interface ComboAggregate {
  top_n: number;
  rebalance_days: number;
  strategy: BacktestStrategy;
  n_scenarios: number;
  per_benchmark: Record<string, {
    median_alpha: number | null;
    mean_alpha: number | null;
    wins: number;
    confidence: number;
    benchmark_cagr: number | null;
  }>;
  avg_cagr: number | null;
  avg_real_cagr: number | null;
  avg_max_dd: number | null;
  avg_sharpe: number | null;
  avg_turnover: number | null;
  is_best: boolean;
}

export interface BacktestUiSnapshot {
  total_runs: number;
  has_phase_2: boolean;
  best_combo: ComboAggregate | null;
  phase_1_combo: ComboAggregate | null;
  /** Tüm combinations sorted by KAT_FON_SEPETI median alpha DESC. */
  combos: ComboAggregate[];
  /** Confidence + Sprint-6 GO/NO-GO best config baz alınarak. */
  best_config_confidence: ReturnType<typeof computeConfidence>;
  best_config_sprint6: ReturnType<typeof evaluateSprint6>;
  /** Eksik benchmark verisi uyarısı. */
  missing_benchmarks: string[];
  /** Faz-2 96 run tam mı? */
  phase_2_complete: { total: number; expected: number; missing: number };
}

// ────────────────────────────────────────────────────────────────────────

interface RunRow {
  params: {
    start_date: string;
    top_n: number;
    rebalance_days: number;
    strategy: BacktestStrategy;
  };
  summary: {
    cagr: number | null;
    real_cagr: number | null;
    max_drawdown: number | null;
    sharpe_like: number | null;
    turnover_avg: number | null;
    vs_benchmark: Record<string, VsBenchmarkMetrics>;
  };
}

function median(xs: number[]): number | null {
  if (xs.length === 0) return null;
  const s = [...xs].sort((a, b) => a - b);
  const m = Math.floor(s.length / 2);
  return s.length % 2 === 0 ? (s[m - 1] + s[m]) / 2 : s[m];
}

function avg(xs: number[]): number | null {
  if (xs.length === 0) return null;
  return xs.reduce((a, b) => a + b, 0) / xs.length;
}

function buildComboAggregate(
  runs: RunRow[],
  isBest: boolean,
): ComboAggregate | null {
  if (runs.length === 0) return null;
  const sample = runs[0].params;
  const perBench: ComboAggregate["per_benchmark"] = {};

  for (const bench of BENCHMARK_KEYS) {
    const alphas: number[] = [];
    let benchCagrSample: number | null = null;
    for (const r of runs) {
      const vs = r.summary.vs_benchmark?.[bench];
      if (vs?.alpha_cagr != null && Number.isFinite(vs.alpha_cagr)) {
        alphas.push(vs.alpha_cagr);
      }
      if (vs?.benchmark_cagr != null && Number.isFinite(vs.benchmark_cagr)) {
        benchCagrSample = vs.benchmark_cagr;
      }
    }
    const wins = alphas.filter((x) => x > 0).length;
    perBench[bench] = {
      median_alpha: median(alphas),
      mean_alpha: avg(alphas),
      wins,
      confidence: alphas.length > 0 ? Math.round((wins / alphas.length) * 100) : 0,
      benchmark_cagr: benchCagrSample,
    };
  }

  return {
    top_n: sample.top_n,
    rebalance_days: sample.rebalance_days,
    strategy: sample.strategy,
    n_scenarios: runs.length,
    per_benchmark: perBench,
    avg_cagr: avg(runs.map((r) => r.summary.cagr ?? 0)),
    avg_real_cagr: avg(runs.map((r) => r.summary.real_cagr ?? 0).filter((x) => x !== 0)),
    avg_max_dd: avg(runs.map((r) => r.summary.max_drawdown ?? 0).filter((x) => x !== 0)),
    avg_sharpe: avg(runs.map((r) => r.summary.sharpe_like ?? 0).filter((x) => x !== 0)),
    avg_turnover: avg(runs.map((r) => r.summary.turnover_avg ?? 0).filter((x) => x !== 0)),
    is_best: isBest,
  };
}

export async function loadBacktestSnapshot(): Promise<BacktestUiSnapshot | null> {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !serviceKey) return null;

  const supabase = createClient(url, serviceKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  });

  const { data, error } = await supabase
    .from("backtest_runs")
    .select("params, summary")
    .eq("ok", true);
  if (error || !data) {
    console.error("loadBacktestSnapshot failed:", error);
    return null;
  }
  const rows = data as unknown as RunRow[];
  if (rows.length === 0) {
    return {
      total_runs: 0,
      has_phase_2: false,
      best_combo: null,
      phase_1_combo: null,
      combos: [],
      best_config_confidence: { overall_confidence: null, per_benchmark: [] },
      best_config_sprint6: {
        ok: false,
        checks: {
          KAT_FON_SEPETI: { confidence: 0, median_alpha: null, confidence_ok: false, alpha_ok: false, passed: false },
          XU100: { confidence: 0, passed: false },
          CPI_TR: { confidence: 0, passed: false },
        },
        failures: ["Henüz hiç backtest çalıştırılmadı"],
      },
      missing_benchmarks: ["XU100", "XAUTRY"],
      phase_2_complete: { total: 0, expected: 96, missing: 96 },
    };
  }

  // Group by (top_n, rebalance_days, strategy)
  const grouped = new Map<string, RunRow[]>();
  for (const r of rows) {
    const key = `${r.params.top_n}|${r.params.rebalance_days}|${r.params.strategy}`;
    const list = grouped.get(key) ?? [];
    list.push(r);
    grouped.set(key, list);
  }

  const combos: ComboAggregate[] = [];
  for (const [key, runs] of grouped) {
    const [tn, rd, st] = key.split("|");
    const isBest =
      Number(tn) === BEST_CONFIG.top_n &&
      Number(rd) === BEST_CONFIG.rebalance_days &&
      st === BEST_CONFIG.strategy;
    const agg = buildComboAggregate(runs, isBest);
    if (agg) combos.push(agg);
  }

  // Sort by KAT_FON_SEPETI median alpha DESC
  combos.sort((a, b) => {
    const aMed = a.per_benchmark.KAT_FON_SEPETI?.median_alpha ?? -Infinity;
    const bMed = b.per_benchmark.KAT_FON_SEPETI?.median_alpha ?? -Infinity;
    if (bMed !== aMed) return bMed - aMed;
    return (b.avg_cagr ?? 0) - (a.avg_cagr ?? 0);
  });

  const bestCombo = combos.find((c) => c.is_best) ?? null;
  const phase1Combo = combos.find(
    (c) =>
      c.top_n === PHASE_1_BASELINE_CONFIG.top_n &&
      c.rebalance_days === PHASE_1_BASELINE_CONFIG.rebalance_days &&
      c.strategy === "equal_weight",
  ) ?? null;

  // Best config için confidence + Sprint-6
  const bestEW = combos.find(
    (c) =>
      c.top_n === BEST_CONFIG.top_n &&
      c.rebalance_days === BEST_CONFIG.rebalance_days &&
      c.strategy === "equal_weight",
  );
  const bestSW = combos.find(
    (c) =>
      c.top_n === BEST_CONFIG.top_n &&
      c.rebalance_days === BEST_CONFIG.rebalance_days &&
      c.strategy === "score_weighted",
  );

  const scenarioAlphas: ScenarioBenchmarkAlphas[] = BENCHMARK_KEYS.map((bench) => {
    const ewAlphas = bestEW?.per_benchmark[bench];
    const swAlphas = bestSW?.per_benchmark[bench];
    // Per-scenario için raw vs_benchmark'a tekrar dönmemiz lazım — combo aggregate
    // sadece median tutuyor. Best config'in 4 senaryosunu doğrudan rows'tan al.
    const bestConfigScenarioRows = rows.filter(
      (r) =>
        r.params.top_n === BEST_CONFIG.top_n &&
        r.params.rebalance_days === BEST_CONFIG.rebalance_days,
    );
    const alphas: number[] = [];
    for (const scenario of ALL_SCENARIOS) {
      const ew = bestConfigScenarioRows.find(
        (r) => r.params.start_date === scenario && r.params.strategy === "equal_weight",
      );
      const sw = bestConfigScenarioRows.find(
        (r) => r.params.start_date === scenario && r.params.strategy === "score_weighted",
      );
      const ewVs = ew?.summary.vs_benchmark?.[bench] ?? null;
      const swVs = sw?.summary.vs_benchmark?.[bench] ?? null;
      const best = bestStrategyAlpha(ewVs, swVs);
      if (best != null) alphas.push(best);
    }
    void ewAlphas;
    void swAlphas;
    return { benchmark: bench, alphas };
  });

  const bestConfigConfidence = computeConfidence(scenarioAlphas);
  const bestConfigSprint6 = evaluateSprint6(bestConfigConfidence);

  // Missing benchmarks — hangi benchmark'lar hiç veri döndürmedi
  const missingBenchmarks: string[] = [];
  for (const bench of BENCHMARK_KEYS) {
    const totalScenarios = scenarioAlphas.find((s) => s.benchmark === bench)?.alphas.length ?? 0;
    if (totalScenarios === 0) missingBenchmarks.push(bench);
  }

  return {
    total_runs: rows.length,
    has_phase_2: rows.length >= 24,
    best_combo: bestCombo,
    phase_1_combo: phase1Combo,
    combos,
    best_config_confidence: bestConfigConfidence,
    best_config_sprint6: bestConfigSprint6,
    missing_benchmarks: missingBenchmarks,
    phase_2_complete: {
      total: rows.length,
      expected: 96,
      missing: Math.max(0, 96 - rows.length),
    },
  };
}

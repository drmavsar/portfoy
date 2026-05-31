// Sprint-5.6 PR-B — Confidence Score + Alpha Strength + Sprint-6 GO/NO-GO.
//
// Pure helpers. Birden çok backtest run'ı üzerinde cross-aggregation.

import type { VsBenchmarkMetrics } from "./types";

type CriticalBenchmark = "KAT_FON_SEPETI" | "XU100" | "CPI_TR";

const SPRINT6_MIN_CONFIDENCE = 75;
const SPRINT6_KAT_FON_SEPETI_MIN_MEDIAN_ALPHA = 0.03;

export interface AlphaStrength {
  median_alpha: number | null;
  mean_alpha: number | null;
  per_scenario: number[];        // 4 senaryo başına alpha (null'lar 0 sayılmaz, atlanır)
}

export interface ConfidencePerBenchmark {
  benchmark: string;
  wins: number;
  total_scenarios: number;
  confidence: number;            // 0-100
  alpha: AlphaStrength;
}

export interface ConfidenceResult {
  overall_confidence: number | null;  // mean of per_benchmark
  per_benchmark: ConfidencePerBenchmark[];
}

export interface Sprint6GoNoGo {
  ok: boolean;
  checks: {
    KAT_FON_SEPETI: {
      confidence: number;
      median_alpha: number | null;
      confidence_ok: boolean;
      alpha_ok: boolean;
      passed: boolean;
    };
    XU100: { confidence: number; passed: boolean };
    CPI_TR: { confidence: number; passed: boolean };
  };
  /** Failures listesi (boş ise GO). */
  failures: string[];
}

/**
 * Bir senaryo için "best strategy alpha" — equal_weight ve score_weighted
 * arasından max'ı seç (her ikisi de mevcut değilse mevcut olan).
 */
export function bestStrategyAlpha(
  equalWeight: VsBenchmarkMetrics | null,
  scoreWeighted: VsBenchmarkMetrics | null,
): number | null {
  const ewAlpha = equalWeight?.alpha_cagr ?? null;
  const swAlpha = scoreWeighted?.alpha_cagr ?? null;
  if (ewAlpha == null && swAlpha == null) return null;
  if (ewAlpha == null) return swAlpha;
  if (swAlpha == null) return ewAlpha;
  return Math.max(ewAlpha, swAlpha);
}

/** Numerik dizinin median'ı; boş → null. */
function median(xs: number[]): number | null {
  if (xs.length === 0) return null;
  const sorted = [...xs].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  return sorted.length % 2 === 0 ? (sorted[mid - 1] + sorted[mid]) / 2 : sorted[mid];
}

/** Numerik dizinin ortalaması; boş → null. */
function mean(xs: number[]): number | null {
  if (xs.length === 0) return null;
  return xs.reduce((a, b) => a + b, 0) / xs.length;
}

export interface ScenarioBenchmarkAlphas {
  benchmark: string;
  alphas: number[]; // her senaryo için bestStrategyAlpha (null'lar atlanmış)
}

/**
 * Birden çok senaryo + benchmark için confidence + alpha strength hesabı.
 *
 * `scenarioAlphas` — her benchmark için 4 senaryonun "bestStrategyAlpha"
 * değerlerini içerir (null senaryolar atlanmış).
 */
export function computeConfidence(scenarioAlphas: ScenarioBenchmarkAlphas[]): ConfidenceResult {
  const per: ConfidencePerBenchmark[] = scenarioAlphas.map((sa) => {
    const alphas = sa.alphas.filter((x) => Number.isFinite(x));
    const total = alphas.length;
    const wins = alphas.filter((x) => x > 0).length;
    const confidence = total > 0 ? Math.round((wins / total) * 100) : 0;
    return {
      benchmark: sa.benchmark,
      wins,
      total_scenarios: total,
      confidence,
      alpha: {
        median_alpha: median(alphas),
        mean_alpha: mean(alphas),
        per_scenario: alphas,
      },
    };
  });
  const confidences = per.map((p) => p.confidence).filter((x) => Number.isFinite(x));
  const overall = confidences.length > 0 ? Math.round(mean(confidences) ?? 0) : null;
  return { overall_confidence: overall, per_benchmark: per };
}

/**
 * Sprint-6 GO/NO-GO kriteri (v5 doc):
 *   KAT_FON_SEPETI: confidence ≥ 75 AND median_alpha ≥ 0.03
 *   XU100:          confidence ≥ 75
 *   CPI_TR:         confidence ≥ 75
 *
 * Üç koşul da sağlanırsa OK.
 */
export function evaluateSprint6(confidence: ConfidenceResult): Sprint6GoNoGo {
  const byBench = new Map(confidence.per_benchmark.map((p) => [p.benchmark, p]));
  const get = (b: CriticalBenchmark) => byBench.get(b);
  const kat = get("KAT_FON_SEPETI");
  const xu = get("XU100");
  const cpi = get("CPI_TR");

  const katConf = kat?.confidence ?? 0;
  const katMedian = kat?.alpha.median_alpha ?? null;
  const katConfOk = katConf >= SPRINT6_MIN_CONFIDENCE;
  const katAlphaOk =
    katMedian != null && katMedian >= SPRINT6_KAT_FON_SEPETI_MIN_MEDIAN_ALPHA;
  const katPassed = katConfOk && katAlphaOk;

  const xuConf = xu?.confidence ?? 0;
  const xuPassed = xuConf >= SPRINT6_MIN_CONFIDENCE;

  const cpiConf = cpi?.confidence ?? 0;
  const cpiPassed = cpiConf >= SPRINT6_MIN_CONFIDENCE;

  const failures: string[] = [];
  if (!katPassed) {
    if (!katConfOk) failures.push(`KAT_FON_SEPETI confidence ${katConf} < 75`);
    if (!katAlphaOk) {
      failures.push(
        katMedian == null
          ? "KAT_FON_SEPETI median alpha hesaplanamadı"
          : `KAT_FON_SEPETI median alpha ${(katMedian * 100).toFixed(1)}% < 3%`,
      );
    }
  }
  if (!xuPassed) failures.push(`XU100 confidence ${xuConf} < 75`);
  if (!cpiPassed) failures.push(`CPI_TR confidence ${cpiConf} < 75`);

  return {
    ok: failures.length === 0,
    checks: {
      KAT_FON_SEPETI: {
        confidence: katConf,
        median_alpha: katMedian,
        confidence_ok: katConfOk,
        alpha_ok: katAlphaOk,
        passed: katPassed,
      },
      XU100: { confidence: xuConf, passed: xuPassed },
      CPI_TR: { confidence: cpiConf, passed: cpiPassed },
    },
    failures,
  };
}

export const __internals = { median, mean };

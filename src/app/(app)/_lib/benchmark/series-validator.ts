// Sprint-5.6 PR-A — EVDS series code candidate auto-discovery.
//
// Her benchmark için 3+ aday EVDS series code mevcut (series-config.ts).
// Validator her birini kısa pencerede (son 30 gün) dener; ilk veri döndüren
// kazanan. Sonuçları diagnostic ile dön.
//
// /api/cron/benchmark-validate endpoint'i bu helper'ı çağırır → kullanıcıya
// "hangi kod çalışıyor?" raporu sunar. Backfill (ALL) sonra geçer.

import { fetchEvdsSeries, type EvdsSeriesResult } from "./evds-adapter";
import {
  BENCHMARK_CANDIDATES,
  type BenchmarkSeriesCandidate,
} from "./series-config";
import type { BenchmarkSeriesCode } from "./types";

export interface SeriesValidationAttempt {
  evds_series_code: string;
  ok: boolean;
  fetched_periods: number;
  sample?: Array<{ as_of: string; value: number }>;
  error?: string;
  status_code?: number;
}

export interface SeriesValidationResult {
  code: BenchmarkSeriesCode;
  description: string;
  required: boolean;
  working_candidate: string | null;
  attempts: SeriesValidationAttempt[];
  recommendation: string;
}

export interface ValidateOptions {
  apiKey: string;
  /** Test window — varsayılan son 30 gün. */
  startDate?: string;
  endDate?: string;
  baseUrl?: string;
  fetchImpl?: typeof fetch;
}

function defaultDateRange(): { startDate: string; endDate: string } {
  const today = new Date();
  const end = today.toISOString().slice(0, 10);
  const start = new Date(today.getTime() - 30 * 86_400_000).toISOString().slice(0, 10);
  return { startDate: start, endDate: end };
}

/** Tek bir series için aday EVDS kodlarını sırayla dene. */
export async function validateSingleSeries(
  candidate: BenchmarkSeriesCandidate,
  opts: ValidateOptions,
): Promise<SeriesValidationResult> {
  const { startDate, endDate } = (() => {
    if (opts.startDate && opts.endDate) {
      return { startDate: opts.startDate, endDate: opts.endDate };
    }
    return defaultDateRange();
  })();

  const attempts: SeriesValidationAttempt[] = [];
  let working: string | null = null;
  let firstWinResult: EvdsSeriesResult | null = null;

  for (const evdsCode of candidate.candidates) {
    const result = await fetchEvdsSeries({
      evdsSeries: evdsCode,
      startDate,
      endDate,
      apiKey: opts.apiKey,
      baseUrl: opts.baseUrl,
      fetchImpl: opts.fetchImpl,
      aggregationType: candidate.aggregation ?? "last",
    });
    attempts.push({
      evds_series_code: evdsCode,
      ok: result.ok,
      fetched_periods: result.fetched_periods,
      sample: result.ok ? result.points.slice(-3) : undefined,
      error: result.error,
      status_code: result.diagnostic?.status_code,
    });
    if (result.ok && working === null) {
      working = evdsCode;
      firstWinResult = result;
    }
  }

  let recommendation: string;
  if (working) {
    recommendation = `series-config.ts'de ${candidate.code} için "${working}" ilk sıraya alınmalı (${firstWinResult?.fetched_periods ?? 0} satır 30 günde)`;
  } else if (candidate.required) {
    recommendation = `❌ ZORUNLU seri başarısız — ${candidate.code} için yeni aday gerekli. EVDS portalda manuel arama yap.`;
  } else {
    recommendation = `⚠ Opsiyonel seri ${candidate.code} bulunamadı — fallback (KPPF medyanı) kullanılır.`;
  }

  return {
    code: candidate.code,
    description: candidate.description,
    required: candidate.required,
    working_candidate: working,
    attempts,
    recommendation,
  };
}

/** Tüm benchmark series'lerini doğrula. */
export async function validateAllSeries(
  opts: ValidateOptions,
): Promise<{
  ok: boolean;
  results: SeriesValidationResult[];
  required_failures: string[];
  summary: string;
}> {
  const results: SeriesValidationResult[] = [];
  for (const candidate of BENCHMARK_CANDIDATES) {
    results.push(await validateSingleSeries(candidate, opts));
  }
  const required_failures = results
    .filter((r) => r.required && !r.working_candidate)
    .map((r) => r.code);
  const ok = required_failures.length === 0;

  const workingCount = results.filter((r) => r.working_candidate).length;
  const summary = ok
    ? `✓ ${workingCount}/${results.length} seri çalışıyor; PR-A backfill başlatılabilir.`
    : `❌ ${required_failures.length} zorunlu seri başarısız: ${required_failures.join(", ")}`;

  return { ok, results, required_failures, summary };
}

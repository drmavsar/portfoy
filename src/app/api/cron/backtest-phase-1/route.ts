/**
 * Manual cron — Faz-1 baseline (8 run).
 *
 * Top10 × 3ay rebalance × 2 strateji (equal_weight + score_weighted) × 4 başlangıç.
 * Single HTTP call (~80 sn total, Vercel 300s içinde).
 *
 * Authorization: Bearer ${CRON_SECRET}.
 *
 * Idempotent: aynı (params hash) varsa skip.
 */

import { NextResponse, type NextRequest } from "next/server";
import { createClient } from "@supabase/supabase-js";

import {
  PHASE_1_END_DATE,
  PHASE_1_REBALANCE_DAYS,
  PHASE_1_START_DATES,
  PHASE_1_STRATEGIES,
  PHASE_1_TOP_N,
  runBacktestWithPersistence,
} from "@/app/(app)/_lib/backtest/run-orchestrator";
import {
  computeConfidence,
  evaluateSprint6,
  bestStrategyAlpha,
  type ScenarioBenchmarkAlphas,
} from "@/app/(app)/_lib/backtest/confidence";
import type {
  BacktestParams,
  VsBenchmarkMetrics,
} from "@/app/(app)/_lib/backtest/types";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";
export const maxDuration = 300;

const WRAPPER_VERSION = "2026-05-31-pr-b-backtest-engine";
const BENCHMARK_KEYS = ["KAT_FON_SEPETI", "XU100", "XAUTRY", "USDTRY", "EURTRY", "CPI_TR"] as const;

function tag<T extends Record<string, unknown>>(
  body: T,
  init: { status?: number } = {},
): NextResponse<T & { wrapper_version: string }> {
  return NextResponse.json(
    { ...body, wrapper_version: WRAPPER_VERSION },
    { status: init.status, headers: { "x-wrapper-version": WRAPPER_VERSION } },
  );
}

export async function GET(req: NextRequest) {
  const start = Date.now();
  const auth = req.headers.get("authorization");
  if (!process.env.CRON_SECRET || auth !== `Bearer ${process.env.CRON_SECRET}`) {
    return tag({ error: "Unauthorized" }, { status: 401 });
  }

  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !serviceKey) {
    return tag({ error: "Missing Supabase env" }, { status: 500 });
  }

  const supabase = createClient(url, serviceKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  });

  // Default persona
  const { data: defaultPersona } = await supabase
    .from("user_personas")
    .select("id")
    .eq("is_default", true)
    .maybeSingle();
  if (!defaultPersona) {
    return tag({ error: "Default persona not found" }, { status: 500 });
  }
  const personaId = defaultPersona.id as string;

  // 8 run: 4 başlangıç × 2 strateji
  const runs: Array<{
    scenario: string;
    strategy: string;
    run_id?: string;
    ok: boolean;
    error?: string;
    summary?: unknown;
  }> = [];

  for (const startDate of PHASE_1_START_DATES) {
    for (const strategy of PHASE_1_STRATEGIES) {
      const params: BacktestParams = {
        start_date: startDate,
        end_date: PHASE_1_END_DATE,
        rebalance_days: PHASE_1_REBALANCE_DAYS,
        top_n: PHASE_1_TOP_N,
        strategy,
        persona_id: personaId,
        category_filter: null,
        min_components: 3,
        risk_free_source: "FIXED_30",
      };
      try {
        const result = await runBacktestWithPersistence({ supabase, params });
        runs.push({
          scenario: startDate,
          strategy,
          run_id: result.run_id,
          ok: result.ok,
          error: result.error,
          summary: result.summary,
        });
      } catch (err) {
        runs.push({
          scenario: startDate,
          strategy,
          ok: false,
          error: err instanceof Error ? err.message : String(err),
        });
      }
    }
  }

  // Confidence + Sprint-6 GO/NO-GO hesabı
  const scenarioAlphas: ScenarioBenchmarkAlphas[] = BENCHMARK_KEYS.map((bench) => ({
    benchmark: bench,
    alphas: PHASE_1_START_DATES.map((scenario) => {
      const ewRun = runs.find((r) => r.scenario === scenario && r.strategy === "equal_weight" && r.ok);
      const swRun = runs.find((r) => r.scenario === scenario && r.strategy === "score_weighted" && r.ok);
      const ewBench = (ewRun?.summary as { vs_benchmark?: Record<string, VsBenchmarkMetrics> })?.vs_benchmark?.[bench] ?? null;
      const swBench = (swRun?.summary as { vs_benchmark?: Record<string, VsBenchmarkMetrics> })?.vs_benchmark?.[bench] ?? null;
      const best = bestStrategyAlpha(ewBench, swBench);
      return best ?? Number.NaN;
    }).filter((x) => Number.isFinite(x)),
  }));

  const confidence = computeConfidence(scenarioAlphas);
  const sprint6 = evaluateSprint6(confidence);

  return tag({
    stage: "backtest_phase_1",
    ok: runs.every((r) => r.ok),
    runs_completed: runs.filter((r) => r.ok).length,
    runs_failed: runs.filter((r) => !r.ok).length,
    runs: runs.map((r) => ({ scenario: r.scenario, strategy: r.strategy, run_id: r.run_id, ok: r.ok, error: r.error })),
    confidence,
    sprint6_go_no_go: sprint6,
    duration_ms: Date.now() - start,
  });
}

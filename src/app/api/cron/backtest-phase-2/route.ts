/**
 * Manual cron — Faz-2 senaryo başına optimizasyon matrisi.
 *
 * 1 senaryo için 3 TopN × 4 Rebalance × 2 Strateji = 24 run.
 * Süre: ~4 dk (Vercel 300s sınırı içinde).
 *
 * Authorization: Bearer ${CRON_SECRET}.
 *
 * Kullanım:
 *   ?scenario=2022-01-03   (zorunlu — 4 başlangıç tarihinden biri)
 *   ?skip_existing=1       (idempotent — DB'de aynı param kombosu varsa skip)
 *
 * User 4 kez çağırır (2022/2023/2024/2025) — toplam ~16 dk, 96 run.
 *
 * Response: { ok, scenario, runs_count, runs: [{top_n, rebalance_days, strategy, run_id, ok}], duration_ms }
 */

import { NextResponse, type NextRequest } from "next/server";
import { createClient } from "@supabase/supabase-js";

import { runBacktestWithPersistence } from "@/app/(app)/_lib/backtest/run-orchestrator";
import type { BacktestParams, BacktestStrategy } from "@/app/(app)/_lib/backtest/types";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";
export const maxDuration = 300;

const WRAPPER_VERSION = "2026-05-31-pr-b2-phase-2";

const VALID_SCENARIOS = new Set(["2022-01-03", "2023-01-02", "2024-01-02", "2025-01-02"]);
const END_DATE = "2026-05-26";
const TOP_NS: number[] = [5, 10, 20];
const REBALANCE_DAYS: number[] = [30, 90, 180, 365];
const STRATEGIES: BacktestStrategy[] = ["equal_weight", "score_weighted"];

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

  const sp = req.nextUrl.searchParams;
  const scenario = sp.get("scenario") ?? "";
  if (!VALID_SCENARIOS.has(scenario)) {
    return tag(
      { error: `scenario must be one of: ${[...VALID_SCENARIOS].join(", ")}` },
      { status: 400 },
    );
  }
  const skipExisting = sp.get("skip_existing") === "1";

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

  // Cartesian: 3 × 4 × 2 = 24 run
  const combos: BacktestParams[] = [];
  for (const topN of TOP_NS) {
    for (const rebalance of REBALANCE_DAYS) {
      for (const strategy of STRATEGIES) {
        combos.push({
          start_date: scenario,
          end_date: END_DATE,
          rebalance_days: rebalance,
          top_n: topN,
          strategy,
          persona_id: personaId,
          category_filter: null,
          min_components: 3,
          risk_free_source: "FIXED_30",
        });
      }
    }
  }

  const runs: Array<{
    top_n: number;
    rebalance_days: number;
    strategy: string;
    run_id?: string;
    ok: boolean;
    skipped?: boolean;
    error?: string;
    duration_ms?: number;
  }> = [];

  for (const params of combos) {
    // Idempotent check — aynı params kombinasyonu DB'de varsa skip
    if (skipExisting) {
      const { data: existing } = await supabase
        .from("backtest_runs")
        .select("id")
        .eq("ok", true)
        .filter("params->>start_date", "eq", params.start_date)
        .filter("params->>top_n", "eq", String(params.top_n))
        .filter("params->>rebalance_days", "eq", String(params.rebalance_days))
        .filter("params->>strategy", "eq", params.strategy)
        .filter("params->>persona_id", "eq", params.persona_id)
        .limit(1)
        .maybeSingle();
      if (existing?.id) {
        runs.push({
          top_n: params.top_n,
          rebalance_days: params.rebalance_days,
          strategy: params.strategy,
          run_id: existing.id as string,
          ok: true,
          skipped: true,
        });
        continue;
      }
    }

    const t0 = Date.now();
    try {
      const result = await runBacktestWithPersistence({ supabase, params });
      runs.push({
        top_n: params.top_n,
        rebalance_days: params.rebalance_days,
        strategy: params.strategy,
        run_id: result.run_id,
        ok: result.ok,
        error: result.error,
        duration_ms: Date.now() - t0,
      });
    } catch (err) {
      runs.push({
        top_n: params.top_n,
        rebalance_days: params.rebalance_days,
        strategy: params.strategy,
        ok: false,
        error: err instanceof Error ? err.message : String(err),
        duration_ms: Date.now() - t0,
      });
    }
  }

  const okCount = runs.filter((r) => r.ok).length;
  const skippedCount = runs.filter((r) => r.skipped).length;

  return tag({
    stage: "backtest_phase_2",
    ok: okCount === runs.length,
    scenario,
    runs_total: runs.length,
    runs_ok: okCount,
    runs_skipped: skippedCount,
    runs_failed: runs.length - okCount,
    runs,
    duration_ms: Date.now() - start,
  });
}

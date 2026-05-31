/**
 * Manual cron — tek bir backtest run'ı çalıştırır.
 *
 * Authorization: Bearer ${CRON_SECRET}.
 *
 * Query parametreleri:
 *   ?start=2022-01-03&end=2026-05-26
 *   &top_n=10&rebalance_days=90
 *   &strategy=equal_weight | score_weighted
 *   &persona_id=<uuid>  (verilmezse default persona)
 *
 * Response: { ok, run_id, summary, duration_ms, ... }
 */

import { NextResponse, type NextRequest } from "next/server";
import { createClient } from "@supabase/supabase-js";

import { runBacktestWithPersistence } from "@/app/(app)/_lib/backtest/run-orchestrator";
import type { BacktestParams } from "@/app/(app)/_lib/backtest/types";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";
export const maxDuration = 300;

const WRAPPER_VERSION = "2026-05-31-pr-b-backtest-engine";

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
  const startDate = sp.get("start") ?? "2022-01-03";
  const endDate = sp.get("end") ?? "2026-05-26";
  const topN = Number(sp.get("top_n") ?? "10");
  const rebalanceDays = Number(sp.get("rebalance_days") ?? "90");
  const strategy = (sp.get("strategy") ?? "equal_weight") as BacktestParams["strategy"];
  let personaId = sp.get("persona_id") ?? "";

  if (![5, 10, 20].includes(topN)) {
    return tag({ error: "top_n must be 5, 10, or 20" }, { status: 400 });
  }
  if (![30, 90, 180, 365].includes(rebalanceDays)) {
    return tag({ error: "rebalance_days must be 30, 90, 180, or 365" }, { status: 400 });
  }
  if (!["equal_weight", "score_weighted"].includes(strategy)) {
    return tag({ error: "strategy must be equal_weight or score_weighted" }, { status: 400 });
  }

  const supabase = createClient(url, serviceKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  });

  if (!personaId) {
    const { data: defaultPersona } = await supabase
      .from("user_personas")
      .select("id")
      .eq("is_default", true)
      .maybeSingle();
    if (!defaultPersona) {
      return tag({ error: "Default persona not found" }, { status: 500 });
    }
    personaId = defaultPersona.id as string;
  }

  const params: BacktestParams = {
    start_date: startDate,
    end_date: endDate,
    rebalance_days: rebalanceDays,
    top_n: topN,
    strategy,
    persona_id: personaId,
    category_filter: null,
    min_components: 3,
    risk_free_source: "FIXED_30",
  };

  try {
    const result = await runBacktestWithPersistence({ supabase, params });
    return tag({
      stage: "backtest_run",
      ok: result.ok,
      run_id: result.run_id,
      params: result.params,
      summary: result.summary,
      rebalances_count: result.rebalances.length,
      nav_series_count: result.nav_series.length,
      final_nav: result.nav_series.length > 0
        ? result.nav_series[result.nav_series.length - 1].portfolio_nav
        : null,
      duration_ms: Date.now() - start,
      error: result.error,
    }, { status: result.ok ? 200 : 500 });
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    return tag({
      stage: "backtest_run",
      ok: false,
      error: msg,
      duration_ms: Date.now() - start,
    }, { status: 500 });
  }
}

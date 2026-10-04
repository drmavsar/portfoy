/**
 * Vercel Cron — backtest sonuçlarını güncel tutar (her gece).
 *
 * Senaryolar ve bitiş tarihi bugüne göre hesaplanır (schedule.ts): 2022'den bu
 * yana her yılın ilk iş günü, bitiş = önceki ay sonu. Her senaryo için Faz-2
 * matrisi (24 kombinasyon) çalıştırılır; güncel olanlar atlanır:
 *   - aynı bitiş tarihiyle,
 *   - motor düzeltmesinden (BACKTEST_ENGINE_VERSION_AT) sonra,
 *   - son TÜFE güncellemesinden sonra üretilmiş sonuç varsa.
 * Böylece ay içinde ilk birkaç gece matris tamamlanır, sonra cron hızlıca
 * "yapacak iş yok" der; yeni ay ya da yeni TÜFE gelince yeniden hesaplar.
 *
 * Zaman bütçesi: 300 sn sınırı içinde ~240 sn çalışır, kalan sonraki geceye.
 * Öncelik: GO/NO-GO'nun dayandığı yapılandırma (Top5 × 30g, iki strateji),
 * sonra Faz-1 tabanı (Top10 × 90g), sonra matrisin geri kalanı.
 *
 * Yeni sonuç yazılınca aynı senaryo + kombinasyonun eski çalıştırmaları
 * (rebalance ve NAV serileriyle birlikte, cascade) silinir — tablo şişmez,
 * okuyucu zaten en yenisini kullanır.
 *
 * Authorization: Bearer ${CRON_SECRET}.
 */

import { NextResponse, type NextRequest } from "next/server";
import { createClient } from "@supabase/supabase-js";

import { runBacktestWithPersistence } from "@/app/(app)/_lib/backtest/run-orchestrator";
import {
  backtestEndDate,
  backtestScenarios,
  isFreshRun,
  prioritizedMatrix,
  runKey,
  type StoredRun,
} from "@/app/(app)/_lib/backtest/schedule";
import { BEST_CONFIG, PHASE_1_BASELINE_CONFIG } from "@/app/(app)/_lib/backtest/snapshot-loader";
import type { BacktestParams } from "@/app/(app)/_lib/backtest/types";
import { istanbulToday } from "@/lib/finance/istanbul-date";
import { readAll } from "@/lib/supabase/read-all";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";
export const maxDuration = 300;

const TIME_BUDGET_MS = 240_000;

export async function GET(req: NextRequest) {
  const start = Date.now();
  const auth = req.headers.get("authorization");
  if (!process.env.CRON_SECRET || auth !== `Bearer ${process.env.CRON_SECRET}`) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !serviceKey) {
    return NextResponse.json({ error: "Missing Supabase env" }, { status: 500 });
  }
  const supabase = createClient(url, serviceKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  });

  const { data: persona } = await supabase
    .from("user_personas")
    .select("id")
    .eq("is_default", true)
    .maybeSingle();
  if (!persona) return NextResponse.json({ error: "Default persona not found" }, { status: 500 });
  const personaId = persona.id as string;

  const today = istanbulToday();
  const scenarios = backtestScenarios(today);
  const endDate = backtestEndDate(today);

  // Son TÜFE güncellemesi: sonrasında üretilmemiş sonuçların reel getirisi eski
  const { data: cpiRow } = await supabase
    .from("cpi_monthly")
    .select("fetched_at")
    .order("fetched_at", { ascending: false })
    .limit(1)
    .maybeSingle();
  const cpiUpdatedAt = (cpiRow as { fetched_at?: string } | null)?.fetched_at ?? null;

  let existing: StoredRun[];
  try {
    existing = await readAll<StoredRun>(
      (from, to) =>
        supabase
          .from("backtest_runs")
          .select("id, created_at, params", { count: "exact" })
          .eq("ok", true)
          .filter("params->>end_date", "eq", endDate)
          .filter("params->>persona_id", "eq", personaId)
          .order("id", { ascending: true })
          .range(from, to),
      (r) => r.id,
    );
  } catch (err) {
    return NextResponse.json({ error: err instanceof Error ? err.message : String(err) }, { status: 500 });
  }
  const fresh = new Set(
    existing.filter((r) => isFreshRun(r, endDate, cpiUpdatedAt)).map((r) => runKey(r.params)),
  );

  const combos = prioritizedMatrix(BEST_CONFIG, PHASE_1_BASELINE_CONFIG);
  let ran = 0;
  let skipped = 0;
  let remaining = 0;
  let pruned = 0;
  const failures: Array<{ key: string; error: string }> = [];

  // Kombinasyon önceliği senaryolardan önce: en önemli yapılandırma tüm
  // senaryolarda ilk tamamlanır.
  for (const combo of combos) {
    for (const scenario of scenarios) {
      const params: BacktestParams = {
        start_date: scenario,
        end_date: endDate,
        rebalance_days: combo.rebalance_days,
        top_n: combo.top_n,
        strategy: combo.strategy,
        persona_id: personaId,
        category_filter: null,
        min_components: 3,
        risk_free_source: "FIXED_30",
      };
      const key = runKey(params);
      if (fresh.has(key)) {
        skipped++;
        continue;
      }
      if (Date.now() - start > TIME_BUDGET_MS) {
        remaining++;
        continue;
      }
      try {
        const result = await runBacktestWithPersistence({ supabase, params });
        if (!result.ok || !result.run_id) {
          failures.push({ key, error: result.error ?? "run failed" });
          continue;
        }
        ran++;
        // Aynı senaryo + kombinasyonun eski çalıştırmalarını sil (cascade)
        const { count } = await supabase
          .from("backtest_runs")
          .delete({ count: "exact" })
          .filter("params->>start_date", "eq", params.start_date)
          .filter("params->>top_n", "eq", String(params.top_n))
          .filter("params->>rebalance_days", "eq", String(params.rebalance_days))
          .filter("params->>strategy", "eq", params.strategy)
          .filter("params->>persona_id", "eq", personaId)
          .neq("id", result.run_id);
        pruned += count ?? 0;
      } catch (err) {
        failures.push({ key, error: err instanceof Error ? err.message : String(err) });
      }
    }
  }

  return NextResponse.json({
    ok: failures.length === 0,
    end_date: endDate,
    scenarios,
    expected: combos.length * scenarios.length,
    ran,
    skipped,
    remaining,
    pruned,
    failures,
    cpi_updated_at: cpiUpdatedAt,
    duration_ms: Date.now() - start,
  });
}

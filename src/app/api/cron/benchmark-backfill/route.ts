/**
 * Manual cron — EVDS benchmark backfill.
 *
 * EVDS validator ile çalışan series code'u bulup, geçmiş tarihten bugüne
 * kadar benchmark_points'a UPSERT eder.
 *
 * Authorization: Bearer ${CRON_SECRET}.
 *
 * Query parametreleri:
 *   ?series=XU100         → tek seri
 *   ?series=ALL           → 4 zorunlu + TLREF (opsiyonel)
 *   ?start=2021-01-01     → default 5Y öncesi
 *   ?end=2026-05-31       → default bugün
 *
 * Akış:
 *   1. validator ile her series için aday EVDS kodlarını dene
 *   2. çalışan kodu kullan, full date range fetch et
 *   3. benchmark_points UPSERT (onConflict: series_code, as_of)
 *   4. benchmark_ingest_log'a kaydet
 *
 * Idempotent — UPSERT.
 */

import { NextResponse, type NextRequest } from "next/server";
import { createClient } from "@supabase/supabase-js";

import { fetchEvdsSeries } from "@/app/(app)/_lib/benchmark/evds-adapter";
import { BENCHMARK_CANDIDATES, findCandidate } from "@/app/(app)/_lib/benchmark/series-config";
import { validateSingleSeries } from "@/app/(app)/_lib/benchmark/series-validator";
import type { BenchmarkPoint, BenchmarkSeriesCode } from "@/app/(app)/_lib/benchmark/types";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";
export const maxDuration = 300;

const WRAPPER_VERSION = "2026-05-31-pr-a-benchmark-framework";
const UPSERT_CHUNK_SIZE = 1000;

function tag<T extends Record<string, unknown>>(
  body: T,
  init: { status?: number } = {},
): NextResponse<T & { wrapper_version: string }> {
  return NextResponse.json(
    { ...body, wrapper_version: WRAPPER_VERSION },
    { status: init.status, headers: { "x-wrapper-version": WRAPPER_VERSION } },
  );
}

/** benchmark_series'den series UUID resolve et; yoksa INSERT et. */
async function resolveSeriesId(
  code: BenchmarkSeriesCode,
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  supabase: any,
): Promise<string | null> {
  const { data: existing } = await supabase
    .from("benchmark_series")
    .select("id")
    .eq("code", code)
    .maybeSingle();
  if (existing?.id) return existing.id as string;
  // INSERT
  const candidate = findCandidate(code);
  const name = candidate?.description ?? code;
  const { data: inserted, error } = await supabase
    .from("benchmark_series")
    .insert({ code, name })
    .select("id")
    .maybeSingle();
  if (error || !inserted?.id) return null;
  return inserted.id as string;
}

interface SeriesResult {
  series_code: string;
  evds_series_code: string | null;
  ok: boolean;
  fetched_periods: number;
  upserted: number;
  duration_ms: number;
  error?: string;
  body_snippet?: string;
  date_min?: string;
  date_max?: string;
}

// Supabase v2 generics ile uyumsuz (PostgrestVersion mismatch) — `any`
// kabul edilebilir; helper iç DB call'ları runtime'da doğru.
async function ingestOneSeries(
  code: BenchmarkSeriesCode,
  apiKey: string,
  baseUrl: string | undefined,
  startDate: string,
  endDate: string,
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  supabase: any,
  triggeredBy: string,
): Promise<SeriesResult> {
  const t0 = Date.now();

  // benchmark_series'den UUID al; yoksa oluştur
  const seriesId = await resolveSeriesId(code, supabase);
  if (!seriesId) {
    return {
      series_code: code,
      evds_series_code: null,
      ok: false,
      fetched_periods: 0,
      upserted: 0,
      duration_ms: Date.now() - t0,
      error: "benchmark_series'de UUID resolve edilemedi",
    };
  }

  const candidate = findCandidate(code);
  if (!candidate) {
    return {
      series_code: code,
      evds_series_code: null,
      ok: false,
      fetched_periods: 0,
      upserted: 0,
      duration_ms: Date.now() - t0,
      error: "candidate config bulunamadı",
    };
  }

  // 1. Validator ile çalışan EVDS kodu bul (kısa pencere)
  const validation = await validateSingleSeries(candidate, {
    apiKey,
    baseUrl,
  });
  const evdsCode = validation.working_candidate;

  if (!evdsCode) {
    const attempts = validation.attempts.map((a) => `${a.evds_series_code}:${a.error ?? "no_data"}`).join("; ");
    await supabase.from("benchmark_ingest_log").insert({
      series_code: code,
      evds_series_code: null,
      fetched_periods: 0,
      upserted: 0,
      succeeded: false,
      error: `Hiç aday başarılı değil: ${attempts}`,
      duration_ms: Date.now() - t0,
      triggered_by: triggeredBy,
    } as never);
    return {
      series_code: code,
      evds_series_code: null,
      ok: false,
      fetched_periods: 0,
      upserted: 0,
      duration_ms: Date.now() - t0,
      error: `Hiç aday çalışmadı: ${attempts}`,
    };
  }

  // 2. Full range fetch
  const fetchResult = await fetchEvdsSeries({
    evdsSeries: evdsCode,
    startDate,
    endDate,
    apiKey,
    baseUrl,
    aggregationType: candidate.aggregation ?? "last",
  });

  if (!fetchResult.ok) {
    await supabase.from("benchmark_ingest_log").insert({
      series_code: code,
      evds_series_code: evdsCode,
      fetched_periods: 0,
      upserted: 0,
      succeeded: false,
      error: fetchResult.error ?? "unknown",
      body_snippet: fetchResult.diagnostic?.body_snippet,
      duration_ms: Date.now() - t0,
      triggered_by: triggeredBy,
    } as never);
    return {
      series_code: code,
      evds_series_code: evdsCode,
      ok: false,
      fetched_periods: 0,
      upserted: 0,
      duration_ms: Date.now() - t0,
      error: fetchResult.error,
      body_snippet: fetchResult.diagnostic?.body_snippet,
    };
  }

  // 3. UPSERT benchmark_points
  let upserted = 0;
  let upsertError: string | undefined;
  if (fetchResult.points.length > 0) {
    const fetchedAt = new Date().toISOString();
    for (let i = 0; i < fetchResult.points.length; i += UPSERT_CHUNK_SIZE) {
      const chunk = fetchResult.points.slice(i, i + UPSERT_CHUNK_SIZE);
      void fetchedAt;
      const payload = chunk.map((p: BenchmarkPoint) => ({
        series_id: seriesId,
        as_of: p.as_of,
        value: p.value,
      }));
      const { error, count } = await supabase
        .from("benchmark_points")
        .upsert(payload as never, { onConflict: "series_id,as_of", count: "exact" });
      if (error) {
        upsertError = error.message;
        break;
      }
      upserted += count ?? payload.length;
    }
  }

  const ok = !upsertError && fetchResult.points.length > 0;
  await supabase.from("benchmark_ingest_log").insert({
    series_code: code,
    evds_series_code: evdsCode,
    fetched_periods: fetchResult.fetched_periods,
    upserted,
    succeeded: ok,
    error: upsertError,
    duration_ms: Date.now() - t0,
    triggered_by: triggeredBy,
  } as never);

  return {
    series_code: code,
    evds_series_code: evdsCode,
    ok,
    fetched_periods: fetchResult.fetched_periods,
    upserted,
    duration_ms: Date.now() - t0,
    error: upsertError,
    date_min: fetchResult.points[0]?.as_of,
    date_max: fetchResult.points[fetchResult.points.length - 1]?.as_of,
  };
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
    return tag(
      { error: "Missing env: SUPABASE_SERVICE_ROLE_KEY or NEXT_PUBLIC_SUPABASE_URL" },
      { status: 500 },
    );
  }
  const apiKey = process.env.EVDS_API_KEY ?? "";
  if (!apiKey) {
    return tag({ error: "EVDS_API_KEY missing" }, { status: 500 });
  }
  const baseUrl = process.env.EVDS_BASE_URL ?? undefined;

  const sp = req.nextUrl.searchParams;
  const seriesParam = sp.get("series") ?? "ALL";
  const startDate = sp.get("start") ?? "2021-01-01";
  const endDate = sp.get("end") ?? new Date().toISOString().slice(0, 10);
  const triggeredBy = req.headers.get("x-triggered-by") ?? "manual";

  const supabase = createClient(url, serviceKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  });

  let targetSeries: BenchmarkSeriesCode[];
  if (seriesParam === "ALL") {
    targetSeries = BENCHMARK_CANDIDATES.map((c) => c.code);
  } else {
    const upper = seriesParam.toUpperCase() as BenchmarkSeriesCode;
    if (!findCandidate(upper)) {
      return tag(
        { error: `Geçersiz series: ${seriesParam}. Geçerli: ${BENCHMARK_CANDIDATES.map((c) => c.code).join(", ")}, ALL` },
        { status: 400 },
      );
    }
    targetSeries = [upper];
  }

  const results: SeriesResult[] = [];
  for (const s of targetSeries) {
    results.push(
      await ingestOneSeries(s, apiKey, baseUrl, startDate, endDate, supabase, triggeredBy),
    );
  }

  // Zorunlu seriler: XU100/XAU/USD/EUR. TLREF opsiyonel.
  const requiredCodes = BENCHMARK_CANDIDATES.filter((c) => c.required).map((c) => c.code);
  const requiredFailures = results
    .filter((r) => requiredCodes.includes(r.series_code as BenchmarkSeriesCode) && !r.ok)
    .map((r) => r.series_code);

  return tag(
    {
      stage: "benchmark_backfill",
      ok: requiredFailures.length === 0,
      window: { start: startDate, end: endDate },
      results,
      required_failures: requiredFailures,
      duration_ms: Date.now() - start,
    },
    { status: requiredFailures.length === 0 ? 200 : 207 },
  );
}

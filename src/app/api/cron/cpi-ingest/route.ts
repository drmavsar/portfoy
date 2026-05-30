/**
 * Vercel Cron — aylık CPI (TÜFE Genel) ingest.
 *
 * vercel.json: { schedule: "0 8 5 * *" }
 *   → Her ayın 5'inde UTC 08:00 (TR 11:00). TÜİK ayın 3'ü civarında
 *     bir önceki ay endeksini yayınlar; 5'i güvenli marj.
 *
 * Authorization: Bearer ${CRON_SECRET} (Vercel cron + manuel curl).
 *
 * Akış (PR-A sonrası — function-to-function HTTP yok):
 *  1. fetchEvdsCpi() çağrısı (pure async, direct call — Python yok)
 *  2. Sonuçları cpi_monthly'e UPSERT (series_code, period_month)
 *  3. JSON: { ok, fetched_periods, upserted, latest_period, ... }
 *
 * Manuel tetikleme:
 *   curl -H "Authorization: Bearer $CRON_SECRET" \
 *        "https://<host>/api/cron/cpi-ingest?series=CPI_TR_GENERAL"
 *
 * Debug:
 *   curl -H "Authorization: Bearer $CRON_SECRET" \
 *        "https://<host>/api/cron/cpi-ingest?debug=1"
 */

import { NextResponse, type NextRequest } from "next/server";
import { createClient } from "@supabase/supabase-js";

import { fetchEvdsCpi } from "@/app/(app)/_lib/tefas/cpi-evds-fetch";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";
export const maxDuration = 60;

const DEFAULT_SERIES = "CPI_TR_GENERAL";
const WRAPPER_VERSION = "2026-05-30-pr-a-ts-port-keyrelax";

/** Tüm cevaplara wrapper_version field + x-wrapper-version header ekler. */
function tag<T extends Record<string, unknown>>(
  body: T,
  init: { status?: number } = {},
): NextResponse<T & { wrapper_version: string }> {
  const payload = { ...body, wrapper_version: WRAPPER_VERSION };
  return NextResponse.json(payload, {
    status: init.status,
    headers: { "x-wrapper-version": WRAPPER_VERSION },
  });
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

  const seriesCode = req.nextUrl.searchParams.get("series")?.toUpperCase() ?? DEFAULT_SERIES;
  const debug = req.nextUrl.searchParams.get("debug") === "1";

  const today = new Date();
  const startParam = req.nextUrl.searchParams.get("start") ?? "2010-01";
  const endParam =
    req.nextUrl.searchParams.get("end") ??
    `${today.getUTCFullYear()}-${String(today.getUTCMonth() + 1).padStart(2, "0")}`;

  if (
    !/^\d{4}-(0[1-9]|1[0-2])$/.test(startParam) ||
    !/^\d{4}-(0[1-9]|1[0-2])$/.test(endParam)
  ) {
    return tag(
      { ok: false, error: "start/end YYYY-MM formatında olmalı" },
      { status: 400 },
    );
  }

  const apiKey = process.env.EVDS_API_KEY ?? "";

  // 1) EVDS fetch — pure async, function-to-function HTTP yok
  const result = await fetchEvdsCpi({
    series: seriesCode,
    start: startParam,
    end: endParam,
    apiKey,
  });

  // Debug: full result yansıt
  if (debug) {
    return tag(
      {
        stage: "debug",
        ok: result.ok,
        fetched_periods: result.fetched_periods,
        rows_sample: (result.rows ?? []).slice(0, 3),
        evds_series: result.evds_series,
        window: result.window,
        error: result.error,
        diagnostic: result.diagnostic,
        duration_ms: Date.now() - start,
      },
      { status: result.ok ? 200 : 502 },
    );
  }

  if (!result.ok) {
    return tag(
      {
        ok: false,
        stage: "fetch_evds",
        error: result.error,
        diagnostic: result.diagnostic,
        duration_ms: Date.now() - start,
      },
      { status: 502 },
    );
  }

  const rows = result.rows ?? [];
  if (rows.length === 0) {
    return tag({
      ok: true,
      series_code: seriesCode,
      fetched_periods: 0,
      upserted: 0,
      duration_ms: Date.now() - start,
      note: "EVDS hiç satır döndürmedi; mevcut veriler korundu.",
    });
  }

  // 2) Upsert
  const supabase = createClient(url, serviceKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  });

  const payload = rows.map((r) => ({
    series_code: seriesCode,
    period_month: r.period_month,
    index_value: r.index_value,
    monthly_change_pct: r.monthly_change_pct,
    is_final: r.is_final,
    source: "TCMB_EVDS",
    fetched_at: new Date().toISOString(),
  }));

  const { error: upsertErr, count } = await supabase
    .from("cpi_monthly")
    .upsert(payload as never, {
      onConflict: "series_code,period_month",
      count: "exact",
    });

  if (upsertErr) {
    return tag(
      {
        ok: false,
        stage: "upsert",
        error: upsertErr.message,
        fetched_periods: rows.length,
        duration_ms: Date.now() - start,
      },
      { status: 500 },
    );
  }

  const latestPeriod = rows[rows.length - 1]?.period_month ?? null;

  return tag({
    ok: true,
    series_code: seriesCode,
    fetched_periods: rows.length,
    upserted: count ?? rows.length,
    latest_period: latestPeriod,
    source: "TCMB_EVDS",
    duration_ms: Date.now() - start,
  });
}

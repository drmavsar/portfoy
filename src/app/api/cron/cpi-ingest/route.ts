/**
 * Vercel Cron — aylık CPI (TÜFE Genel) ingest.
 *
 * vercel.json: { schedule: "0 8 5 * *" }
 *   → Her ayın 5'inde UTC 08:00 (TR 11:00). TÜİK ayın 3'ü civarında
 *     bir önceki ay endeksini yayınlar; 5'i güvenli marj.
 *
 * Authorization: Bearer ${CRON_SECRET} (Vercel cron + manuel curl).
 *
 * Akış:
 *  1. /api/cpi-ingest endpoint'ini çağır (TCMB EVDS fetch)
 *  2. Yanıttaki rows[]'u cpi_monthly'e UPSERT (series_code, period_month)
 *  3. Sonuç JSON: { ok, fetched_periods, upserted, latest_period, ... }
 *
 * Manuel tetikleme:
 *   curl -H "Authorization: Bearer $CRON_SECRET" \
 *        "https://<host>/api/cron/cpi-ingest?series=CPI_TR_GENERAL"
 */

import { NextResponse, type NextRequest } from "next/server";
import { createClient } from "@supabase/supabase-js";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";
export const maxDuration = 60;

const DEFAULT_SERIES = "CPI_TR_GENERAL";

interface CpiIngestPyResponse {
  ok: boolean;
  fetched_at?: string;
  source?: string;
  series_code?: string;
  evds_series?: string;
  window?: { start: string; end: string };
  fetched_periods?: number;
  rows?: Array<{
    period_month: string;
    index_value: number;
    monthly_change_pct: number | null;
    is_final: boolean;
  }>;
  error?: string;
}

export async function GET(req: NextRequest) {
  const start = Date.now();
  const auth = req.headers.get("authorization");
  if (!process.env.CRON_SECRET || auth !== `Bearer ${process.env.CRON_SECRET}`) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !serviceKey) {
    return NextResponse.json(
      { error: "Missing env: SUPABASE_SERVICE_ROLE_KEY or NEXT_PUBLIC_SUPABASE_URL" },
      { status: 500 },
    );
  }

  const seriesCode = req.nextUrl.searchParams.get("series")?.toUpperCase() ?? DEFAULT_SERIES;

  const baseUrl =
    process.env.NEXT_PUBLIC_BASE_URL ??
    (process.env.VERCEL_URL ? `https://${process.env.VERCEL_URL}` : null) ??
    req.nextUrl.origin;

  // 1) Python endpoint'ten serileri çek
  const pyUrl = new URL("/api/cpi-ingest", baseUrl);
  pyUrl.searchParams.set("series", seriesCode);
  // start/end parametrelerini default'a bırak (Python: 2010-01 → bugünün ayı)

  let py: CpiIngestPyResponse;
  try {
    const res = await fetch(pyUrl.toString(), { cache: "no-store" });
    py = (await res.json()) as CpiIngestPyResponse;
    if (!res.ok || !py.ok) {
      return NextResponse.json(
        {
          ok: false,
          stage: "fetch_evds",
          error: py.error ?? `HTTP ${res.status}`,
          duration_ms: Date.now() - start,
        },
        { status: 502 },
      );
    }
  } catch (err) {
    return NextResponse.json(
      {
        ok: false,
        stage: "fetch_evds",
        error: err instanceof Error ? err.message : String(err),
        duration_ms: Date.now() - start,
      },
      { status: 502 },
    );
  }

  const rows = py.rows ?? [];
  if (rows.length === 0) {
    return NextResponse.json({
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
    return NextResponse.json(
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

  return NextResponse.json({
    ok: true,
    series_code: seriesCode,
    fetched_periods: rows.length,
    upserted: count ?? rows.length,
    latest_period: latestPeriod,
    source: "TCMB_EVDS",
    duration_ms: Date.now() - start,
  });
}

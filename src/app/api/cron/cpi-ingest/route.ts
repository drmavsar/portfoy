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
  const debug = req.nextUrl.searchParams.get("debug") === "1";
  const startParam = req.nextUrl.searchParams.get("start");
  const endParam = req.nextUrl.searchParams.get("end");

  const baseUrl =
    process.env.NEXT_PUBLIC_BASE_URL ??
    (process.env.VERCEL_URL ? `https://${process.env.VERCEL_URL}` : null) ??
    req.nextUrl.origin;

  // 1) Python endpoint'ten serileri çek — debug + tarih parametreleri forward
  const pyUrl = new URL("/api/cpi-ingest", baseUrl);
  pyUrl.searchParams.set("series", seriesCode);
  if (debug) pyUrl.searchParams.set("debug", "1");
  if (startParam) pyUrl.searchParams.set("start", startParam);
  if (endParam) pyUrl.searchParams.set("end", endParam);

  // Python yanıtını ham al; JSON parse edilemese bile body'i kullanıcıya göster
  let res: Response;
  try {
    res = await fetch(pyUrl.toString(), { cache: "no-store" });
  } catch (err) {
    return NextResponse.json(
      {
        ok: false,
        stage: "fetch_python_endpoint",
        error: err instanceof Error ? err.message : String(err),
        py_url: pyUrl.toString().replace(/key=[^&]+/, "key=***"),
        duration_ms: Date.now() - start,
      },
      { status: 502 },
    );
  }

  const responseContentType = res.headers.get("content-type") ?? "unknown";
  const rawBody = await res.text();
  let py: CpiIngestPyResponse & Record<string, unknown>;
  try {
    py = JSON.parse(rawBody) as CpiIngestPyResponse & Record<string, unknown>;
  } catch {
    // Python yanıtı JSON değil (Vercel 500 HTML sayfası, vb.) — full body döndür
    return NextResponse.json(
      {
        ok: false,
        stage: "python_response_not_json",
        py_status: res.status,
        py_content_type: responseContentType,
        py_body_snippet: rawBody.slice(0, 1000),
        duration_ms: Date.now() - start,
      },
      { status: 502 },
    );
  }

  // Debug mode: Python'ın tüm yanıtını yansıt
  if (debug) {
    return NextResponse.json(
      {
        ok: py.ok ?? false,
        stage: "debug",
        py_status: res.status,
        py_content_type: responseContentType,
        py_response: py,
        duration_ms: Date.now() - start,
      },
      { status: res.ok ? 200 : 502 },
    );
  }

  if (!res.ok || !py.ok) {
    // Python tarafından dönen hatayı tüm metadata ile yansıt
    return NextResponse.json(
      {
        ok: false,
        stage: "fetch_evds",
        py_status: res.status,
        py_content_type: responseContentType,
        py_response: py,
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

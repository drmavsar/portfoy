/**
 * Vercel Cron — günlük TEFAS NAV ingest'i.
 *
 * vercel.json: { schedule: "0 16 * * *" } → UTC 16:00 (TR 19:00).
 * TEFAS akşam NAV yayını sonrası.
 *
 * Authorization: Bearer ${CRON_SECRET} (Vercel cron + manuel curl).
 *
 * Akış (PR-B sonrası — function-to-function HTTP yok):
 *  1. funds tablosundan aktif fonları çek (veya ?code=XYZ override)
 *  2. fetchTefasPrices → fetchTefasNav (pure async, direct call — Python yok)
 *  3. Başarılı NAV'ları fund_prices'a UPSERT (fund_code,as_of)
 *  4. tefas_ingest_log'a best-effort kayıt
 *  5. JSON: { ok, requested, succeeded, upserted, failed_count, failed_codes, ... }
 *
 * Manuel tetikleme:
 *   curl -H "Authorization: Bearer $CRON_SECRET" \
 *        "https://<host>/api/cron/tefas-prices"
 *
 * Debug — tüm aktif fonlar, upsert yapmaz:
 *   curl -H "Authorization: Bearer $CRON_SECRET" \
 *        "https://<host>/api/cron/tefas-prices?debug=1"
 *
 * Debug — tek fon (POC):
 *   curl -H "Authorization: Bearer $CRON_SECRET" \
 *        "https://<host>/api/cron/tefas-prices?debug=1&code=YHK"
 */

import { NextResponse, type NextRequest } from "next/server";
import { createClient } from "@supabase/supabase-js";

import { fetchTefasPrices } from "@/app/(app)/_lib/tefas/prices-actions";
import { fetchOneFundDetailed } from "@/app/(app)/_lib/tefas/tefas-nav-fetch";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";
export const maxDuration = 300; // saniye — 155 fon × ~2s API çağrısı + retry

const WRAPPER_VERSION = "2026-05-30-pr-b-ts-port-tefas-spa-v2";
const TEFAS_ENDPOINT = "https://www.tefas.gov.tr/api/funds/fonFiyatBilgiGetir";
const TEFAS_API_VERSION = "v2-spa";
const RETRY_ATTEMPTS = 2;
const RETRY_DELAY_MS = 1500;

interface IngestResult {
  ok: boolean;
  ingest_at: string;
  duration_ms: number;
  requested: number;
  succeeded: number;
  upserted: number;
  failed_count: number;
  failed_codes: string[];
  upsert_error?: string;
  source: string;
}

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

/** TR saatine göre TEFAS'ın NAV yayınlamadığı gün/saat. */
function tefasOffHoursNote(now: Date): string | null {
  // TEFAS UTC+3 (TR). Pazartesi-Cuma 18:30 sonrası ertesi gün yayın.
  // Hafta sonu (Cumartesi/Pazar) yayın yok.
  const trMs = now.getTime() + 3 * 60 * 60 * 1000;
  const tr = new Date(trMs);
  const day = tr.getUTCDay(); // 0 Pazar, 6 Cumartesi
  if (day === 0 || day === 6) {
    return "TEFAS hafta sonu NAV yayınlamaz; failed_codes uzunsa nedeni budur.";
  }
  return null;
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

  const debug = req.nextUrl.searchParams.get("debug") === "1";
  const singleCode = req.nextUrl.searchParams.get("code")?.toUpperCase();
  const offHours = tefasOffHoursNote(new Date());

  // SINGLE-FUND POC MODE — tüm diagnostic yansır, upsert yapmaz
  if (singleCode) {
    const detail = await fetchOneFundDetailed(singleCode);
    const status = detail.ok ? 200 : 502;
    return tag(
      {
        stage: "single_fund_poc",
        ok: detail.ok,
        endpoint: TEFAS_ENDPOINT,
        tefas_api_version: TEFAS_API_VERSION,
        code: singleCode,
        row: detail.ok ? detail.row : undefined,
        failure: detail.ok ? undefined : detail.failure,
        off_hours_note: offHours,
        duration_ms: Date.now() - start,
      },
      { status },
    );
  }

  const supabase = createClient(url, serviceKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  });

  // 1) Aktif fonları çek
  const { data: fundsData, error: fundsErr } = await supabase
    .from("funds")
    .select("code")
    .eq("is_active", true)
    .order("code", { ascending: true });

  if (fundsErr) {
    return tag(
      { ok: false, stage: "funds_query", error: fundsErr.message },
      { status: 500 },
    );
  }
  const codes = ((fundsData ?? []) as Array<{ code: string }>).map((r) => r.code);
  if (codes.length === 0) {
    return tag({
      ok: true,
      ingest_at: new Date().toISOString(),
      duration_ms: Date.now() - start,
      requested: 0,
      succeeded: 0,
      upserted: 0,
      failed_count: 0,
      failed_codes: [],
      source: "tefas",
      endpoint: TEFAS_ENDPOINT,
      tefas_api_version: TEFAS_API_VERSION,
    });
  }

  // 2) NAV çek (pure async, function-to-function HTTP yok)
  const fetched = await fetchTefasPrices(codes, {
    maxAttempts: RETRY_ATTEMPTS,
    retryDelayMs: RETRY_DELAY_MS,
  });

  // Debug: bulk snapshot — upsert yok, failure detayı ilk N için
  if (debug) {
    const failureBreakdown = new Map<string, number>();
    for (const f of fetched.failures ?? []) {
      failureBreakdown.set(f.reason, (failureBreakdown.get(f.reason) ?? 0) + 1);
    }
    const succeededZero = (fetched.prices?.length ?? 0) === 0;
    return tag(
      {
        stage: "bulk_debug",
        ok: !succeededZero,
        partial: !succeededZero && (fetched.failed?.length ?? 0) > 0,
        endpoint: TEFAS_ENDPOINT,
        tefas_api_version: TEFAS_API_VERSION,
        requested: codes.length,
        succeeded: fetched.prices?.length ?? 0,
        failed_count: fetched.failed?.length ?? 0,
        failure_breakdown: Object.fromEntries(failureBreakdown),
        failures_sample: (fetched.failures ?? []).slice(0, 5),
        prices_sample: (fetched.prices ?? []).slice(0, 5),
        off_hours_note: offHours,
        duration_ms: Date.now() - start,
      },
      { status: succeededZero ? 502 : 200 },
    );
  }

  // 3) Başarılı NAV'ları upsert
  let upserted = 0;
  let upsertError: string | undefined;
  if (fetched.prices && fetched.prices.length > 0) {
    const payload = fetched.prices.map((p) => ({
      fund_code: p.code,
      as_of: p.as_of,
      nav: p.nav,
      source: "tefas",
      fetched_at: new Date().toISOString(),
    }));
    const { error: upsertErr, count } = await supabase
      .from("fund_prices")
      .upsert(payload as never, { onConflict: "fund_code,as_of", count: "exact" });
    if (upsertErr) {
      upsertError = upsertErr.message;
    } else {
      upserted = count ?? payload.length;
    }
  }

  const succeededCount = fetched.prices?.length ?? 0;
  // ok semantiği: tüm fonlar fail olduysa ok=false (eski davranış ok=true idi,
  // bu nedenle "ingest started" ile "succeeded" karıştırılıyordu).
  const allFailed = succeededCount === 0 && codes.length > 0;
  const ok = !upsertError && !allFailed;

  const result: IngestResult = {
    ok,
    ingest_at: new Date().toISOString(),
    duration_ms: Date.now() - start,
    requested: codes.length,
    succeeded: succeededCount,
    upserted,
    failed_count: fetched.failed?.length ?? 0,
    failed_codes: fetched.failed ?? [],
    upsert_error: upsertError,
    source: "tefas",
  };

  // 4) Ingest log'a yaz (best-effort — başarısız olursa sessizce devam et)
  const triggeredBy = req.headers.get("x-triggered-by") ?? "cron";
  const { error: logErr } = await supabase
    .from("tefas_ingest_log")
    .insert({
      duration_ms: result.duration_ms,
      requested: result.requested,
      succeeded: result.succeeded,
      upserted: result.upserted,
      failed_count: result.failed_count,
      failed_codes: result.failed_codes,
      upsert_error: result.upsert_error ?? null,
      source: result.source,
      triggered_by: triggeredBy,
    } as never);
  if (logErr) {
    console.error("tefas_ingest_log insert failed:", logErr.message);
  }

  return tag(
    {
      ...result,
      endpoint: TEFAS_ENDPOINT,
      tefas_api_version: TEFAS_API_VERSION,
      // İlk 5 failure'ın diagnostic detayı — neyin yanlış gittiğini anlamak için
      failures_sample: (fetched.failures ?? []).slice(0, 5),
      off_hours_note: offHours,
    },
    { status: upsertError ? 500 : allFailed ? 502 : 200 },
  );
}

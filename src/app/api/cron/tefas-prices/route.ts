/**
 * Vercel Cron — günlük TEFAS NAV ingest'i.
 *
 * vercel.json'da `crons: [{ path: "/api/cron/tefas-prices", schedule: "0 16 * * *" }]`
 * (UTC 16:00 → TR 19:00, TEFAS akşam NAV yayını sonrası).
 *
 * Authorization: Vercel cron `Authorization: Bearer ${CRON_SECRET}` gönderir.
 * Manuel tetikleme için aynı header ile curl edilebilir.
 *
 * Akış:
 *  1. funds tablosundan aktif fonları çek
 *  2. fetchTefasPrices ile 20-fon chunk'lar halinde NAV'ları al
 *     (chunk başına 2 deneme, retry'lar arası exponential backoff)
 *  3. Başarılı NAV'ları fund_prices'a upsert (onConflict: fund_code,as_of)
 *  4. Sonuç JSON: { ok, requested, succeeded, failed_count, failed_codes, ... }
 *
 * Aynı gün tekrar çalıştırılırsa upsert duplicate insert yapmaz; mevcut satırı
 * günceller (nav + fetched_at).
 */

import { NextResponse, type NextRequest } from "next/server";
import { createClient } from "@supabase/supabase-js";

import { fetchTefasPrices } from "@/app/(app)/_lib/tefas/prices-actions";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";
export const maxDuration = 300; // saniye — 155 fon × ~2s API çağrısı + retry

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

  // Base URL — kendi Python endpoint'imizi çağırmak için. Tercih sırası:
  //   NEXT_PUBLIC_BASE_URL > VERCEL_URL > req.nextUrl.origin
  const baseUrl =
    process.env.NEXT_PUBLIC_BASE_URL ??
    (process.env.VERCEL_URL ? `https://${process.env.VERCEL_URL}` : null) ??
    req.nextUrl.origin;

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
    return NextResponse.json({ error: `funds query: ${fundsErr.message}` }, { status: 500 });
  }
  const codes = ((fundsData ?? []) as Array<{ code: string }>).map((r) => r.code);
  if (codes.length === 0) {
    return NextResponse.json({
      ok: true,
      ingest_at: new Date().toISOString(),
      duration_ms: Date.now() - start,
      requested: 0,
      succeeded: 0,
      upserted: 0,
      failed_count: 0,
      failed_codes: [],
      source: "tefas",
    } satisfies IngestResult);
  }

  // 2) NAV çek (chunk + retry)
  const fetched = await fetchTefasPrices(codes, {
    baseUrl,
    maxAttempts: RETRY_ATTEMPTS,
    retryDelayMs: RETRY_DELAY_MS,
    cache: "no-store",
  });

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

  const result: IngestResult = {
    ok: !upsertError,
    ingest_at: new Date().toISOString(),
    duration_ms: Date.now() - start,
    requested: codes.length,
    succeeded: fetched.prices?.length ?? 0,
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

  return NextResponse.json(result, { status: upsertError ? 500 : 200 });
}

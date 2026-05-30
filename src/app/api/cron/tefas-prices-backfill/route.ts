/**
 * Manual cron — TEFAS NAV history backfill.
 *
 * Amaç: `fund_prices` tablosunu sadece son NAV ile değil, 1Y/3Y/5Y returns ve
 * volatility/Sharpe hesaplamaları için yeterli tarihsel NAV ile doldurmak.
 * Mehmet Score'un gerçek veriyle hesaplanmasının ön koşulu.
 *
 * Vercel cron'da yok — manuel tetiklenir (tek seferlik backfill + ad-hoc).
 * Authorization: Bearer ${CRON_SECRET}.
 *
 * Query parametreleri:
 *   period={1|3|6|12|36|60}  — TEFAS lookback ay (default 60 = 5 yıl)
 *   code=YHK                  — tek fon POC modu (upsert YOK, tüm diagnostic)
 *   codes=YHK,HFI,KMF         — virgülle ayrılmış subset (override funds query)
 *   offset=0&limit=50         — funds tablosunun sayfası (timeout için chunking)
 *   dryRun=1                  — upsert YOK, sadece fetch + diagnostic
 *
 * Örnek kullanım:
 *   # Tek fon POC
 *   curl -H "Authorization: Bearer $CRON_SECRET" \
 *     "https://<host>/api/cron/tefas-prices-backfill?period=60&code=YHK"
 *
 *   # Bulk (155 fon × 5 yıl, ~5-15dk)
 *   curl -H "Authorization: Bearer $CRON_SECRET" \
 *     "https://<host>/api/cron/tefas-prices-backfill?period=60"
 *
 *   # Chunked (timeout için, ilk 50 fon)
 *   curl -H "Authorization: Bearer $CRON_SECRET" \
 *     "https://<host>/api/cron/tefas-prices-backfill?period=60&offset=0&limit=50"
 *
 * Idempotent: UPSERT (fund_code, as_of) — aynı gün tekrar çalışırsa duplicate yok.
 */

import { NextResponse, type NextRequest } from "next/server";
import { createClient } from "@supabase/supabase-js";

import {
  fetchTefasNavHistory,
  type NavHistoryResult,
  type TefasPeriod,
} from "@/app/(app)/_lib/tefas/tefas-nav-fetch";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";
// Maksimum süre: 5 yıllık 155 fon (concurrency 3 ile ~100-200s) + Supabase upsert.
// Hobby plan limiti 60s; Pro 300s. Chunking için offset/limit kullanılabilir.
export const maxDuration = 300;

const WRAPPER_VERSION = "2026-05-30-pr-c-nav-backfill";
const TEFAS_ENDPOINT = "https://www.tefas.gov.tr/api/funds/fonFiyatBilgiGetir";
const TEFAS_API_VERSION = "v2-spa";
const UPSERT_CHUNK_SIZE = 1000;

const VALID_PERIODS: ReadonlySet<TefasPeriod> = new Set([1, 3, 6, 12, 36, 60]);

function tag<T extends Record<string, unknown>>(
  body: T,
  init: { status?: number } = {},
): NextResponse<T & { wrapper_version: string }> {
  return NextResponse.json(
    { ...body, wrapper_version: WRAPPER_VERSION },
    {
      status: init.status,
      headers: { "x-wrapper-version": WRAPPER_VERSION },
    },
  );
}

function parsePeriod(raw: string | null): TefasPeriod | null {
  if (raw == null) return 60;
  const n = Number(raw);
  return VALID_PERIODS.has(n as TefasPeriod) ? (n as TefasPeriod) : null;
}

function parseNonNegativeInt(raw: string | null): number | null {
  if (raw == null) return null;
  const n = Number(raw);
  return Number.isInteger(n) && n >= 0 ? n : null;
}

// upsert helper inlined into GET — Supabase v2 client generics ReturnType
// inference ile uyumsuz; helper signature'ında any kullanmaktansa inline.

interface RowsPerFundSummary {
  funds_total: number;
  funds_with_zero_rows: number;
  rows_total: number;
  rows_min: number | null;
  rows_max: number | null;
  rows_avg: number | null;
  rows_median: number | null;
  funds_with_1y_plus: number;
  funds_with_3y_plus: number;
}

function summarizeRowsPerFund(
  rowsPerFund: Record<string, number>,
): RowsPerFundSummary {
  const counts = Object.values(rowsPerFund);
  const funds_total = counts.length;
  if (funds_total === 0) {
    return {
      funds_total: 0,
      funds_with_zero_rows: 0,
      rows_total: 0,
      rows_min: null,
      rows_max: null,
      rows_avg: null,
      rows_median: null,
      funds_with_1y_plus: 0,
      funds_with_3y_plus: 0,
    };
  }
  const sorted = [...counts].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  const median =
    sorted.length % 2 === 0
      ? (sorted[mid - 1] + sorted[mid]) / 2
      : sorted[mid];
  // TEFAS işgünü ~22/ay → 1Y ≈ 220 satır, 3Y ≈ 660 satır (gevşek eşik 200/600)
  return {
    funds_total,
    funds_with_zero_rows: counts.filter((n) => n === 0).length,
    rows_total: counts.reduce((a, b) => a + b, 0),
    rows_min: sorted[0],
    rows_max: sorted[sorted.length - 1],
    rows_avg: Number((counts.reduce((a, b) => a + b, 0) / funds_total).toFixed(1)),
    rows_median: median,
    funds_with_1y_plus: counts.filter((n) => n >= 200).length,
    funds_with_3y_plus: counts.filter((n) => n >= 600).length,
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

  const sp = req.nextUrl.searchParams;
  const period = parsePeriod(sp.get("period"));
  if (period === null) {
    return tag(
      { ok: false, error: "Geçersiz period. Kabul edilen: 1/3/6/12/36/60" },
      { status: 400 },
    );
  }

  const singleCode = sp.get("code")?.toUpperCase().trim() || null;
  const codesParam = sp.get("codes");
  const offset = parseNonNegativeInt(sp.get("offset")) ?? 0;
  const limit = parseNonNegativeInt(sp.get("limit"));
  const dryRun = sp.get("dryRun") === "1";

  const supabase = createClient(url, serviceKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  });

  // ── SINGLE-FUND POC ────────────────────────────────────────────────────────
  if (singleCode) {
    const result = await fetchTefasNavHistory([singleCode], { periodMonths: period });
    const rowCount = result.rows_per_fund[singleCode] ?? 0;
    return tag(
      {
        stage: "single_fund_poc",
        ok: result.ok,
        endpoint: TEFAS_ENDPOINT,
        tefas_api_version: TEFAS_API_VERSION,
        period_months: period,
        code: singleCode,
        rows_returned: rowCount,
        date_min: result.date_min,
        date_max: result.date_max,
        sample_rows: result.prices.slice(0, 3),
        failure: result.failures[0],
        duration_ms: Date.now() - start,
      },
      { status: result.ok ? 200 : 502 },
    );
  }

  // ── CODES: aktif fonlar veya ?codes=... subset ─────────────────────────────
  let codes: string[];
  if (codesParam) {
    codes = codesParam
      .split(",")
      .map((c) => c.trim().toUpperCase())
      .filter(Boolean);
  } else {
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
    codes = ((fundsData ?? []) as Array<{ code: string }>).map((r) => r.code);
  }

  const totalAvailable = codes.length;
  // offset/limit chunking (timeout için)
  if (offset > 0 || limit !== null) {
    codes = codes.slice(offset, limit !== null ? offset + limit : undefined);
  }

  if (codes.length === 0) {
    return tag({
      ok: true,
      stage: "noop",
      message: "İşlenecek fon yok (offset/limit dışı veya boş funds tablosu).",
      total_available: totalAvailable,
      offset,
      limit,
      duration_ms: Date.now() - start,
    });
  }

  // ── BULK FETCH ─────────────────────────────────────────────────────────────
  const fetched: NavHistoryResult = await fetchTefasNavHistory(codes, {
    periodMonths: period,
  });

  const summary = summarizeRowsPerFund(fetched.rows_per_fund);

  // ── UPSERT (dryRun ise atla) ────────────────────────────────────────────────
  let upserted = 0;
  let upsertError: string | undefined;
  if (!dryRun && fetched.prices.length > 0) {
    const fetchedAt = new Date().toISOString();
    for (let i = 0; i < fetched.prices.length; i += UPSERT_CHUNK_SIZE) {
      const chunk = fetched.prices.slice(i, i + UPSERT_CHUNK_SIZE);
      const payload = chunk.map((p) => ({
        fund_code: p.code,
        as_of: p.as_of,
        nav: p.nav,
        total_value_try: p.total_value_try,
        share_count: p.share_count,
        investor_count: p.investor_count,
        source: "tefas",
        fetched_at: fetchedAt,
      }));
      const { error, count } = await supabase
        .from("fund_prices")
        .upsert(payload as never, { onConflict: "fund_code,as_of", count: "exact" });
      if (error) {
        upsertError = error.message;
        break;
      }
      upserted += count ?? payload.length;
    }
  }

  // funds.name UPDATE — TEFAS'tan title geliyor (fonUnvan). Seed sırasında
  // funds.name çoğu zaman code'un kendisi olarak doldurulur; ilk gelen non-null
  // title ile güncelle. dryRun ise atla.
  let names_updated = 0;
  let names_update_error: string | undefined;
  if (!dryRun && fetched.prices.length > 0) {
    const firstTitleByCode = new Map<string, string>();
    for (const row of fetched.prices) {
      if (!firstTitleByCode.has(row.code) && row.title && row.title.trim() !== "") {
        firstTitleByCode.set(row.code, row.title.trim());
      }
    }
    if (firstTitleByCode.size > 0) {
      // Sadece name = code olan satırları güncelle (eski seed'leri).
      // Manuel düzenlenmiş isimler korunur.
      for (const [code, title] of firstTitleByCode) {
        const { error: nameErr } = await supabase
          .from("funds")
          .update({ name: title } as never)
          .eq("code", code)
          .eq("name", code);
        if (nameErr) {
          names_update_error = nameErr.message;
          break;
        }
        names_updated++;
      }
    }
  }

  // KRA ve diğer "veri yok" fonları data quality exception olarak ayır
  const dataQualityExceptions = fetched.failures
    .filter((f) => f.reason === "empty_result")
    .map((f) => ({ code: f.code, reason: "delisted_or_no_data" as const }));

  return tag(
    {
      ok: fetched.succeeded > 0 && !upsertError,
      stage: dryRun ? "dry_run" : "backfill",
      endpoint: TEFAS_ENDPOINT,
      tefas_api_version: TEFAS_API_VERSION,
      period_months: period,
      total_available: totalAvailable,
      offset,
      limit,
      requested: codes.length,
      succeeded: fetched.succeeded,
      failed_count: fetched.failed.length,
      failed_codes: fetched.failed,
      upserted_rows: upserted,
      date_min: fetched.date_min,
      date_max: fetched.date_max,
      rows_per_fund_summary: summary,
      // İlk 10 fon için kaç satır geldi (örnekleme)
      rows_per_fund_sample: Object.fromEntries(
        Object.entries(fetched.rows_per_fund).slice(0, 10),
      ),
      failures_sample: fetched.failures.slice(0, 5),
      // Data quality: KRA gibi delisted fonlar — blokaj değil, bilgi
      data_quality_exceptions: dataQualityExceptions,
      upsert_error: upsertError,
      names_updated,
      names_update_error,
      duration_ms: Date.now() - start,
    },
    { status: upsertError ? 500 : 200 },
  );
}

"use server";

import { isSupabaseConfigured } from "@/app/(app)/ayarlar/actions";
import { createClient, createServiceClient } from "@/lib/supabase/server";
import {
  fetchTefasNav,
  type NavFetchFailure,
  type TefasPeriod,
} from "./tefas-nav-fetch";
import type { FundPrice } from "./types";

/**
 * Yeni TS port — `api/tefas-prices.py` artık yok. Function-to-function HTTP
 * çağrısı kaldırıldı; doğrudan TEFAS yeni JSON API'ye gidiyoruz
 * (Vercel Deployment Protection sorunu yok).
 *
 * Backward-compat: önceki şema { ok, source, succeeded, failed, prices } korundu.
 * `options.start/end` artık ignore edilir — TEFAS yeni API sadece sabit
 * `periodMonths` enum'u kabul ediyor (1/3/6/12/36/60).
 */

interface TefasFetchResult {
  ok: boolean;
  source: string;
  fetched_at?: string;
  endpoint?: string;
  requested?: number;
  succeeded?: number;
  failed?: string[];
  /** Failure detayları (debug için). */
  failures?: NavFetchFailure[];
  prices?: Array<{ code: string; title: string | null; as_of: string; nav: number }>;
  error?: string;
}

interface FetchOptions {
  /** @deprecated TEFAS yeni API tarih aralığı kabul etmiyor; ignore edilir. */
  start?: string;
  /** @deprecated TEFAS yeni API tarih aralığı kabul etmiyor; ignore edilir. */
  end?: string;
  /** @deprecated HTTP çağrısı yok artık. */
  baseUrl?: string;
  /** Bir çağrı başarısızsa kaç deneme (default 2 — TEFAS rate limit'i için). */
  maxAttempts?: number;
  /** Retry'lar arası bekleme (ms). */
  retryDelayMs?: number;
  /** TEFAS lookback (ay). 1/3/6/12/36/60. Default 1 — günlük cron için yeter. */
  periodMonths?: TefasPeriod;
  /** @deprecated cache stratejisi artık no-store sabit. */
  cache?: "revalidate" | "no-store";
}

async function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/**
 * Tüm aktif fonların en son NAV'ını TEFAS yeni JSON API'sinden çek.
 *
 * Retry: başarısız fonlar için aynı kodlar tekrar denenir (TEFAS rate limit
 * geçici reject'lerine karşı koruma).
 */
export async function fetchTefasPrices(
  codes: string[],
  options: FetchOptions = {},
): Promise<TefasFetchResult> {
  if (codes.length === 0) {
    return { ok: true, source: "tefas", succeeded: 0, failed: [], prices: [] };
  }

  const maxAttempts = Math.max(1, options.maxAttempts ?? 2);
  const retryDelayMs = options.retryDelayMs ?? 1500;
  const periodMonths = options.periodMonths ?? 1;

  const merged: Required<Pick<TefasFetchResult, "prices" | "failed" | "failures">> &
    TefasFetchResult = {
    ok: true,
    source: "tefas",
    fetched_at: new Date().toISOString(),
    requested: codes.length,
    succeeded: 0,
    prices: [],
    failed: [],
    failures: [],
  };

  let remaining = [...codes];
  let lastFailures: NavFetchFailure[] = [];
  let lastEndpoint: string | undefined;
  for (let attempt = 1; attempt <= maxAttempts && remaining.length > 0; attempt++) {
    const result = await fetchTefasNav(remaining, { periodMonths });
    merged.prices.push(...result.prices);
    remaining = result.failed;
    lastFailures = result.failures;
    lastEndpoint = result.endpoint;
    if (remaining.length > 0 && attempt < maxAttempts) {
      await sleep(retryDelayMs * attempt);
    }
  }
  merged.failed.push(...remaining);
  merged.failures.push(...lastFailures);
  merged.succeeded = merged.prices.length;
  merged.endpoint = lastEndpoint;
  merged.ok = merged.prices.length > 0;
  return merged;
}

/**
 * fund_prices tablosuna upsert.
 */
export async function upsertFundPrices(
  rows: Array<{ fund_code: string; as_of: string; nav: number; source?: string }>,
): Promise<{ ok: boolean; inserted?: number; error?: string }> {
  if (rows.length === 0) return { ok: true, inserted: 0 };
  if (!(await isSupabaseConfigured())) {
    return { ok: false, error: "Supabase yapılandırılmamış." };
  }
  const supabase = await createServiceClient();
  const payload = rows.map((r) => ({
    fund_code: r.fund_code,
    as_of: r.as_of,
    nav: r.nav,
    source: r.source ?? "tefas",
    fetched_at: new Date().toISOString(),
  }));
  const { error } = await supabase
    .from("fund_prices")
    .upsert(payload as never, { onConflict: "fund_code,as_of" });
  if (error) return { ok: false, error: error.message };
  return { ok: true, inserted: rows.length };
}

/**
 * Sprint-3 performans motoru ve UI için: takipteki / belirtilen fonların
 * son fiyatları (v_fund_prices_latest view).
 */
export async function listLatestFundPrices(codes?: string[]): Promise<FundPrice[]> {
  if (!(await isSupabaseConfigured())) return [];
  const supabase = await createClient();
  let q = supabase.from("v_fund_prices_latest").select("*");
  if (codes && codes.length > 0) q = q.in("fund_code", codes);
  const { data, error } = await q;
  if (error) {
    console.error("listLatestFundPrices error", error);
    return [];
  }
  return (data ?? []) as FundPrice[];
}

/**
 * Tek bir fon için en son NAV'ı al.
 */
export async function getLatestFundPrice(code: string): Promise<FundPrice | null> {
  const rows = await listLatestFundPrices([code]);
  return rows[0] ?? null;
}

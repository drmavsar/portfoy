"use server";

import { revalidatePath } from "next/cache";

import { isSupabaseConfigured } from "@/app/(app)/ayarlar/actions";
import { createAdminClient, createClient } from "@/lib/supabase/server";
import { loadFundQuotes, type FundQuote } from "./fund-quotes";
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
  // fund_prices yalnız okunabilir (RLS); çerezli istemci oturum açıkken
  // kullanıcı rolüyle yazıp reddediliyordu. Çerezsiz service-role şart.
  const supabase = createAdminClient();
  if (!supabase) return { ok: false, error: "SUPABASE_SERVICE_ROLE_KEY tanımlı değil." };
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

/**
 * Holdings/UI için: belirtilen fonların son NAV'ı + bir önceki yayın NAV'ı
 * (günlük değişim hesaplanabilsin diye). Okuma `fund-quotes.ts`'te; cron da
 * aynı fonksiyonu service-role istemciyle kullanır.
 */
export async function listFundQuotes(codes: string[]): Promise<FundQuote[]> {
  if (codes.length === 0) return [];
  if (!(await isSupabaseConfigured())) return [];
  const supabase = await createClient();
  try {
    return await loadFundQuotes(supabase, codes);
  } catch (e) {
    console.error("listFundQuotes error", e);
    return [];
  }
}

/**
 * Portföyde tutulan fonların güncel NAV'ını TEFAS'tan canlı çekip fund_prices'a
 * yazar. "Güncelle" butonu cron'a bağımlı kalmadan anlık tazeleme yapsın diye.
 *
 * Best-effort: TEFAS erişilemez / off-hours ise sessizce 0 güncellemeyle döner;
 * çağıran taraftaki diğer tazelemeleri (hisse) bozmaz.
 */
export async function refreshHeldFundPrices(): Promise<{
  ok: boolean;
  updated: number;
  failed: string[];
  codes: string[];
  /** TEFAS'tan gelen son fiyatın tarihi (fon başına) */
  latest?: Array<{ code: string; as_of: string }>;
  /** Fiyat geldi ama veritabanına yazılamadı */
  saveError?: string;
}> {
  if (!(await isSupabaseConfigured())) {
    return { ok: false, updated: 0, failed: [], codes: [] };
  }
  const supabase = await createClient();

  // Portföydeki fon kodları: v_holdings_wac (qty>0) ∩ assets(asset_class='fund')
  const [{ data: holdings }, { data: fundAssets }] = await Promise.all([
    supabase.from("v_holdings_wac").select("asset_id, quantity"),
    supabase.from("assets").select("id, symbol").eq("asset_class", "fund"),
  ]);
  const codeById = new Map(
    ((fundAssets ?? []) as Array<{ id: string; symbol: string }>).map((a) => [a.id, a.symbol]),
  );
  const codes = Array.from(
    new Set(
      ((holdings ?? []) as Array<{ asset_id: string; quantity: number }>)
        .filter((h) => Number(h.quantity) > 0 && codeById.has(h.asset_id))
        .map((h) => codeById.get(h.asset_id) as string),
    ),
  );
  if (codes.length === 0) return { ok: true, updated: 0, failed: [], codes: [] };

  const fetched = await fetchTefasPrices(codes, { maxAttempts: 2 });
  let updated = 0;
  let upsertError: string | undefined;
  if (fetched.prices && fetched.prices.length > 0) {
    const res = await upsertFundPrices(
      fetched.prices.map((p) => ({ fund_code: p.code, as_of: p.as_of, nav: p.nav })),
    );
    if (res.ok) updated = fetched.prices.length;
    else upsertError = res.error;
  }

  // Teşhis: Hobby planda log 1 saat tutulur; buton sonrası Vercel loglarında
  // TEFAS'ın ne döndürdüğü (tarih/fiyat ya da hata nedeni) görünsün.
  const got = (fetched.prices ?? []).map((p) => `${p.code} ${p.as_of} ${p.nav}`);
  const failures = (fetched.failures ?? []).map(
    (f) =>
      `${f.code}:${f.reason}${f.http_status ? `/${f.http_status}` : ""}` +
      `${f.error_message ? ` ${f.error_message}` : ""}` +
      `${f.body_snippet ? ` «${f.body_snippet.slice(0, 160)}»` : ""}`,
  );
  if (failures.length > 0 || upsertError) {
    console.warn("[fund-refresh]", { codes, got, failures, upsertError });
  } else {
    console.info("[fund-refresh]", { codes, got });
  }

  revalidatePath("/yatirimlar");
  revalidatePath("/ozet");
  return {
    ok: !upsertError && (fetched.failed ?? []).length === 0,
    updated,
    failed: fetched.failed ?? [],
    codes,
    latest: (fetched.prices ?? []).map((p) => ({ code: p.code, as_of: p.as_of })),
    saveError: upsertError,
  };
}

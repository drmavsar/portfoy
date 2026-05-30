"use server";

import { isSupabaseConfigured } from "@/app/(app)/ayarlar/actions";
import { createClient, createServiceClient } from "@/lib/supabase/server";
import type { FundPrice } from "./types";

const TEFAS_PRICES_PATH = "/api/tefas-prices";
const MAX_CODES_PER_REQUEST = 20;

interface TefasFetchResult {
  ok: boolean;
  source: string;
  fetched_at?: string;
  requested?: number;
  succeeded?: number;
  failed?: string[];
  prices?: Array<{ code: string; title: string | null; as_of: string; nav: number }>;
  error?: string;
}

/**
 * `/api/tefas-prices` endpoint'inden bir veya birden çok fonun en son NAV'ını çek.
 * POC: bir tarih aralığı verilirse o aralıktaki son NAV; verilmezse son 5 gün.
 *
 * Birden çok fon `MAX_CODES_PER_REQUEST` ile sınırlı; üstü chunk'lara bölünür.
 */
export async function fetchTefasPrices(
  codes: string[],
  options: { start?: string; end?: string; baseUrl?: string } = {},
): Promise<TefasFetchResult> {
  if (codes.length === 0) {
    return { ok: true, source: "tefas", succeeded: 0, failed: [], prices: [] };
  }

  const baseUrl =
    options.baseUrl ??
    process.env.NEXT_PUBLIC_BASE_URL ??
    process.env.VERCEL_URL ??
    "http://localhost:3000";
  const normalized = baseUrl.startsWith("http") ? baseUrl : `https://${baseUrl}`;

  const chunks: string[][] = [];
  for (let i = 0; i < codes.length; i += MAX_CODES_PER_REQUEST) {
    chunks.push(codes.slice(i, i + MAX_CODES_PER_REQUEST));
  }

  const merged: TefasFetchResult = {
    ok: true,
    source: "tefas",
    fetched_at: new Date().toISOString(),
    requested: codes.length,
    succeeded: 0,
    failed: [],
    prices: [],
  };

  for (const chunk of chunks) {
    const url = new URL(`${normalized}${TEFAS_PRICES_PATH}`);
    url.searchParams.set("codes", chunk.join(","));
    if (options.start) url.searchParams.set("start", options.start);
    if (options.end) url.searchParams.set("end", options.end);

    try {
      const res = await fetch(url.toString(), { next: { revalidate: 21600 } });
      if (!res.ok) {
        merged.failed!.push(...chunk);
        continue;
      }
      const data = (await res.json()) as TefasFetchResult;
      if (!data.ok) {
        merged.failed!.push(...chunk);
        continue;
      }
      merged.prices!.push(...(data.prices ?? []));
      merged.failed!.push(...(data.failed ?? []));
    } catch (err) {
      console.error("fetchTefasPrices chunk error", err);
      merged.failed!.push(...chunk);
    }
  }
  merged.succeeded = merged.prices!.length;
  return merged;
}

/**
 * fund_prices tablosuna upsert. PR-2 bulk ingest tarafından kullanılacak;
 * POC için tek tek çağırarak da test edilebilir.
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

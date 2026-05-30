"use server";

import { isSupabaseConfigured } from "@/app/(app)/ayarlar/actions";
import { createClient, createServiceClient } from "@/lib/supabase/server";
import {
  applyTaxToCagr,
  applyWithholdingTax,
  computeFundReturns,
  median,
  vsCategoryDelta,
  type CpiByPeriod,
  type FundReturnsComputation,
  type NavPoint,
} from "./returns-logic";
import { resolveTaxRulePure } from "./tax-rules-logic";
import type {
  Fund,
  FundReturns,
  FundTaxKind,
  FundTaxRule,
} from "./types";

const DEFAULT_CPI_SERIES = "CPI_TR_GENERAL";

export async function listLatestFundReturns(codes?: string[]): Promise<FundReturns[]> {
  if (!(await isSupabaseConfigured())) return [];
  const supabase = await createClient();
  let q = supabase.from("v_fund_returns_latest").select("*");
  if (codes && codes.length > 0) q = q.in("fund_code", codes);
  const { data, error } = await q;
  if (error) {
    console.error("listLatestFundReturns error", error);
    return [];
  }
  return (data ?? []) as FundReturns[];
}

export async function getLatestFundReturns(code: string): Promise<FundReturns | null> {
  const rows = await listLatestFundReturns([code]);
  return rows[0] ?? null;
}

/**
 * Tüm aktif fonlar için cache'i hesapla + UPSERT et.
 *
 * Akış:
 *  1. fund_prices'tan her aktif fonun NAV serisini çek (max ~6 yıl geçmiş)
 *  2. cpi_monthly'den varsayılan seriyi haritala
 *  3. Her fon için computeFundReturns → gross + real
 *  4. Kategori bazında medyan(gross_1y, gross_3y_cagr) hesapla
 *  5. vs_category_1y, vs_category_3y'yi her fonun değerinden çıkar
 *  6. fund_returns_cache'a batch UPSERT
 *
 * Cron veya manuel refresh endpoint'i tarafından çağrılır. Service role
 * gerekir (RLS bypass + write).
 */
export async function refreshAllFundReturns(): Promise<{
  ok: boolean;
  processed: number;
  upserted: number;
  skipped: string[];
  duration_ms: number;
  error?: string;
}> {
  const start = Date.now();
  if (!(await isSupabaseConfigured())) {
    return { ok: false, processed: 0, upserted: 0, skipped: [], duration_ms: 0, error: "Supabase yapılandırılmamış." };
  }
  const supabase = await createServiceClient();

  // 1) Aktif fonlar — net hesabı için tax_confidence ve tüm flag'ler lazım
  const { data: fundsData, error: fundsErr } = await supabase
    .from("funds")
    .select("code, category_id, tax_confidence")
    .eq("is_active", true);
  if (fundsErr) {
    return { ok: false, processed: 0, upserted: 0, skipped: [], duration_ms: Date.now() - start, error: fundsErr.message };
  }
  type FundLite = Pick<Fund, "code" | "category_id" | "tax_confidence">;
  const funds = (fundsData ?? []) as FundLite[];
  if (funds.length === 0) {
    return { ok: true, processed: 0, upserted: 0, skipped: [], duration_ms: Date.now() - start };
  }

  // 1b) Vergi kuralları + kategori default'ları (resolveTaxRulePure için)
  const { data: rulesData } = await supabase
    .from("fund_tax_rules")
    .select("*")
    .eq("is_active", true);
  const taxRules = (rulesData ?? []) as FundTaxRule[];

  const { data: catData } = await supabase
    .from("fund_categories")
    .select("id, default_tax_kind");
  const defaultKindByCategory = new Map<number, FundTaxKind>();
  for (const c of (catData ?? []) as Array<{ id: number; default_tax_kind: FundTaxKind }>) {
    defaultKindByCategory.set(c.id, c.default_tax_kind);
  }

  // 2) NAV serileri — son 6 yıl yeter (5Y CAGR için)
  const cutoff = new Date();
  cutoff.setFullYear(cutoff.getFullYear() - 6);
  const cutoffIso = cutoff.toISOString().slice(0, 10);

  const { data: pricesData, error: pricesErr } = await supabase
    .from("fund_prices")
    .select("fund_code, as_of, nav")
    .gte("as_of", cutoffIso)
    .order("fund_code", { ascending: true })
    .order("as_of", { ascending: true });
  if (pricesErr) {
    return { ok: false, processed: 0, upserted: 0, skipped: [], duration_ms: Date.now() - start, error: pricesErr.message };
  }
  const rawPrices = (pricesData ?? []) as Array<{ fund_code: string; as_of: string; nav: number }>;
  const seriesByFund = new Map<string, NavPoint[]>();
  for (const row of rawPrices) {
    const list = seriesByFund.get(row.fund_code) ?? [];
    list.push({ as_of: row.as_of, nav: Number(row.nav) });
    seriesByFund.set(row.fund_code, list);
  }

  // 3) CPI sözlüğü
  const { data: cpiData, error: cpiErr } = await supabase
    .from("cpi_monthly")
    .select("period_month, index_value")
    .eq("series_code", DEFAULT_CPI_SERIES);
  if (cpiErr) {
    console.error("CPI read error:", cpiErr.message);
  }
  const cpi: CpiByPeriod = {};
  for (const c of (cpiData ?? []) as Array<{ period_month: string; index_value: number }>) {
    cpi[c.period_month] = Number(c.index_value);
  }

  // 4) Her fon için brüt + reel hesapla
  const skipped: string[] = [];
  const computations = new Map<string, { fund: FundLite; comp: FundReturnsComputation }>();
  for (const fund of funds) {
    const series = seriesByFund.get(fund.code);
    if (!series || series.length === 0) {
      skipped.push(fund.code);
      continue;
    }
    const comp = computeFundReturns(series, { cpi });
    if (!comp) {
      skipped.push(fund.code);
      continue;
    }
    computations.set(fund.code, { fund, comp });
  }

  // 5) Kategori medyanları (1y ve 3y için) — her kategori için ayrı
  const byCategory = new Map<number, FundReturnsComputation[]>();
  for (const { fund, comp } of computations.values()) {
    const list = byCategory.get(fund.category_id) ?? [];
    list.push(comp);
    byCategory.set(fund.category_id, list);
  }
  const medianByCategory = new Map<number, { median_1y: number | null; median_3y: number | null }>();
  for (const [catId, comps] of byCategory) {
    medianByCategory.set(catId, {
      median_1y: median(comps.map((c) => c.gross_1y)),
      median_3y: median(comps.map((c) => c.gross_3y_cagr)),
    });
  }

  // 6) Net getiri (stopaj sonrası) — Sprint-3 PR-3
  //    Her pencere için resolveTaxRulePure(fund, acquired, sold) çağrılır.
  //    Lot-bazlı tarih semantiği: 1Y için (as_of − 1y) iktisap; 3Y/5Y benzer.
  function shiftYears(iso: string, years: number): string {
    const d = new Date(`${iso}T00:00:00Z`);
    d.setUTCFullYear(d.getUTCFullYear() - years);
    return d.toISOString().slice(0, 10);
  }

  const payload = [...computations.values()].map(({ fund, comp }) => {
    const cat = medianByCategory.get(fund.category_id);
    const defaultKind = defaultKindByCategory.get(fund.category_id) ?? "BELIRSIZ";

    // Vergi kuralı: 1Y pencere üzerinden çözünür (PR-3 için tek as_of)
    // Net hesabı her pencerede aynı kural varsayımıyla yapılır.
    const acquired1y = shiftYears(comp.as_of, 1);
    const tax = resolveTaxRulePure(fund, taxRules, defaultKind, acquired1y, comp.as_of);

    const net_1y = applyWithholdingTax(comp.gross_1y, tax.effective_rate);
    const net_3y_cagr = applyTaxToCagr(comp.gross_3y_cagr, tax.effective_rate, 3);
    const net_5y_cagr = applyTaxToCagr(comp.gross_5y_cagr, tax.effective_rate, 5);

    return {
      fund_code: fund.code,
      as_of: comp.as_of,
      gross_1d: comp.gross_1d,
      gross_1w: comp.gross_1w,
      gross_1m: comp.gross_1m,
      gross_3m: comp.gross_3m,
      gross_6m: comp.gross_6m,
      gross_ytd: comp.gross_ytd,
      gross_1y: comp.gross_1y,
      gross_3y_cagr: comp.gross_3y_cagr,
      gross_5y_cagr: comp.gross_5y_cagr,
      real_1y: comp.real_1y,
      real_3y_cagr: comp.real_3y_cagr,
      real_5y_cagr: comp.real_5y_cagr,
      vs_category_1y: vsCategoryDelta(comp.gross_1y, cat?.median_1y ?? null),
      vs_category_3y: vsCategoryDelta(comp.gross_3y_cagr, cat?.median_3y ?? null),
      net_1y,
      net_3y_cagr,
      net_5y_cagr,
      applied_tax_kind: tax.kind,
      applied_tax_rate: tax.effective_rate,
      tax_confidence: tax.confidence,
      tax_source: tax.source,
      computed_at: new Date().toISOString(),
      computed_from_period: comp.computed_from_period,
      warnings: comp.warnings,
    };
  });

  if (payload.length === 0) {
    return { ok: true, processed: funds.length, upserted: 0, skipped, duration_ms: Date.now() - start };
  }

  const { error: upsertErr, count } = await supabase
    .from("fund_returns_cache")
    .upsert(payload as never, { onConflict: "fund_code,as_of", count: "exact" });
  if (upsertErr) {
    return {
      ok: false,
      processed: funds.length,
      upserted: 0,
      skipped,
      duration_ms: Date.now() - start,
      error: upsertErr.message,
    };
  }

  return {
    ok: true,
    processed: funds.length,
    upserted: count ?? payload.length,
    skipped,
    duration_ms: Date.now() - start,
  };
}

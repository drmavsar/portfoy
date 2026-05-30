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

function shiftYears(iso: string, years: number): string {
  const d = new Date(`${iso}T00:00:00Z`);
  d.setUTCFullYear(d.getUTCFullYear() - years);
  return d.toISOString().slice(0, 10);
}

type FundLite = Pick<Fund, "code" | "category_id" | "tax_confidence">;

interface PerFundResult {
  fund: FundLite;
  comp: FundReturnsComputation;
  tax: {
    kind: string;
    rate: number | null;
    confidence: string;
    source: string;
  };
  net_1y: number | null;
  net_3y_cagr: number | null;
  net_5y_cagr: number | null;
}

/**
 * Tüm aktif fonlar için fund_returns_cache'i hesapla + UPSERT.
 *
 * Akış:
 *  1. funds + fund_tax_rules + fund_categories.default_tax_kind çek
 *  2. fund_prices'tan son 6 yıl NAV serileri
 *  3. cpi_monthly'den varsayılan seri
 *  4. Her fon için: computeFundReturns + resolveTaxRulePure + applyTax* →
 *     PerFundResult
 *  5. Kategori medyanları: brüt (1y/3y) + net (1y/3y)
 *  6. Payload + batch UPSERT (onConflict: fund_code, as_of)
 *
 * Service role gerekir (RLS bypass + write).
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
    return {
      ok: false,
      processed: 0,
      upserted: 0,
      skipped: [],
      duration_ms: 0,
      error: "Supabase yapılandırılmamış.",
    };
  }
  const supabase = await createServiceClient();

  // 1) Aktif fonlar + vergi metadata
  const { data: fundsData, error: fundsErr } = await supabase
    .from("funds")
    .select("code, category_id, tax_confidence")
    .eq("is_active", true);
  if (fundsErr) {
    return {
      ok: false,
      processed: 0,
      upserted: 0,
      skipped: [],
      duration_ms: Date.now() - start,
      error: fundsErr.message,
    };
  }
  const funds = (fundsData ?? []) as FundLite[];
  if (funds.length === 0) {
    return { ok: true, processed: 0, upserted: 0, skipped: [], duration_ms: Date.now() - start };
  }

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

  // 2) NAV serileri (son 6 yıl)
  const cutoff = new Date();
  cutoff.setFullYear(cutoff.getFullYear() - 6);
  const cutoffIso = cutoff.toISOString().slice(0, 10);
  // .range() ile PostgREST default 1000 satır limitini bypass et.
  // 155 fon × ~1250 satır = ~190k; geniş tampon ver (500k).
  const { data: pricesData, error: pricesErr } = await supabase
    .from("fund_prices")
    .select("fund_code, as_of, nav")
    .gte("as_of", cutoffIso)
    .order("fund_code", { ascending: true })
    .order("as_of", { ascending: true })
    .range(0, 499999);
  if (pricesErr) {
    return {
      ok: false,
      processed: 0,
      upserted: 0,
      skipped: [],
      duration_ms: Date.now() - start,
      error: pricesErr.message,
    };
  }
  const rawPrices = (pricesData ?? []) as Array<{ fund_code: string; as_of: string; nav: number }>;
  const seriesByFund = new Map<string, NavPoint[]>();
  for (const row of rawPrices) {
    const list = seriesByFund.get(row.fund_code) ?? [];
    list.push({ as_of: row.as_of, nav: Number(row.nav) });
    seriesByFund.set(row.fund_code, list);
  }

  // 3) CPI sözlüğü
  const { data: cpiData } = await supabase
    .from("cpi_monthly")
    .select("period_month, index_value")
    .eq("series_code", DEFAULT_CPI_SERIES);
  const cpi: CpiByPeriod = {};
  for (const c of (cpiData ?? []) as Array<{ period_month: string; index_value: number }>) {
    cpi[c.period_month] = Number(c.index_value);
  }

  // 4) Her fon için kompozit hesap (return + tax + net)
  const skipped: string[] = [];
  const results: PerFundResult[] = [];
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
    const defaultKind = defaultKindByCategory.get(fund.category_id) ?? "BELIRSIZ";
    const acquired1y = shiftYears(comp.as_of, 1);
    const tax = resolveTaxRulePure(fund, taxRules, defaultKind, acquired1y, comp.as_of);
    results.push({
      fund,
      comp,
      tax: {
        kind: tax.kind,
        rate: tax.effective_rate,
        confidence: tax.confidence,
        source: tax.source,
      },
      net_1y: applyWithholdingTax(comp.gross_1y, tax.effective_rate),
      net_3y_cagr: applyTaxToCagr(comp.gross_3y_cagr, tax.effective_rate, 3),
      net_5y_cagr: applyTaxToCagr(comp.gross_5y_cagr, tax.effective_rate, 5),
    });
  }

  // 5) Kategori medyanları (brüt + net)
  const byCategory = new Map<number, PerFundResult[]>();
  for (const r of results) {
    const list = byCategory.get(r.fund.category_id) ?? [];
    list.push(r);
    byCategory.set(r.fund.category_id, list);
  }
  const medianByCategory = new Map<
    number,
    {
      gross_1y: number | null;
      gross_3y: number | null;
      net_1y: number | null;
      net_3y: number | null;
    }
  >();
  for (const [catId, items] of byCategory) {
    medianByCategory.set(catId, {
      gross_1y: median(items.map((i) => i.comp.gross_1y)),
      gross_3y: median(items.map((i) => i.comp.gross_3y_cagr)),
      net_1y: median(items.map((i) => i.net_1y)),
      net_3y: median(items.map((i) => i.net_3y_cagr)),
    });
  }

  // 6) Payload + UPSERT
  const payload = results.map((r) => {
    const m = medianByCategory.get(r.fund.category_id);
    return {
      fund_code: r.fund.code,
      as_of: r.comp.as_of,
      gross_1d: r.comp.gross_1d,
      gross_1w: r.comp.gross_1w,
      gross_1m: r.comp.gross_1m,
      gross_3m: r.comp.gross_3m,
      gross_6m: r.comp.gross_6m,
      gross_ytd: r.comp.gross_ytd,
      gross_1y: r.comp.gross_1y,
      gross_3y_cagr: r.comp.gross_3y_cagr,
      gross_5y_cagr: r.comp.gross_5y_cagr,
      real_1y: r.comp.real_1y,
      real_3y_cagr: r.comp.real_3y_cagr,
      real_5y_cagr: r.comp.real_5y_cagr,
      vs_category_1y: vsCategoryDelta(r.comp.gross_1y, m?.gross_1y ?? null),
      vs_category_3y: vsCategoryDelta(r.comp.gross_3y_cagr, m?.gross_3y ?? null),
      vs_category_net_1y: vsCategoryDelta(r.net_1y, m?.net_1y ?? null),
      vs_category_net_3y: vsCategoryDelta(r.net_3y_cagr, m?.net_3y ?? null),
      net_1y: r.net_1y,
      net_3y_cagr: r.net_3y_cagr,
      net_5y_cagr: r.net_5y_cagr,
      applied_tax_kind: r.tax.kind,
      applied_tax_rate: r.tax.rate,
      tax_confidence: r.tax.confidence,
      tax_source: r.tax.source,
      computed_at: new Date().toISOString(),
      computed_from_period: r.comp.computed_from_period,
      warnings: r.comp.warnings,
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

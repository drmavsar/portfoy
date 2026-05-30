"use server";

import { isSupabaseConfigured } from "@/app/(app)/ayarlar/actions";
import { createClient } from "@/lib/supabase/server";
import type { CpiMonthly, CpiYoy } from "./types";

const DEFAULT_SERIES = "CPI_TR_GENERAL";

export async function listCpiMonthly(
  seriesCode: string = DEFAULT_SERIES,
): Promise<CpiMonthly[]> {
  if (!(await isSupabaseConfigured())) return [];
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("cpi_monthly")
    .select("*")
    .eq("series_code", seriesCode)
    .order("period_month", { ascending: true });
  if (error) {
    console.error("listCpiMonthly error", error);
    return [];
  }
  return (data ?? []) as CpiMonthly[];
}

/**
 * Belirli bir periyot için endeks değeri. "YYYY-MM" period için tam eşleşme.
 */
export async function getCpiAt(
  period: string,
  seriesCode: string = DEFAULT_SERIES,
): Promise<CpiMonthly | null> {
  if (!(await isSupabaseConfigured())) return null;
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("cpi_monthly")
    .select("*")
    .eq("series_code", seriesCode)
    .eq("period_month", period)
    .maybeSingle();
  if (error) {
    console.error("getCpiAt error", error);
    return null;
  }
  return (data ?? null) as CpiMonthly | null;
}

/**
 * Son N periyot için y/y değişim — UI özet kartlarında ve Sprint-3 PR-2'de
 * 1Y reel getiri hesabında kullanılır.
 */
export async function listCpiYoy(
  limit: number = 24,
  seriesCode: string = DEFAULT_SERIES,
): Promise<CpiYoy[]> {
  if (!(await isSupabaseConfigured())) return [];
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("v_cpi_monthly_yoy")
    .select("*")
    .eq("series_code", seriesCode)
    .order("period_month", { ascending: false })
    .limit(limit);
  if (error) {
    console.error("listCpiYoy error", error);
    return [];
  }
  return (data ?? []) as CpiYoy[];
}

/**
 * cpi_monthly tablosuna upsert (cron veya manuel ingest tarafından kullanılır).
 * Service role gerektirir; bu wrapper cron route'undan çağrılır.
 */
export async function getLatestCpi(
  seriesCode: string = DEFAULT_SERIES,
): Promise<CpiMonthly | null> {
  if (!(await isSupabaseConfigured())) return null;
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("cpi_monthly")
    .select("*")
    .eq("series_code", seriesCode)
    .order("period_month", { ascending: false })
    .limit(1)
    .maybeSingle();
  if (error) {
    console.error("getLatestCpi error", error);
    return null;
  }
  return (data ?? null) as CpiMonthly | null;
}

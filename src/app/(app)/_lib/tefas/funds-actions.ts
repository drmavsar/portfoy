"use server";

import { isSupabaseConfigured } from "@/app/(app)/ayarlar/actions";
import { createClient } from "@/lib/supabase/server";
import type { Fund, FundCategory, FundInvestmentUniverse } from "./types";

interface FundsFilter {
  categoryId?: number;
  currency?: "TRY" | "USD" | "EUR";
  isParticipation?: boolean;
  isEquityIntensive?: boolean;
  isFreeFund?: boolean;
  isFxDenominated?: boolean;
  investmentUniverse?: FundInvestmentUniverse;
  isActive?: boolean;
}

export async function listFunds(filter: FundsFilter = {}): Promise<Fund[]> {
  if (!(await isSupabaseConfigured())) return [];
  const supabase = await createClient();
  let q = supabase.from("funds").select("*").order("code", { ascending: true });

  if (filter.categoryId !== undefined) q = q.eq("category_id", filter.categoryId);
  if (filter.currency !== undefined) q = q.eq("currency", filter.currency);
  if (filter.isParticipation !== undefined) q = q.eq("is_participation", filter.isParticipation);
  if (filter.isEquityIntensive !== undefined) q = q.eq("is_equity_intensive", filter.isEquityIntensive);
  if (filter.isFreeFund !== undefined) q = q.eq("is_free_fund", filter.isFreeFund);
  if (filter.isFxDenominated !== undefined) q = q.eq("is_fx_denominated", filter.isFxDenominated);
  if (filter.investmentUniverse !== undefined) q = q.eq("investment_universe", filter.investmentUniverse);
  if (filter.isActive !== undefined) q = q.eq("is_active", filter.isActive);

  const { data, error } = await q;
  if (error) {
    console.error("listFunds error", error);
    return [];
  }
  return (data ?? []) as Fund[];
}

export async function getFund(code: string): Promise<Fund | null> {
  if (!(await isSupabaseConfigured())) return null;
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("funds")
    .select("*")
    .eq("code", code)
    .maybeSingle();
  if (error) {
    console.error("getFund error", error);
    return null;
  }
  return (data ?? null) as Fund | null;
}

export async function listFundCategories(): Promise<FundCategory[]> {
  if (!(await isSupabaseConfigured())) return [];
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("fund_categories")
    .select("*")
    .order("sort_order", { ascending: true });
  if (error) {
    console.error("listFundCategories error", error);
    return [];
  }
  return (data ?? []) as FundCategory[];
}

"use server";

import { revalidatePath } from "next/cache";

import { isSupabaseConfigured } from "@/app/(app)/ayarlar/actions";
import { createClient } from "@/lib/supabase/server";

export interface AssetRow {
  id: string;
  symbol: string;
  name: string;
  asset_class: string;
  currency: string;
  exchange: string | null;
  sector: string | null;
  external_url: string | null;
}

export interface PortfolioRow {
  id: string;
  name: string;
  slug: string;
  is_default: boolean;
}

export interface TradeRow {
  id: string;
  portfolio_id: string;
  custody_id: string | null;
  account_id: string | null;
  asset_id: string;
  beneficiary_id: string | null;
  side: "buy" | "sell";
  executed_at: string;
  quantity: number;
  price: number;
  currency: string;
  fees: number;
  notes: string | null;
}

export interface HoldingRow {
  portfolio_id: string;
  asset_id: string;
  quantity: number;
  wac_try: number;
  cost_basis_try: number;
}

export async function listAssets(): Promise<AssetRow[]> {
  if (!(await isSupabaseConfigured())) return [];
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("assets")
    .select("id, symbol, name, asset_class, currency, exchange, sector, external_url")
    .eq("is_active", true)
    .order("asset_class")
    .order("symbol");
  if (error) {
    console.error("listAssets error", error);
    return [];
  }
  return (data ?? []) as unknown as AssetRow[];
}

export async function listPortfolios(): Promise<PortfolioRow[]> {
  if (!(await isSupabaseConfigured())) return [];
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("portfolios")
    .select("id, name, slug, is_default")
    .is("archived_at", null)
    .order("is_default", { ascending: false })
    .order("name");
  if (error) {
    console.error("listPortfolios error", error);
    return [];
  }
  return (data ?? []) as unknown as PortfolioRow[];
}

export async function listTrades(): Promise<TradeRow[]> {
  if (!(await isSupabaseConfigured())) return [];
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("trades")
    .select(
      "id, portfolio_id, custody_id, account_id, asset_id, beneficiary_id, side, executed_at, quantity, price, currency, fees, notes",
    )
    .order("executed_at", { ascending: false })
    .limit(500);
  if (error) {
    console.error("listTrades error", error);
    return [];
  }
  return (data ?? []) as unknown as TradeRow[];
}

export async function listHoldings(): Promise<HoldingRow[]> {
  if (!(await isSupabaseConfigured())) return [];
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("v_holdings_wac")
    .select("portfolio_id, asset_id, quantity, wac_try, cost_basis_try");
  if (error) {
    console.error("listHoldings error", error);
    return [];
  }
  return (data ?? []) as unknown as HoldingRow[];
}

export async function createTrade(input: {
  portfolio_id: string;
  custody_id: string | null;
  asset_id: string;
  beneficiary_id: string | null;
  side: "buy" | "sell";
  executed_at: string;
  quantity: number;
  price: number;
  fees: number;
  notes: string | null;
}): Promise<{ ok: true; row: TradeRow } | { ok: false; error: string }> {
  if (!(await isSupabaseConfigured())) {
    return { ok: false, error: "Supabase yapılandırılmamış." };
  }
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return { ok: false, error: "Giriş yapmadın." };

  if (!input.portfolio_id) return { ok: false, error: "Portföy seç." };
  if (!input.asset_id) return { ok: false, error: "Sembol seç." };
  if (!(input.quantity > 0)) return { ok: false, error: "Adet pozitif olmalı." };
  if (!(input.price >= 0)) return { ok: false, error: "Fiyat negatif olamaz." };

  const { data, error } = await supabase
    .from("trades")
    .insert({
      user_id: user.id,
      portfolio_id: input.portfolio_id,
      custody_id: input.custody_id,
      asset_id: input.asset_id,
      beneficiary_id: input.beneficiary_id,
      side: input.side,
      executed_at: input.executed_at,
      quantity: input.quantity,
      price: input.price,
      currency: "TRY",
      fees: input.fees,
      notes: input.notes?.trim() || null,
    } as never)
    .select(
      "id, portfolio_id, custody_id, account_id, asset_id, beneficiary_id, side, executed_at, quantity, price, currency, fees, notes",
    )
    .single();

  if (error) return { ok: false, error: error.message };
  revalidatePath("/islemler");
  revalidatePath("/yatirimlar");
  revalidatePath("/ozet");
  return { ok: true, row: data as unknown as TradeRow };
}

export async function updateTrade(input: {
  id: string;
  portfolio_id: string;
  custody_id: string | null;
  asset_id: string;
  beneficiary_id: string | null;
  side: "buy" | "sell";
  executed_at: string;
  quantity: number;
  price: number;
  fees: number;
  notes: string | null;
}): Promise<{ ok: true; row: TradeRow } | { ok: false; error: string }> {
  if (!(await isSupabaseConfigured())) {
    return { ok: false, error: "Supabase yapılandırılmamış." };
  }
  const supabase = await createClient();
  if (!input.portfolio_id) return { ok: false, error: "Portföy seç." };
  if (!input.asset_id) return { ok: false, error: "Sembol seç." };
  if (!(input.quantity > 0)) return { ok: false, error: "Adet pozitif olmalı." };

  const { data, error } = await supabase
    .from("trades")
    .update({
      portfolio_id: input.portfolio_id,
      custody_id: input.custody_id,
      asset_id: input.asset_id,
      beneficiary_id: input.beneficiary_id,
      side: input.side,
      executed_at: input.executed_at,
      quantity: input.quantity,
      price: input.price,
      fees: input.fees,
      notes: input.notes?.trim() || null,
    } as never)
    .eq("id", input.id)
    .select(
      "id, portfolio_id, custody_id, account_id, asset_id, beneficiary_id, side, executed_at, quantity, price, currency, fees, notes",
    )
    .single();

  if (error) return { ok: false, error: error.message };
  revalidatePath("/islemler");
  revalidatePath("/yatirimlar");
  revalidatePath("/ozet");
  return { ok: true, row: data as unknown as TradeRow };
}

export async function deleteTrade(id: string): Promise<{ ok: boolean; error?: string }> {
  if (!(await isSupabaseConfigured())) {
    return { ok: false, error: "Supabase yapılandırılmamış." };
  }
  const supabase = await createClient();
  const { error } = await supabase.from("trades").delete().eq("id", id);
  if (error) return { ok: false, error: error.message };
  revalidatePath("/islemler");
  revalidatePath("/yatirimlar");
  revalidatePath("/ozet");
  return { ok: true };
}

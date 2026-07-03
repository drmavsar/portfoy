"use server";

import { revalidatePath } from "next/cache";

import { isSupabaseConfigured } from "@/app/(app)/ayarlar/actions";
import { createClient } from "@/lib/supabase/server";
import { processSellTrade } from "@/app/(app)/_lib/tefas/realized-lots-processor";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/lib/types/database";

type DbClient = SupabaseClient<Database>;

/**
 * Bir (user, portfolio, asset) scope'undaki tüm sell'lerin realized_lots
 * kayıtlarını sil ve chronological olarak yeniden hesaplat. Buy backdate,
 * buy edit/delete veya sell edit/delete sonrasında FIFO chain'in bütünlüğünü
 * korur. Idempotent. processSellTrade hatasını yutar (raporlar boş görünür
 * ama trade yazımı bloklanmaz).
 */
async function reprocessRealizedLotsForScope(
  supabase: DbClient,
  userId: string,
  portfolioId: string,
  assetId: string,
): Promise<void> {
  const { data: sells, error } = await supabase
    .from("trades")
    .select("id")
    .eq("user_id", userId)
    .eq("portfolio_id", portfolioId)
    .eq("asset_id", assetId)
    .eq("side", "sell")
    .order("executed_at", { ascending: true });
  if (error) {
    console.error("reprocessRealizedLotsForScope list error", error);
    return;
  }
  const sellIds = (sells ?? []).map((s: { id: string }) => s.id);
  if (sellIds.length === 0) return;

  const { error: delErr } = await supabase
    .from("realized_lots")
    .delete()
    .in("sell_trade_id", sellIds);
  if (delErr) {
    console.error("reprocessRealizedLotsForScope delete error", delErr);
    return;
  }

  for (const sellId of sellIds) {
    const r = await processSellTrade(supabase, sellId);
    if (!r.ok) {
      console.error("processSellTrade error", sellId, r.error);
    }
  }
}

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

export interface HoldingCustodyRow {
  portfolio_id: string;
  asset_id: string;
  custody_id: string | null;
  quantity: number;
}

/**
 * Trades'i (portfolio, asset, custody) bazında net'leyip pozitif kalanları
 * döner. v_holdings_wac custody-agnostik olduğu için (WAC portfolio+asset
 * seviyesinde tutuluyor) — kurum kırılımı burada trades'ten türetilir.
 * Tüm trade'ler taranır (listTrades'in 500 limiti burada uygulanmaz);
 * postgrest default 1000 satır cap'ini aşmak için sayfalama yapılır.
 */
export async function listHoldingsByCustody(): Promise<HoldingCustodyRow[]> {
  if (!(await isSupabaseConfigured())) return [];
  const supabase = await createClient();

  const pageSize = 1000;
  const rows: Array<{
    portfolio_id: string;
    asset_id: string;
    custody_id: string | null;
    side: "buy" | "sell";
    quantity: number | string;
  }> = [];
  for (let from = 0; ; from += pageSize) {
    const { data, error } = await supabase
      .from("trades")
      .select("portfolio_id, asset_id, custody_id, side, quantity")
      .range(from, from + pageSize - 1);
    if (error) {
      console.error("listHoldingsByCustody error", error);
      return [];
    }
    const batch = (data ?? []) as typeof rows;
    rows.push(...batch);
    if (batch.length < pageSize) break;
  }

  const acc = new Map<string, HoldingCustodyRow>();
  for (const r of rows) {
    const key = `${r.portfolio_id}|${r.asset_id}|${r.custody_id ?? ""}`;
    const q = Number(r.quantity) * (r.side === "buy" ? 1 : -1);
    const cur = acc.get(key);
    if (cur) {
      cur.quantity += q;
    } else {
      acc.set(key, {
        portfolio_id: r.portfolio_id,
        asset_id: r.asset_id,
        custody_id: r.custody_id ?? null,
        quantity: q,
      });
    }
  }
  return Array.from(acc.values()).filter((r) => r.quantity > 1e-9);
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

  await reprocessRealizedLotsForScope(supabase, user.id, input.portfolio_id, input.asset_id);

  revalidatePath("/islemler");
  revalidatePath("/yatirimlar");
  revalidatePath("/ozet");
  revalidatePath("/raporlar");
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

  const { data: prev } = await supabase
    .from("trades")
    .select("user_id, portfolio_id, asset_id")
    .eq("id", input.id)
    .maybeSingle();

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

  const prevRow = prev as { user_id: string; portfolio_id: string; asset_id: string } | null;
  if (prevRow) {
    await reprocessRealizedLotsForScope(supabase, prevRow.user_id, prevRow.portfolio_id, prevRow.asset_id);
    const movedScope =
      prevRow.portfolio_id !== input.portfolio_id || prevRow.asset_id !== input.asset_id;
    if (movedScope) {
      await reprocessRealizedLotsForScope(supabase, prevRow.user_id, input.portfolio_id, input.asset_id);
    }
  }

  revalidatePath("/islemler");
  revalidatePath("/yatirimlar");
  revalidatePath("/ozet");
  revalidatePath("/raporlar");
  return { ok: true, row: data as unknown as TradeRow };
}

export async function deleteTrade(id: string): Promise<{ ok: boolean; error?: string }> {
  if (!(await isSupabaseConfigured())) {
    return { ok: false, error: "Supabase yapılandırılmamış." };
  }
  const supabase = await createClient();

  const { data: scope } = await supabase
    .from("trades")
    .select("user_id, portfolio_id, asset_id")
    .eq("id", id)
    .maybeSingle();

  const { error } = await supabase.from("trades").delete().eq("id", id);
  if (error) return { ok: false, error: error.message };

  const row = scope as { user_id: string; portfolio_id: string; asset_id: string } | null;
  if (row) {
    await reprocessRealizedLotsForScope(supabase, row.user_id, row.portfolio_id, row.asset_id);
  }

  revalidatePath("/islemler");
  revalidatePath("/yatirimlar");
  revalidatePath("/ozet");
  revalidatePath("/raporlar");
  return { ok: true };
}

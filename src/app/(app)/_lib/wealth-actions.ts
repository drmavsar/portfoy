"use server";

import { readAll } from "@/lib/supabase/read-all";

import { revalidatePath } from "next/cache";

import { isSupabaseConfigured } from "@/app/(app)/ayarlar/actions";
import { createClient } from "@/lib/supabase/server";
import { reprocessRealizedLotsForScope } from "@/app/(app)/_lib/tefas/realized-lots-processor";

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
  /** Döviz cinsinden işlemde işlem anı kuru (TRY ise 1/null) */
  fx_rate_to_try?: number | null;
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
  return readAll<TradeRow>((from, to) => supabase.from("trades")
    .select("id, portfolio_id, custody_id, account_id, asset_id, beneficiary_id, side, executed_at, quantity, price, currency, fx_rate_to_try, fees, notes", { count: "exact" })
    .order("executed_at", { ascending: false }).order("id", { ascending: true }).range(from, to), r => r.id);
}

export interface RealizedBySell {
  /** FIFO gerçekleşen K/Z (TRY, komisyonlar dahil, stopaj öncesi) */
  pnl_try: number;
  /** Satılan lotların FIFO maliyeti (TRY) */
  cost_try: number;
}

/**
 * realized_lots'u satış işlemine göre topla. İşlemler'deki sembol özeti
 * gerçekleşen K/Z'yi buradan alır — Raporlar ile aynı FIFO kaynağı. Eskiden
 * yalnız seçili dönemdeki alımların ortalamasıyla hesaplanıyordu (dönem
 * öncesi alımlar yok sayılıyordu; ör. 2025'te 200'den alınıp 2026'da satılan
 * hisse YTD filtresinde yanlış maliyetle görünüyordu).
 */
export async function listRealizedBySellTrade(): Promise<Record<string, RealizedBySell>> {
  if (!(await isSupabaseConfigured())) return {};
  const supabase = await createClient();
  type Row = { id: string; sell_trade_id: string; realized_pnl_try: number; cost_basis_try: number };
  const rows = await readAll<Row>((from, to) => supabase.from("realized_lots")
    .select("id, sell_trade_id, realized_pnl_try, cost_basis_try", { count: "exact" })
    .order("id", { ascending: true }).range(from, to), r => r.id);
  const out: Record<string, RealizedBySell> = {};
  for (const r of rows) {
    const acc = (out[r.sell_trade_id] ??= { pnl_try: 0, cost_try: 0 });
    acc.pnl_try += Number(r.realized_pnl_try);
    acc.cost_try += Number(r.cost_basis_try);
  }
  return out;
}

export async function listHoldings(): Promise<HoldingRow[]> {
  if (!(await isSupabaseConfigured())) return [];
  const supabase = await createClient();
  return readAll<HoldingRow>((from, to) => supabase.from("v_holdings_wac")
    .select("portfolio_id, asset_id, quantity, wac_try, cost_basis_try", { count: "exact" })
    .order("portfolio_id", { ascending: true }).order("asset_id", { ascending: true }).range(from, to), r => JSON.stringify([r.portfolio_id, r.asset_id]));
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
 * Tüm trade'ler listTrades üzerinden sayfalı okunur;
 * postgrest default 1000 satır cap'ini aşmak için sayfalama yapılır.
 */
export async function listHoldingsByCustody(): Promise<HoldingCustodyRow[]> {
  const rows = await listTrades();

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

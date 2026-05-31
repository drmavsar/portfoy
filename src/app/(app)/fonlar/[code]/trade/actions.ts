"use server";

import { revalidatePath } from "next/cache";

import { isSupabaseConfigured } from "@/app/(app)/ayarlar/actions";
import { createClient } from "@/lib/supabase/server";
import { findAssetIdByFundCode } from "@/app/(app)/_lib/tefas/asset-bridge";
import {
  validateFundTrade,
  type FundTradeInput,
} from "@/app/(app)/_lib/tefas/trade-validation";
import { processSellTrade } from "@/app/(app)/_lib/tefas/realized-lots-processor";

export interface FundTradeAccountOption {
  id: string;
  name: string;
  custody_id: string | null;
  portfolio_id: string | null;
  currency: string;
}

export interface FundTradePortfolioOption {
  id: string;
  name: string;
  is_default: boolean;
}

export interface FundTradeContextPayload {
  fund: {
    code: string;
    name: string | null;
    is_active: boolean;
    category_id: number | null;
  };
  assetId: string | null;
  accounts: FundTradeAccountOption[];
  portfolios: FundTradePortfolioOption[];
  latestNav: { as_of: string; nav: number } | null;
  recentNavRows: Array<{ as_of: string; nav: number }>;
  currentHoldings: Array<{ portfolio_id: string; quantity: number }>;
}

/** Trade form için gereken tüm okuma işlemlerini tek server call'da toplar. */
export async function getFundTradeContext(
  code: string,
): Promise<FundTradeContextPayload | null> {
  if (!(await isSupabaseConfigured())) return null;
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return null;

  const upperCode = code.trim().toUpperCase();

  const { data: fundData } = await supabase
    .from("funds")
    .select("code, name, is_active, category_id")
    .eq("code", upperCode)
    .maybeSingle();
  if (!fundData) return null;
  const fund = fundData as {
    code: string;
    name: string | null;
    is_active: boolean;
    category_id: number | null;
  };

  const assetId = await findAssetIdByFundCode(upperCode);

  const [accountsRes, portfoliosRes, navRes, holdingsRes] = await Promise.all([
    supabase
      .from("accounts")
      .select("id, name, custody_id, portfolio_id, currency")
      .is("archived_at", null)
      .eq("currency", "TRY")
      .order("created_at", { ascending: true }),
    supabase
      .from("portfolios")
      .select("id, name, is_default")
      .is("archived_at", null)
      .order("is_default", { ascending: false })
      .order("name"),
    supabase
      .from("fund_prices")
      .select("as_of, nav")
      .eq("fund_code", upperCode)
      .order("as_of", { ascending: false })
      .limit(60),
    assetId
      ? supabase
          .from("v_holdings_wac")
          .select("portfolio_id, quantity")
          .eq("asset_id", assetId)
      : Promise.resolve({ data: [], error: null }),
  ]);

  const navRows = (navRes.data ?? []) as Array<{ as_of: string; nav: number }>;
  const latestNav = navRows.length > 0 ? navRows[0] : null;

  return {
    fund,
    assetId,
    accounts: (accountsRes.data ?? []) as FundTradeAccountOption[],
    portfolios: (portfoliosRes.data ?? []) as FundTradePortfolioOption[],
    latestNav,
    recentNavRows: navRows,
    currentHoldings: (holdingsRes.data ?? []) as Array<{
      portfolio_id: string;
      quantity: number;
    }>,
  };
}

export interface CreateFundTradeInput {
  fund_code: string;
  account_id: string;
  portfolio_id: string;
  side: "buy" | "sell";
  executed_at: string;
  quantity: number;
  price: number;
  fees: number;
  taxes: number;
  notes: string | null;
}

export type CreateFundTradeResult =
  | { ok: true; trade_id: string; warning?: string }
  | { ok: false; error: string };

export async function createFundTrade(
  input: CreateFundTradeInput,
): Promise<CreateFundTradeResult> {
  if (!(await isSupabaseConfigured())) {
    return { ok: false, error: "Supabase yapılandırılmamış." };
  }
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { ok: false, error: "Giriş yapmadın." };

  const code = input.fund_code.trim().toUpperCase();
  if (!code) return { ok: false, error: "Fon kodu boş." };
  if (!input.account_id) return { ok: false, error: "Hesap seç." };
  if (!input.portfolio_id) return { ok: false, error: "Portföy bulunamadı." };

  const { data: fundData } = await supabase
    .from("funds")
    .select("is_active")
    .eq("code", code)
    .maybeSingle();
  if (!fundData) return { ok: false, error: "Fon bulunamadı." };
  const fundIsActive = (fundData as { is_active: boolean }).is_active;

  const assetId = await findAssetIdByFundCode(code);
  if (!assetId) return { ok: false, error: "Fon ↔ asset köprüsü bulunamadı." };

  const { data: accountRow } = await supabase
    .from("accounts")
    .select("id, custody_id, portfolio_id, currency")
    .eq("id", input.account_id)
    .is("archived_at", null)
    .maybeSingle();
  if (!accountRow) return { ok: false, error: "Hesap bulunamadı." };
  const account = accountRow as {
    id: string;
    custody_id: string | null;
    portfolio_id: string | null;
    currency: string;
  };

  let currentHoldingQuantity = 0;
  if (input.side === "sell") {
    const { data: holdingRow } = await supabase
      .from("v_holdings_wac")
      .select("quantity")
      .eq("asset_id", assetId)
      .eq("portfolio_id", input.portfolio_id)
      .maybeSingle();
    if (holdingRow) {
      const q = (holdingRow as { quantity: number }).quantity;
      if (Number.isFinite(q)) currentHoldingQuantity = q;
    }
  }

  const validationInput: FundTradeInput = {
    side: input.side,
    quantity: input.quantity,
    price: input.price,
    fees: input.fees,
    taxes: input.taxes,
    executed_at: input.executed_at,
  };
  const validation = validateFundTrade(validationInput, {
    now: new Date(),
    fundIsActive,
    currentHoldingQuantity,
  });
  if (!validation.ok) return { ok: false, error: validation.error };

  const { data, error } = await supabase
    .from("trades")
    .insert({
      user_id: user.id,
      portfolio_id: input.portfolio_id,
      custody_id: account.custody_id,
      account_id: account.id,
      asset_id: assetId,
      side: input.side,
      executed_at: input.executed_at,
      quantity: input.quantity,
      price: input.price,
      currency: "TRY",
      fx_rate_to_try: 1,
      fees: input.fees,
      taxes: input.taxes,
      notes: input.notes?.trim() || null,
    } as never)
    .select("id")
    .single();

  if (error) return { ok: false, error: error.message };

  const tradeId = (data as { id: string }).id;

  // Sell ise FIFO processor'ı çağır + realized_lots yaz. Hata trade'i geri
  // almaz; idempotent processor backfill route ile tekrar denenebilir.
  let realizedWarning: string | null = null;
  if (input.side === "sell") {
    const procResult = await processSellTrade(supabase, tradeId);
    if (!procResult.ok) {
      realizedWarning = `Trade kaydedildi ancak realized_lots yazılamadı: ${procResult.error ?? "bilinmeyen hata"}`;
    }
  }

  revalidatePath("/islemler");
  revalidatePath("/yatirimlar");
  revalidatePath("/ozet");
  revalidatePath("/fonlar");
  revalidatePath(`/fonlar/${code}`);

  if (realizedWarning) {
    return { ok: true, trade_id: tradeId, warning: realizedWarning };
  }
  return { ok: true, trade_id: tradeId };
}

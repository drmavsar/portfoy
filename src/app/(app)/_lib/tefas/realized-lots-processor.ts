// Sprint-6 PR-D — Sell trade → realized_lots writer (server-side).
//
// Saf FIFO mantığını DB ile birleştirir:
//   1. Sell trade satırını çek.
//   2. Idempotency: realized_lots'ta zaten lot varsa skip.
//   3. Açık buy lot'ları (FIFO sırayla) + her buy için önceki tüketim.
//   4. Fund + tax rules + category default fetch (1 kez) → resolveTax closure.
//   5. processFifoSell çağrısı → ConsumedLot[].
//   6. Bulk INSERT realized_lots.
//
// Trigger değil; testable TS function (user kararı, Sprint-6 design §5).
// createFundTrade içinden sell INSERT sonrası çağrılır.

import type { SupabaseClient } from "@supabase/supabase-js";

import type { Database } from "@/lib/types/database";

import {
  processFifoSell,
  type ConsumedLot,
  type RawBuyLot,
  type RawSellInput,
  type TaxResolverFn,
} from "./fifo-processor";
import { resolveTaxRulePure, toISODate } from "./tax-rules-logic";
import type { Fund, FundTaxKind, FundTaxRule } from "./types";

export const PROCESSOR_VERSION = "2026-05-31-sprint-6-pr-d";

type DbClient = SupabaseClient<Database>;

export interface ProcessSellTradeResult {
  ok: boolean;
  skipped?: boolean;
  reason?: string;
  trade_id: string;
  lots_written?: number;
  total_withholding_try?: number;
  total_realized_pnl_try?: number;
  error?: string;
}

export async function processSellTrade(
  supabase: DbClient,
  sellTradeId: string,
): Promise<ProcessSellTradeResult> {
  // 1. Sell trade
  const { data: sellRaw, error: sellErr } = await supabase
    .from("trades")
    .select(
      "id, user_id, portfolio_id, asset_id, side, executed_at, quantity, price, currency, fx_rate_to_try, fees, taxes",
    )
    .eq("id", sellTradeId)
    .maybeSingle();
  if (sellErr) return { ok: false, trade_id: sellTradeId, error: sellErr.message };
  if (!sellRaw) {
    return { ok: false, trade_id: sellTradeId, error: "Sell trade bulunamadı." };
  }
  const sellRow = sellRaw as unknown as {
    id: string;
    user_id: string;
    portfolio_id: string;
    asset_id: string;
    side: "buy" | "sell";
    executed_at: string;
    quantity: number;
    price: number;
    currency: string;
    fx_rate_to_try: number | null;
    fees: number;
    taxes: number;
  };
  if (sellRow.side !== "sell") {
    return { ok: true, skipped: true, reason: "side != sell", trade_id: sellTradeId };
  }

  // 2. Idempotency: lot zaten varsa skip
  const { data: existing } = await supabase
    .from("realized_lots")
    .select("id")
    .eq("sell_trade_id", sellTradeId)
    .limit(1);
  if (existing && existing.length > 0) {
    return {
      ok: true,
      skipped: true,
      reason: "already processed",
      trade_id: sellTradeId,
    };
  }

  // 3. Fund (asset_id → symbol → fund) + category default tax kind
  const { data: assetRow } = await supabase
    .from("assets")
    .select("symbol, asset_class")
    .eq("id", sellRow.asset_id)
    .maybeSingle();
  const fundCode =
    assetRow && (assetRow as { asset_class: string }).asset_class === "fund"
      ? (assetRow as { symbol: string }).symbol
      : null;

  let fund: Pick<Fund, "code" | "category_id" | "tax_confidence"> | null = null;
  let categoryDefaultKind: FundTaxKind = "BELIRSIZ";
  let taxRules: FundTaxRule[] = [];

  if (fundCode) {
    const { data: fundRow } = await supabase
      .from("funds")
      .select("code, category_id, tax_confidence")
      .eq("code", fundCode)
      .maybeSingle();
    if (fundRow) {
      fund = fundRow as unknown as Pick<Fund, "code" | "category_id" | "tax_confidence">;
      const { data: catRow } = await supabase
        .from("fund_categories")
        .select("default_tax_kind")
        .eq("id", fund.category_id)
        .maybeSingle();
      if (catRow) {
        const kind = (catRow as { default_tax_kind?: FundTaxKind | null }).default_tax_kind;
        if (kind) categoryDefaultKind = kind;
      }
      const { data: rulesRaw } = await supabase
        .from("fund_tax_rules")
        .select("*")
        .eq("is_active", true);
      taxRules = (rulesRaw ?? []) as FundTaxRule[];
    }
  }

  // 4. Açık buy lot'lar (executed_at <= sell.executed_at)
  const { data: buyRaw, error: buyErr } = await supabase
    .from("trades")
    .select(
      "id, executed_at, quantity, price, currency, fx_rate_to_try, fees",
    )
    .eq("user_id", sellRow.user_id)
    .eq("portfolio_id", sellRow.portfolio_id)
    .eq("asset_id", sellRow.asset_id)
    .eq("side", "buy")
    .lte("executed_at", sellRow.executed_at)
    .order("executed_at", { ascending: true });
  if (buyErr) return { ok: false, trade_id: sellTradeId, error: buyErr.message };
  const buyRows = (buyRaw ?? []) as Array<{
    id: string;
    executed_at: string;
    quantity: number;
    price: number;
    currency: string;
    fx_rate_to_try: number | null;
    fees: number;
  }>;

  // 5. Her buy için önceki tüketim (önceki sell'lerce yazılan realized_lots)
  const buyIds = buyRows.map((b) => b.id);
  const priorByBuy = new Map<string, number>();
  if (buyIds.length > 0) {
    const { data: priorRaw } = await supabase
      .from("realized_lots")
      .select("buy_trade_id, quantity")
      .in("buy_trade_id", buyIds);
    const priorRows = (priorRaw ?? []) as Array<{
      buy_trade_id: string | null;
      quantity: number;
    }>;
    for (const p of priorRows) {
      if (!p.buy_trade_id) continue;
      const cur = priorByBuy.get(p.buy_trade_id) ?? 0;
      priorByBuy.set(p.buy_trade_id, cur + Number(p.quantity));
    }
  }

  const buys: RawBuyLot[] = buyRows.map((b) => ({
    trade_id: b.id,
    executed_at: b.executed_at,
    quantity: Number(b.quantity),
    price: Number(b.price),
    fees: Number(b.fees) || 0,
    currency: b.currency,
    fx_rate_to_try: b.fx_rate_to_try == null ? null : Number(b.fx_rate_to_try),
    prior_consumed_qty: priorByBuy.get(b.id) ?? 0,
  }));

  const sellInput: RawSellInput = {
    trade_id: sellRow.id,
    executed_at: sellRow.executed_at,
    quantity: Number(sellRow.quantity),
    price: Number(sellRow.price),
    fees: Number(sellRow.fees) || 0,
    taxes: Number(sellRow.taxes) || 0,
    currency: sellRow.currency,
    fx_rate_to_try: sellRow.fx_rate_to_try == null ? null : Number(sellRow.fx_rate_to_try),
  };

  // 6. resolveTax closure — fund yoksa BELIRSIZ döner
  const resolveTax: TaxResolverFn = (acquired, sold) => {
    if (!fund) {
      return {
        kind: "BELIRSIZ",
        rate: null,
        confidence: "NONE",
        source: "NONE",
        rule_id: null,
      };
    }
    const resolved = resolveTaxRulePure(
      fund,
      taxRules,
      categoryDefaultKind,
      toISODate(acquired),
      toISODate(sold),
    );
    return {
      kind: resolved.kind,
      rate: resolved.effective_rate,
      confidence: resolved.confidence,
      source: resolved.source,
      rule_id: resolved.rule?.id ?? null,
    };
  };

  // 7. Pure FIFO + tax compute
  const result = processFifoSell(sellInput, buys, resolveTax);
  if (!result.ok) {
    return { ok: false, trade_id: sellTradeId, error: result.error };
  }

  // 8. Bulk INSERT realized_lots
  if (result.lots.length === 0) {
    return { ok: true, skipped: true, reason: "no lots produced", trade_id: sellTradeId };
  }

  const inserts = result.lots.map((l: ConsumedLot) => ({
    user_id: sellRow.user_id,
    portfolio_id: sellRow.portfolio_id,
    asset_id: sellRow.asset_id,
    sell_trade_id: sellRow.id,
    buy_trade_id: l.buy_trade_id,
    closed_at: l.closed_at,
    quantity: l.quantity,
    cost_basis_try: l.cost_basis_try,
    proceeds_try: l.proceeds_try,
    method: result.method,
    holding_period_days: l.holding_period_days,
    applied_tax_rule_id: l.applied_tax_rule_id,
    applied_tax_kind: l.applied_tax_kind,
    applied_tax_rate: l.applied_tax_rate,
    tax_confidence: l.tax_confidence,
    tax_source: l.tax_source,
    tax_basis_try: l.tax_basis_try,
    withholding_try: l.withholding_try,
    fees_allocated_try: l.fees_allocated_try,
    manual_tax_override: l.manual_tax_override,
    processor_version: PROCESSOR_VERSION,
  }));

  const { error: insertErr } = await supabase
    .from("realized_lots")
    .insert(inserts as never);
  if (insertErr) {
    return { ok: false, trade_id: sellTradeId, error: insertErr.message };
  }

  return {
    ok: true,
    trade_id: sellTradeId,
    lots_written: inserts.length,
    total_withholding_try: result.total_withholding_try,
    total_realized_pnl_try: result.total_realized_pnl_try,
  };
}

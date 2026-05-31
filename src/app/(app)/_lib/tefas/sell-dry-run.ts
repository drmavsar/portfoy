// Sprint-6 PR-E — Sell dry-run (FIFO + stopaj tahmini, DB yazmaz).
//
// Allocation engine'in AZALTMA önerileri için kullanılır: belirli bir fund
// kodunda X adet satılırsa estimated cost basis / proceeds / pnl / stopaj
// ne olur? processFifoSell saf fonksiyonunu reuse eder; realized_lots'a
// yazma yapmaz.
//
// Not: PR-D realized-lots-processor.ts production yazıcısıdır; bu modül
// yalnızca tahmin amaçlıdır.

import {
  processFifoSell,
  type RawBuyLot,
  type RawSellInput,
  type TaxResolverFn,
} from "./fifo-processor";
import type { SellDryRunResult } from "./allocation-types";

export interface SimulateSellInput {
  fund_code: string;
  sell_quantity: number;
  /** Tahmini sell unit fiyatı (TRY) — genelde son NAV. */
  estimated_unit_price_try: number;
  /** Tahmini sell tarihi — genelde bugün. */
  estimated_executed_at: string; // ISO timestamp
  /** Açık buy lot'lar (prior_consumed_qty önceki realized_lots'lardan düşülmüş). */
  buys: RawBuyLot[];
  /** Stopaj resolver — lot bazlı çağrılır (acquired, sold tarihleri). */
  resolveTax: TaxResolverFn;
}

export type SimulateSellResult =
  | { ok: true; dry_run: SellDryRunResult }
  | { ok: false; error: string; fund_code: string };

/**
 * Pure sell simulator. Side effect yok.
 *
 * Akış:
 *  1. RawSellInput hazırla (fees=0, taxes=0 — tahmin amacı).
 *  2. processFifoSell çağır.
 *  3. Sonucu SellDryRunResult'a aggregate et.
 *  4. Tax snapshot olarak ilk lot'un kuralı (tek fund → tüm lot'lar aynı
 *     fund_code, farklı buy_date olsa da tax kind sapması nadir; UI'da
 *     "ilk lot'tan örnek" notu yeterli).
 */
export function simulateSell(input: SimulateSellInput): SimulateSellResult {
  if (!(input.sell_quantity > 0)) {
    return { ok: false, error: "Satış adedi pozitif olmalı.", fund_code: input.fund_code };
  }
  if (!(input.estimated_unit_price_try > 0)) {
    return {
      ok: false,
      error: "Tahmini birim fiyat pozitif olmalı.",
      fund_code: input.fund_code,
    };
  }
  if (input.buys.length === 0) {
    return {
      ok: false,
      error: "Açık buy lot yok; satış simüle edilemez.",
      fund_code: input.fund_code,
    };
  }

  const sell: RawSellInput = {
    trade_id: `dry-run:${input.fund_code}`,
    executed_at: input.estimated_executed_at,
    quantity: input.sell_quantity,
    price: input.estimated_unit_price_try,
    fees: 0,
    taxes: 0,
    currency: "TRY",
    fx_rate_to_try: 1,
  };

  const result = processFifoSell(sell, input.buys, input.resolveTax);
  if (!result.ok) {
    return { ok: false, error: result.error, fund_code: input.fund_code };
  }

  const firstLot = result.lots[0];
  const dry: SellDryRunResult = {
    fund_code: input.fund_code,
    sell_quantity: round8(result.total_consumed_qty),
    estimated_cost_basis_try: round2(result.total_cost_basis_try),
    estimated_proceeds_try: round2(result.total_proceeds_try),
    estimated_realized_pnl_try: round2(result.total_realized_pnl_try),
    estimated_withholding_try: round2(result.total_withholding_try),
    estimated_net_proceeds_try: round2(
      result.total_proceeds_try - result.total_withholding_try,
    ),
    applied_tax_kind: firstLot.applied_tax_kind,
    applied_tax_rate: firstLot.applied_tax_rate,
    tax_confidence: firstLot.tax_confidence,
    lots_consumed: result.lots.length,
  };
  return { ok: true, dry_run: dry };
}

function round2(n: number): number {
  return Math.round(n * 100) / 100;
}

function round8(n: number): number {
  return Math.round(n * 1e8) / 1e8;
}

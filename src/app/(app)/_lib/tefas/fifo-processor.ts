// Sprint-6 PR-D — Saf FIFO sell processor + stopaj hesaplama.
//
// DB bağımlılığı YOK. Server-side processor bu modülü çağırır:
//   1. Sell trade için açık buy lot'ları FIFO sırayla tüketir.
//   2. Buy fees consumed_qty oranında cost basis'e dahil edilir.
//   3. Sell fees consumed_qty oranında lot'lara dağıtılır (audit).
//   4. Her lot için resolveTax callback (acquired, sold) çağrılır →
//      pure logic, tarihler farklı → lot bazlı farklı kural mümkün.
//   5. Stopaj: zarar varsa 0, kâr varsa tax_basis * rate.
//   6. Manuel taxes override (sell.taxes > 0) → sistem hesaplaması
//      bypass, total = sell.taxes lot'lara qty-oranında dağıtılır,
//      audit flag set.

import type { FundTaxConfidence, FundTaxKind } from "./types";

const QTY_EPSILON = 1e-8;

export interface RawBuyLot {
  trade_id: string;
  executed_at: string; // ISO timestamp
  quantity: number;
  price: number;
  fees: number;
  currency: string;
  fx_rate_to_try: number | null;
  /** Bu buy lot'tan daha önceki sell'lerce tüketilmiş miktar. */
  prior_consumed_qty: number;
}

export interface RawSellInput {
  trade_id: string;
  executed_at: string; // ISO timestamp
  quantity: number;
  price: number;
  fees: number;
  taxes: number; // > 0 ise manuel override
  currency: string;
  fx_rate_to_try: number | null;
}

export interface ResolvedTaxSnapshot {
  kind: FundTaxKind;
  rate: number | null;
  confidence: FundTaxConfidence;
  source: "FUND" | "CATEGORY" | "TAX_KIND_DEFAULT" | "NONE";
  rule_id: string | null;
}

/** Lot bazlı tax resolver — buy/sell tarihlerine göre farklı sonuç verebilir. */
export type TaxResolverFn = (acquiredAt: string, soldAt: string) => ResolvedTaxSnapshot;

export interface ConsumedLot {
  buy_trade_id: string;
  quantity: number;
  cost_basis_try: number;
  proceeds_try: number;
  realized_pnl_try: number;
  holding_period_days: number;
  fees_allocated_try: number;
  applied_tax_kind: FundTaxKind;
  applied_tax_rate: number | null;
  applied_tax_rule_id: string | null;
  tax_confidence: FundTaxConfidence;
  tax_source: "FUND" | "CATEGORY" | "TAX_KIND_DEFAULT" | "NONE";
  tax_basis_try: number;
  withholding_try: number;
  manual_tax_override: boolean;
  closed_at: string;
}

export type FifoResult =
  | {
      ok: true;
      method: "FIFO";
      lots: ConsumedLot[];
      total_consumed_qty: number;
      total_cost_basis_try: number;
      total_proceeds_try: number;
      total_realized_pnl_try: number;
      total_withholding_try: number;
      total_fees_allocated_try: number;
    }
  | { ok: false; error: string };

export function processFifoSell(
  sell: RawSellInput,
  buys: RawBuyLot[],
  resolveTax: TaxResolverFn,
): FifoResult {
  if (!(sell.quantity > 0)) {
    return { ok: false, error: "Sell adedi pozitif olmalı." };
  }
  if (!(sell.price > 0)) {
    return { ok: false, error: "Sell fiyatı pozitif olmalı." };
  }

  // FIFO: en eski buy önce. Tie break = trade_id (deterministic).
  const sorted = [...buys].sort((a, b) => {
    const da = a.executed_at;
    const db = b.executed_at;
    if (da < db) return -1;
    if (da > db) return 1;
    return a.trade_id < b.trade_id ? -1 : a.trade_id > b.trade_id ? 1 : 0;
  });

  const sellUnitTry = unitTry(sell.price, sell.currency, sell.fx_rate_to_try);
  const manualOverride = sell.taxes > 0;

  const lots: ConsumedLot[] = [];
  let remaining = sell.quantity;

  for (const buy of sorted) {
    if (remaining <= QTY_EPSILON) break;

    const available = buy.quantity - buy.prior_consumed_qty;
    if (available <= QTY_EPSILON) continue;

    // Buy gelecekte olamaz; FIFO sıralaması zaten süzer ama defansif.
    if (buy.executed_at > sell.executed_at) break;

    const consumed = Math.min(available, remaining);
    const buyUnitTry = unitTry(buy.price, buy.currency, buy.fx_rate_to_try);

    // Buy fees: consumed/buy.quantity oranında lot'a düşer.
    const buyFeesShare = buy.quantity > 0 ? buy.fees * (consumed / buy.quantity) : 0;
    const costBasis = consumed * buyUnitTry + buyFeesShare;

    // Sell fees: consumed/sell.quantity oranında lot'a düşer.
    const sellFeesShare = sell.quantity > 0 ? sell.fees * (consumed / sell.quantity) : 0;
    const proceeds = consumed * sellUnitTry - sellFeesShare;
    const realizedPnl = proceeds - costBasis;

    const holdingDays = diffDays(buy.executed_at, sell.executed_at);

    const tax = resolveTax(buy.executed_at, sell.executed_at);

    let taxBasis = 0;
    let withholding = 0;
    if (manualOverride) {
      // Toplam sell.taxes lot'lara qty-oranında dağıtılır
      withholding = sell.quantity > 0 ? sell.taxes * (consumed / sell.quantity) : 0;
      taxBasis = realizedPnl > 0 ? realizedPnl : 0;
    } else if (realizedPnl > 0 && tax.rate != null && tax.rate > 0) {
      taxBasis = realizedPnl;
      withholding = taxBasis * tax.rate;
    } else {
      // Zarar / rate=0 (HSYF) / rate=null (BELIRSIZ/DOVIZ/SERBEST)
      taxBasis = 0;
      withholding = 0;
    }

    lots.push({
      buy_trade_id: buy.trade_id,
      quantity: round8(consumed),
      cost_basis_try: round4(costBasis),
      proceeds_try: round4(proceeds),
      realized_pnl_try: round4(realizedPnl),
      holding_period_days: holdingDays,
      fees_allocated_try: round4(sellFeesShare),
      applied_tax_kind: tax.kind,
      applied_tax_rate: tax.rate,
      applied_tax_rule_id: tax.rule_id,
      tax_confidence: tax.confidence,
      tax_source: tax.source,
      tax_basis_try: round4(taxBasis),
      withholding_try: round4(withholding),
      manual_tax_override: manualOverride,
      closed_at: sell.executed_at,
    });

    remaining -= consumed;
  }

  if (remaining > QTY_EPSILON) {
    return {
      ok: false,
      error: `Yetersiz acik pozisyon: ${remaining.toFixed(6)} adet eslesemedi.`,
    };
  }

  const totals = lots.reduce(
    (acc, l) => {
      acc.qty += l.quantity;
      acc.cost += l.cost_basis_try;
      acc.proceeds += l.proceeds_try;
      acc.pnl += l.realized_pnl_try;
      acc.wht += l.withholding_try;
      acc.fees += l.fees_allocated_try;
      return acc;
    },
    { qty: 0, cost: 0, proceeds: 0, pnl: 0, wht: 0, fees: 0 },
  );

  return {
    ok: true,
    method: "FIFO",
    lots,
    total_consumed_qty: round8(totals.qty),
    total_cost_basis_try: round4(totals.cost),
    total_proceeds_try: round4(totals.proceeds),
    total_realized_pnl_try: round4(totals.pnl),
    total_withholding_try: round4(totals.wht),
    total_fees_allocated_try: round4(totals.fees),
  };
}

function unitTry(price: number, currency: string, fx: number | null): number {
  if (currency === "TRY") return price;
  return price * (fx ?? 1);
}

function diffDays(fromIso: string, toIso: string): number {
  const a = new Date(fromIso).getTime();
  const b = new Date(toIso).getTime();
  if (!Number.isFinite(a) || !Number.isFinite(b)) return 0;
  const days = Math.floor((b - a) / 86_400_000);
  return days < 0 ? 0 : days;
}

function round4(n: number): number {
  return Math.round(n * 10000) / 10000;
}

function round8(n: number): number {
  return Math.round(n * 1e8) / 1e8;
}

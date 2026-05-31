// Sprint-6 PR-E — Pure allocation engine.
//
// DB yok; server action saf input verir, pure logic karar üretir.
// Test edilebilirlik için tüm hesaplamalar (Top N seçimi, target weight,
// diff hesabı, summary aggregate) bu modülde.

import {
  ALLOCATION_DEFAULTS,
  type AllocationAction,
  type AllocationCurrentPosition,
  type AllocationDiff,
  type AllocationSummary,
  type AllocationTargetFund,
  type SellDryRunResult,
} from "./allocation-types";
import { FORBIDDEN_WORDS_RE } from "./score-explain";

// ──────────────────────────────────────────────────────────────────────────
// Top N seçimi
// ──────────────────────────────────────────────────────────────────────────

export interface ScoreCandidate {
  fund_code: string;
  mehmet_score: number | null;
  components_used: number | null;
}

/**
 * v_fund_scores_latest sonuçlarından Top N seçer:
 *  - mehmet_score not null
 *  - components_used >= MIN_COMPONENTS_USED
 *  - Skor DESC, eşit skorda fund_code ASC (deterministik)
 */
export function selectTopN<T extends ScoreCandidate>(
  scores: T[],
  topN: number = ALLOCATION_DEFAULTS.TOP_N,
  minComponents: number = ALLOCATION_DEFAULTS.MIN_COMPONENTS_USED,
): T[] {
  const filtered = scores.filter(
    (s) =>
      s.mehmet_score != null &&
      Number.isFinite(s.mehmet_score) &&
      (s.components_used ?? 0) >= minComponents,
  );
  const sorted = [...filtered].sort((a, b) => {
    const sb = b.mehmet_score ?? -Infinity;
    const sa = a.mehmet_score ?? -Infinity;
    if (sb !== sa) return sb - sa;
    return a.fund_code.localeCompare(b.fund_code);
  });
  return sorted.slice(0, topN);
}

/** Equal Weight: 1/N per fund. Sprint-7'de Score-Weighted toggle eklenecek. */
export function computeTargetWeights(funds: ScoreCandidate[]): Map<string, number> {
  const n = funds.length;
  if (n === 0) return new Map();
  const w = 1 / n;
  return new Map(funds.map((f) => [f.fund_code, w]));
}

// ──────────────────────────────────────────────────────────────────────────
// Diff hesabı (target vs current)
// ──────────────────────────────────────────────────────────────────────────

export interface BuildDiffInput {
  targets: AllocationTargetFund[];
  current: AllocationCurrentPosition[];
  totalMarketValueTry: number;
  rebalanceBandPct?: number;
}

/**
 * Per fund eylem kararı:
 *  - delta_pct = current - target
 *  - |delta| <= band → TUT
 *  - delta > band   → AZALTMA (current > target → satış)
 *  - delta < -band  → EKLEME (current < target → alış)
 *
 * Target dışı fund pozisyonları da diff'e dahil edilir (target_weight=0,
 * action=AZALTMA, current_weight kadar satış önerisi).
 *
 * delta_try = delta_pct * totalMV (pozitif = AZALTMA, negatif = EKLEME).
 */
export function buildAllocationDiff(input: BuildDiffInput): AllocationDiff[] {
  const band = input.rebalanceBandPct ?? ALLOCATION_DEFAULTS.REBALANCE_BAND_PCT;
  const totalMV = input.totalMarketValueTry;

  // Current pozisyonları fund_code → weight + asset_id map
  const currentByFund = new Map<string, AllocationCurrentPosition>();
  for (const c of input.current) {
    if (c.fund_code) currentByFund.set(c.fund_code, c);
  }

  const targetByFund = new Map<string, AllocationTargetFund>();
  for (const t of input.targets) targetByFund.set(t.fund_code, t);

  const seenCodes = new Set<string>();
  const diffs: AllocationDiff[] = [];

  // 1. Target fund'lar (in_target = true)
  for (const t of input.targets) {
    seenCodes.add(t.fund_code);
    const cur = currentByFund.get(t.fund_code);
    const currentWeight = cur ? cur.weight_pct : 0;
    const targetWeight = t.target_weight_pct;
    const deltaPct = currentWeight - targetWeight;
    const action = decideAction(deltaPct, band);
    diffs.push({
      fund_code: t.fund_code,
      fund_name: t.fund_name,
      in_target: true,
      in_portfolio: !!cur,
      current_weight_pct: currentWeight,
      target_weight_pct: targetWeight,
      delta_pct: deltaPct,
      action,
      delta_try: deltaPct * totalMV,
    });
  }

  // 2. Portföydeki target dışı fund'lar
  for (const c of input.current) {
    if (!c.fund_code || seenCodes.has(c.fund_code)) continue;
    if (c.weight_pct <= 0) continue;
    seenCodes.add(c.fund_code);
    const deltaPct = c.weight_pct - 0;
    diffs.push({
      fund_code: c.fund_code,
      fund_name: c.fund_name,
      in_target: false,
      in_portfolio: true,
      current_weight_pct: c.weight_pct,
      target_weight_pct: 0,
      delta_pct: deltaPct,
      // Band uygulanmaz — target=0 olduğu için TUT anlamlı değil.
      action: "AZALTMA",
      delta_try: c.market_value_try,
    });
  }

  return diffs;
}

function decideAction(deltaPct: number, band: number): AllocationAction {
  if (Math.abs(deltaPct) <= band) return "TUT";
  if (deltaPct > band) return "AZALTMA";
  return "EKLEME";
}

// ──────────────────────────────────────────────────────────────────────────
// Summary aggregate
// ──────────────────────────────────────────────────────────────────────────

export interface BuildSummaryInput {
  diffs: AllocationDiff[];
  sellDryRuns: SellDryRunResult[];
  totalMarketValueTry: number;
  topN: number;
  rebalanceBandPct: number;
}

export function buildAllocationSummary(input: BuildSummaryInput): AllocationSummary {
  let totalBuy = 0;
  let totalSell = 0;
  for (const d of input.diffs) {
    if (d.action === "AZALTMA") totalSell += d.delta_try;
    else if (d.action === "EKLEME") totalBuy += -d.delta_try; // delta_try negatif
  }
  const totalRealizedPnl = input.sellDryRuns.reduce(
    (s, r) => s + r.estimated_realized_pnl_try,
    0,
  );
  const totalTax = input.sellDryRuns.reduce(
    (s, r) => s + r.estimated_withholding_try,
    0,
  );
  const totalNetProceeds = input.sellDryRuns.reduce(
    (s, r) => s + r.estimated_net_proceeds_try,
    0,
  );
  // Net cash need: alımlar - net satış geliri. Pozitif → ek nakit lazım.
  const netCashNeed = totalBuy - totalNetProceeds;

  return {
    total_market_value_try: round2(input.totalMarketValueTry),
    total_buy_try: round2(totalBuy),
    total_sell_try: round2(totalSell),
    estimated_net_proceeds_try: round2(totalNetProceeds),
    net_cash_need_try: round2(netCashNeed),
    total_realized_pnl_try: round2(totalRealizedPnl),
    total_tax_try: round2(totalTax),
    total_net_pnl_try: round2(totalRealizedPnl - totalTax),
    rebalance_band_pct: input.rebalanceBandPct,
    top_n: input.topN,
    strategy: "equal_weight",
  };
}

function round2(n: number): number {
  return Math.round(n * 100) / 100;
}

// ──────────────────────────────────────────────────────────────────────────
// Current positions market value + weight hesaplama
// ──────────────────────────────────────────────────────────────────────────

export interface RawHolding {
  asset_id: string;
  asset_class: string;
  symbol: string;
  fund_code: string | null;
  fund_name: string | null;
  quantity: number;
  wac_try: number;
  cost_basis_try: number;
  last_price_try: number | null;
}

/**
 * Holdings + son fiyatlar → market value + weight.
 * last_price null ise fallback: WAC (cost basis korunur).
 * Non-fund varlıklar (asset_class != 'fund') current'e dahil ama
 * fund_code null kalır; allocation diff'inde TUT/AZALTMA dışında bırakılır.
 */
export function buildCurrentPositions(
  holdings: RawHolding[],
): { positions: AllocationCurrentPosition[]; totalMarketValueTry: number } {
  const enriched = holdings.map((h) => {
    const price = h.last_price_try ?? h.wac_try;
    const mv = h.quantity * price;
    return { h, mv };
  });
  const total = enriched.reduce((s, x) => s + x.mv, 0);
  const positions: AllocationCurrentPosition[] = enriched.map(({ h, mv }) => ({
    asset_id: h.asset_id,
    asset_class: h.asset_class,
    symbol: h.symbol,
    fund_code: h.fund_code,
    fund_name: h.fund_name,
    quantity: h.quantity,
    wac_try: h.wac_try,
    cost_basis_try: h.cost_basis_try,
    last_price_try: h.last_price_try,
    market_value_try: round2(mv),
    weight_pct: total > 0 ? mv / total : 0,
  }));
  return { positions, totalMarketValueTry: round2(total) };
}

// ──────────────────────────────────────────────────────────────────────────
// Forbidden words guard
// ──────────────────────────────────────────────────────────────────────────

/**
 * Tüm string field'larda yasak kelime taraması. False dönerse UI render
 * etmemeli; sanitize edilmesi veya komite snippet'ı atılması gerekir.
 */
export function checkForbiddenWords(strings: Array<string | null | undefined>): boolean {
  for (const s of strings) {
    if (typeof s !== "string" || s.length === 0) continue;
    if (FORBIDDEN_WORDS_RE.test(s)) return false;
  }
  return true;
}

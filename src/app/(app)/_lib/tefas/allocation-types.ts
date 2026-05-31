// Sprint-6 PR-E — Allocation engine type definitions.
//
// Tek yer: server action, pure engine, dry-run helper ve testler
// aynı type'ları paylaşır. UI yok (PR-F kapsamı).

import type { FundTaxConfidence, FundTaxKind } from "./types";

// ──────────────────────────────────────────────────────────────────────────
// Defaults (Sprint-6 design §2)
// ──────────────────────────────────────────────────────────────────────────

export const ALLOCATION_DEFAULTS = {
  /** Production default — Sprint-6 design §13. */
  TOP_N: 10,
  /** Production rebalance period (gün) — Sprint-6 design §13. */
  REBALANCE_DAYS: 90,
  /** Equal Weight default — Score-Weighted Sprint-7'de. */
  STRATEGY: "equal_weight" as const,
  /** Rebalance band ±5% — Sprint-6 design §2. */
  REBALANCE_BAND_PCT: 0.05,
  /** Tek fon ağırlık cap (Score-Weighted için). */
  MAX_WEIGHT_CAP: 0.20,
  /** components_used minimum (skoru güvenilir saymak için). */
  MIN_COMPONENTS_USED: 3,
} as const;

/** Backtest champion (display reference only — production değildir). */
export const BACKTEST_CHAMPION = {
  TOP_N: 5,
  REBALANCE_DAYS: 30,
  STRATEGY: "equal_weight" as const,
} as const;

// ──────────────────────────────────────────────────────────────────────────
// Komite gerekçesi snippet (per target fund)
// ──────────────────────────────────────────────────────────────────────────

export interface KomiteSnippet {
  strength_first: string | null;
  category_rank: number | null;
  category_total: number | null;
  category_medal: string | null;
  category_band_label: string | null;
  tax_impact_label: string | null;
  data_quality_flags: Array<{
    severity: "info" | "warn" | "critical";
    label: string;
  }>;
}

// ──────────────────────────────────────────────────────────────────────────
// Target / Current / Diff
// ──────────────────────────────────────────────────────────────────────────

export interface AllocationTargetFund {
  fund_code: string;
  fund_name: string | null;
  category_name: string | null;
  mehmet_score: number;
  components_used: number;
  target_weight_pct: number; // 0.10 for TOP_N=10
  komite: KomiteSnippet | null;
}

export interface AllocationCurrentPosition {
  asset_id: string;
  asset_class: string;
  symbol: string;
  fund_code: string | null; // null if not a fund
  fund_name: string | null;
  quantity: number;
  wac_try: number;
  cost_basis_try: number;
  last_price_try: number | null;
  market_value_try: number;
  weight_pct: number;
}

/** Eylem dili — "emir" değil, "kayıt önerisi". */
export type AllocationAction = "EKLEME" | "AZALTMA" | "TUT";

export interface AllocationDiff {
  fund_code: string;
  fund_name: string | null;
  in_target: boolean;
  in_portfolio: boolean;
  current_weight_pct: number;
  target_weight_pct: number;
  delta_pct: number; // current - target; negative = underweight, positive = overweight
  action: AllocationAction;
  /** Yaklaşık TRY tutar; pozitif = AZALTMA (satış), negatif = EKLEME (alış). */
  delta_try: number;
}

// ──────────────────────────────────────────────────────────────────────────
// Sell dry-run (per fund azaltma için stopaj/nakit tahmini)
// ──────────────────────────────────────────────────────────────────────────

export interface SellDryRunResult {
  fund_code: string;
  sell_quantity: number;
  estimated_cost_basis_try: number;
  estimated_proceeds_try: number;
  estimated_realized_pnl_try: number;
  estimated_withholding_try: number;
  estimated_net_proceeds_try: number;
  applied_tax_kind: FundTaxKind;
  applied_tax_rate: number | null;
  tax_confidence: FundTaxConfidence;
  lots_consumed: number;
}

// ──────────────────────────────────────────────────────────────────────────
// Summary + Result
// ──────────────────────────────────────────────────────────────────────────

export interface AllocationSummary {
  total_market_value_try: number;
  total_buy_try: number;
  total_sell_try: number;
  estimated_net_proceeds_try: number;
  /** Net nakit ihtiyacı = total_buy - estimated_net_proceeds (pozitif → nakit gerek). */
  net_cash_need_try: number;
  total_realized_pnl_try: number;
  total_tax_try: number;
  total_net_pnl_try: number;
  rebalance_band_pct: number;
  top_n: number;
  strategy: "equal_weight";
}

export interface AllocationFlag {
  level: "info" | "warn" | "critical";
  message: string;
}

export interface AllocationResult {
  persona_id: string;
  portfolio_id: string;
  generated_at: string;
  target: AllocationTargetFund[];
  current: AllocationCurrentPosition[];
  diff: AllocationDiff[];
  sell_dry_runs: SellDryRunResult[];
  summary: AllocationSummary;
  data_quality_flags: AllocationFlag[];
  /** False ise UI render etmemeli — string sanitization guard. */
  forbidden_words_safe: boolean;
  /** Display only — Sprint-5.6 backtest şampiyonu rozeti. */
  backtest_champion: typeof BACKTEST_CHAMPION;
}

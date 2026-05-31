/**
 * Generated-shaped Database type for the supabase-js generic.
 * In production this file would be replaced by:
 *   supabase gen types typescript --linked > src/lib/types/database.ts
 *
 * We hand-author a minimal subset here so the rest of the app type-checks
 * without requiring the CLI to be wired up.
 */

export type Json =
  | string
  | number
  | boolean
  | null
  | { [key: string]: Json | undefined }
  | Json[];

export interface Database {
  public: {
    Tables: {
      portfolios: TableShape<PortfolioRow, PortfolioInsert>;
      beneficiaries: TableShape<BeneficiaryRow, BeneficiaryInsert>;
      categories: TableShape<CategoryRow, CategoryInsert>;
      custody_locations: TableShape<CustodyRow, CustodyInsert>;
      accounts: TableShape<AccountRow, AccountInsert>;
      statement_imports: TableShape<StatementImportRow, StatementImportInsert>;
      transactions: TableShape<TransactionRow, TransactionInsert>;
      transaction_drafts: TableShape<DraftRow, DraftInsert>;
      classification_rules: TableShape<RuleRow, RuleInsert>;
      assets: TableShape<AssetRow, AssetInsert>;
      trades: TableShape<TradeRow, TradeInsert>;
      price_snapshots: TableShape<PriceSnapshotRow, PriceSnapshotInsert>;
      screener_ranks: TableShape<ScreenerRankRow, ScreenerRankInsert>;
      catalyst_events: TableShape<CatalystRow, CatalystInsert>;
      fund_categories: TableShape<FundCategoryRow, FundCategoryInsert>;
      funds: TableShape<FundRow, FundInsert>;
      fund_tax_rules: TableShape<FundTaxRuleRow, FundTaxRuleInsert>;
      tax_rules_audit: TableShape<TaxRulesAuditRow, TaxRulesAuditInsert>;
      tracked_funds: TableShape<TrackedFundRow, TrackedFundInsert>;
      fund_prices: TableShape<FundPriceRow, FundPriceInsert>;
      tefas_ingest_log: TableShape<TefasIngestLogRow, TefasIngestLogInsert>;
      cpi_monthly: TableShape<CpiMonthlyRow, CpiMonthlyInsert>;
      fund_returns_cache: TableShape<FundReturnsRow, FundReturnsInsert>;
      fund_returns_ingest_log: TableShape<FundReturnsIngestLogRow, FundReturnsIngestLogInsert>;
      user_personas: TableShape<UserPersonaRow, UserPersonaInsert>;
      fund_scores_cache: TableShape<FundScoresRow, FundScoresInsert>;
      fund_scores_ingest_log: TableShape<FundScoresIngestLogRow, FundScoresIngestLogInsert>;
      risk_flags: TableShape<RiskFlagRow, RiskFlagInsert>;
    };
    Views: {
      v_account_balances: { Row: AccountBalanceRow };
      v_portfolio_marked_to_market: { Row: HoldingMTMRow };
      v_screener_today: { Row: ScreenerTodayRow };
      v_monthly_cashflow: { Row: MonthlyCashflowRow };
      v_beneficiary_spend: { Row: BeneficiarySpendRow };
      v_fund_prices_latest: { Row: FundPriceRow };
      v_tefas_fund_prices_health: { Row: TefasFundHealthRow };
      v_cpi_monthly_yoy: { Row: CpiYoyRow };
      v_fund_returns_latest: { Row: FundReturnsRow };
      v_fund_returns_health: { Row: FundReturnsHealthRow };
      v_fund_scores_latest: { Row: FundScoresRow };
      v_fund_scores_health: { Row: FundScoresHealthRow };
    };
    Functions: {
      bootstrap_user_defaults: { Args: Record<string, never>; Returns: void };
    };
  };
}

interface TableShape<Row, Insert> {
  Row: Row;
  Insert: Insert;
  Update: Partial<Insert>;
  Relationships: [];
}

// ---------- entity rows -------------------------------------------------

export interface PortfolioRow {
  id: string;
  user_id: string;
  name: string;
  slug: string;
  description: string | null;
  base_currency: string;
  is_default: boolean;
  archived_at: string | null;
  created_at: string;
  updated_at: string;
}
export type PortfolioInsert = Omit<
  PortfolioRow,
  "id" | "created_at" | "updated_at"
> & {
  id?: string;
};

export interface BeneficiaryRow {
  id: string;
  user_id: string;
  name: string;
  slug: string;
  color: string | null;
  archived_at: string | null;
  created_at: string;
  updated_at: string;
}
export type BeneficiaryInsert = Omit<
  BeneficiaryRow,
  "id" | "created_at" | "updated_at"
> & { id?: string };

export interface CategoryRow {
  id: string;
  user_id: string;
  parent_id: string | null;
  name: string;
  slug: string;
  kind: "expense" | "income" | "transfer";
  icon: string | null;
  color: string | null;
  archived_at: string | null;
  created_at: string;
  updated_at: string;
}
export type CategoryInsert = Omit<
  CategoryRow,
  "id" | "created_at" | "updated_at"
> & { id?: string };

export interface CustodyRow {
  id: string;
  user_id: string;
  name: string;
  slug: string;
  kind: string;
  notes: string | null;
  archived_at: string | null;
  created_at: string;
  updated_at: string;
}
export type CustodyInsert = Omit<
  CustodyRow,
  "id" | "created_at" | "updated_at"
> & { id?: string };

export interface AccountRow {
  id: string;
  user_id: string;
  portfolio_id: string | null;
  custody_id: string | null;
  name: string;
  account_type: string;
  currency: string;
  iban: string | null;
  last4: string | null;
  opening_balance: number;
  credit_limit: number | null;
  statement_day: number | null;
  due_day: number | null;
  archived_at: string | null;
  created_at: string;
  updated_at: string;
}
export type AccountInsert = Omit<
  AccountRow,
  "id" | "created_at" | "updated_at"
> & { id?: string };

export interface StatementImportRow {
  id: string;
  user_id: string;
  account_id: string | null;
  source_name: string | null;
  source_kind: "csv" | "xlsx" | "manual" | "api";
  row_count: number;
  period_start: string | null;
  period_end: string | null;
  status: "pending" | "reviewed" | "committed" | "discarded";
  raw_payload: Json | null;
  notes: string | null;
  created_at: string;
  updated_at: string;
}
export type StatementImportInsert = Omit<
  StatementImportRow,
  "id" | "created_at" | "updated_at"
> & { id?: string };

export type TxnDirection = "inflow" | "outflow" | "transfer";

export interface TransactionRow {
  id: string;
  user_id: string;
  account_id: string;
  counter_account_id: string | null;
  import_id: string | null;
  occurred_on: string;
  posted_on: string | null;
  direction: TxnDirection;
  amount: number;
  currency: string;
  fx_rate_to_try: number | null;
  amount_try: number;
  description: string | null;
  merchant_raw: string | null;
  merchant_clean: string | null;
  category_id: string | null;
  beneficiary_id: string | null;
  is_transfer: boolean;
  is_installment: boolean;
  installment_seq: number | null;
  installment_total: number | null;
  parent_purchase_id: string | null;
  status: "draft" | "committed" | "ignored";
  hash_dedupe: string | null;
  notes: string | null;
  created_at: string;
  updated_at: string;
}
type Optionalize<T, K extends keyof T> = Omit<T, K> & Partial<Pick<T, K>>;

export type TransactionInsert = Optionalize<
  Omit<TransactionRow, "id" | "created_at" | "updated_at" | "amount_try">,
  | "posted_on"
  | "fx_rate_to_try"
  | "counter_account_id"
  | "import_id"
  | "description"
  | "merchant_raw"
  | "merchant_clean"
  | "category_id"
  | "beneficiary_id"
  | "is_transfer"
  | "is_installment"
  | "installment_seq"
  | "installment_total"
  | "parent_purchase_id"
  | "status"
  | "hash_dedupe"
  | "notes"
  | "currency"
> & { id?: string };

export interface DraftRow {
  id: string;
  user_id: string;
  import_id: string;
  account_id: string;
  raw: Json;
  occurred_on: string;
  amount: number;
  direction: TxnDirection;
  currency: string;
  merchant_raw: string | null;
  merchant_clean: string | null;
  suggested_category_id: string | null;
  suggested_beneficiary_id: string | null;
  suggested_is_transfer: boolean;
  suggested_counter_account_id: string | null;
  suggested_installment_total: number | null;
  matched_rule_id: string | null;
  confidence: number | null;
  decision: "pending" | "accept" | "edit" | "ignore";
  hash_dedupe: string | null;
  created_at: string;
  updated_at: string;
}
export type DraftInsert = Omit<DraftRow, "id" | "created_at" | "updated_at"> & {
  id?: string;
};

export interface RuleRow {
  id: string;
  user_id: string;
  name: string;
  priority: number;
  is_enabled: boolean;
  match_account_id: string | null;
  match_card_last4: string | null;
  match_direction: TxnDirection | null;
  match_min_amount: number | null;
  match_max_amount: number | null;
  match_merchant_ilike: string | null;
  match_description_ilike: string | null;
  match_regex: string | null;
  set_category_id: string | null;
  set_beneficiary_id: string | null;
  set_is_transfer: boolean | null;
  set_counter_account_id: string | null;
  set_installment_total: number | null;
  set_ignore: boolean;
  set_tag_ids: string[] | null;
  confidence: number;
  hit_count: number;
  last_hit_at: string | null;
  created_at: string;
  updated_at: string;
}
export type RuleInsert = Omit<RuleRow, "id" | "created_at" | "updated_at"> & {
  id?: string;
};

export interface AssetRow {
  id: string;
  symbol: string;
  name: string;
  asset_class: string;
  currency: string;
  exchange: string | null;
  sector: string | null;
  isin: string | null;
  is_active: boolean;
  created_at: string;
  updated_at: string;
}
export type AssetInsert = Omit<AssetRow, "id" | "created_at" | "updated_at"> & {
  id?: string;
};

export interface TradeRow {
  id: string;
  user_id: string;
  portfolio_id: string;
  custody_id: string | null;
  account_id: string | null;
  asset_id: string;
  side: "buy" | "sell";
  executed_at: string;
  quantity: number;
  price: number;
  currency: string;
  fx_rate_to_try: number | null;
  fees: number;
  taxes: number;
  notes: string | null;
  external_ref: string | null;
  linked_txn_id: string | null;
  created_at: string;
  updated_at: string;
}
export type TradeInsert = Omit<TradeRow, "id" | "created_at" | "updated_at"> & {
  id?: string;
};

export interface PriceSnapshotRow {
  asset_id: string;
  as_of: string;
  open: number | null;
  high: number | null;
  low: number | null;
  close: number;
  volume: number | null;
  source: string | null;
  created_at: string;
}
export type PriceSnapshotInsert = Omit<PriceSnapshotRow, "created_at">;

export interface ScreenerRankRow {
  asset_id: string;
  as_of: string;
  technical_score: number | null;
  fundamental_score: number | null;
  catalyst_score: number | null;
  composite_score: number;
  tier: "tier1" | "tier2" | "tier3" | "watch";
  badges: string[];
  notes: string | null;
  computed_at: string;
}
export type ScreenerRankInsert = Omit<ScreenerRankRow, "computed_at">;

export interface CatalystRow {
  id: string;
  asset_id: string;
  occurred_at: string;
  source: string;
  external_id: string | null;
  title: string;
  raw_text: string | null;
  summary: string | null;
  polarity: "positive" | "neutral" | "negative";
  llm_model: string | null;
  llm_at: string | null;
  created_at: string;
}
export type CatalystInsert = Omit<CatalystRow, "id" | "created_at"> & {
  id?: string;
};

export type RiskFlagKind = "vbts" | "ban" | "spk" | "fin" | "vol" | "manual";

export interface RiskFlagRow {
  id: string;
  user_id: string;
  symbol: string;
  kind: RiskFlagKind;
  severity: number;
  note: string | null;
  active: boolean;
  expires_at: string | null;
  created_at: string;
  updated_at: string;
}
export type RiskFlagInsert = Omit<
  RiskFlagRow,
  "id" | "created_at" | "updated_at"
> & {
  id?: string;
};

// ---------- view rows ----------------------------------------------------

export interface AccountBalanceRow {
  account_id: string;
  user_id: string;
  name: string;
  account_type: string;
  currency: string;
  balance: number;
}

export interface HoldingMTMRow {
  user_id: string;
  portfolio_id: string;
  asset_id: string;
  symbol: string;
  name: string;
  asset_class: string;
  quantity: number;
  wac_try: number;
  cost_basis_try: number;
  last_price: number | null;
  priced_at: string | null;
  market_value_try: number;
  unrealized_pnl_try: number;
  unrealized_pnl_pct: number | null;
}

export interface ScreenerTodayRow {
  as_of: string;
  tier: "tier1" | "tier2" | "tier3" | "watch";
  composite_score: number;
  technical_score: number | null;
  fundamental_score: number | null;
  catalyst_score: number | null;
  badges: string[];
  symbol: string;
  name: string;
  sector: string | null;
  close: number;
  rs_rating: number | null;
  vol_surge_ratio: number | null;
  pct_from_52w_high: number | null;
  breakout_flag: boolean | null;
}

export interface MonthlyCashflowRow {
  user_id: string;
  period: string;
  direction: TxnDirection;
  category_id: string | null;
  beneficiary_id: string | null;
  total_try: number;
  txn_count: number;
}

export interface BeneficiarySpendRow {
  user_id: string;
  beneficiary_id: string;
  beneficiary_name: string;
  period: string;
  total_try: number;
}

// ---------- TEFAS Sprint-1 ----------------------------------------------

export type FundTaxKind =
  | "HSYF_0_STOPAJ"
  | "GENEL_17_5"
  | "DOVIZ_BAZLI"
  | "SERBEST_FON"
  | "BELIRSIZ";

export type FundInvestmentUniverse =
  | "BIST_HISSE_TR"
  | "BIST_KATILIM_30"
  | "KIRA_SERTIFIKASI_TRY"
  | "KIRA_SERTIFIKASI_FX"
  | "ALTIN"
  | "GUMUS"
  | "KIYMETLI_MADEN_KARMA"
  | "TEKNOLOJI_HISSE"
  | "SEKTOREL_BIST"
  | "KATILIM_PARA_PIYASASI"
  | "COKLU_VARLIK"
  | "ULUSLARARASI_HISSE"
  | "DOVIZ_SERBEST_USD"
  | "DOVIZ_SERBEST_EUR"
  | "ARBITRAJ"
  | "FON_SEPETI"
  | "DIGER";

export type FundTaxConfidence = "HIGH" | "MEDIUM" | "LOW" | "NONE";
export type FundTaxRuleScope = "FUND" | "CATEGORY" | "TAX_KIND";
export type TaxAuditOperation = "INSERT" | "UPDATE" | "DELETE" | "DEACTIVATE";

export interface FundCategoryRow {
  id: number;
  code: string;
  name_tr: string;
  color: string | null;
  default_tax_kind: FundTaxKind;
  default_risk_band: string | null;
  sort_order: number;
  notes: string | null;
  created_at: string;
}
export type FundCategoryInsert = Omit<FundCategoryRow, "id" | "created_at"> & {
  id?: number;
};

export interface FundRow {
  code: string;
  name: string;
  category_id: number;
  currency: "TRY" | "USD" | "EUR";
  is_participation: boolean;
  is_equity_intensive: boolean;
  is_free_fund: boolean;
  is_fx_denominated: boolean;
  is_tefas_traded: boolean;
  risk_level: number | null;
  management_firm: string | null;
  fund_type: string | null;
  investment_universe: FundInvestmentUniverse;
  tax_confidence: FundTaxConfidence;
  metadata: Json;
  is_active: boolean;
  notes: string | null;
  created_at: string;
  updated_at: string;
}
export type FundInsert = Omit<FundRow, "created_at" | "updated_at">;

export interface FundTaxRuleRow {
  id: string;
  scope: FundTaxRuleScope;
  fund_code: string | null;
  category_id: number | null;
  tax_kind: FundTaxKind;
  withholding_rate: number | null;
  effective_from: string;
  effective_to: string | null;
  applies_to_acquired_from: string | null;
  applies_to_acquired_to: string | null;
  min_holding_days: number | null;
  priority: number;
  description: string;
  source_url: string | null;
  is_active: boolean;
  created_at: string;
}
export type FundTaxRuleInsert = Omit<FundTaxRuleRow, "id" | "created_at"> & {
  id?: string;
};

export interface TaxRulesAuditRow {
  id: string;
  rule_id: string | null;
  operation: TaxAuditOperation;
  old_values: Json | null;
  new_values: Json | null;
  changed_at: string;
  changed_by: string;
  change_reason: string | null;
}
export type TaxRulesAuditInsert = Omit<TaxRulesAuditRow, "id" | "changed_at"> & {
  id?: string;
};

export interface TrackedFundRow {
  id: string;
  user_id: string;
  fund_code: string;
  is_active: boolean;
  notes: string | null;
  added_at: string;
}
export type TrackedFundInsert = Omit<TrackedFundRow, "id" | "added_at"> & {
  id?: string;
};

export interface FundPriceRow {
  fund_code: string;
  as_of: string;
  nav: number;
  total_value_try: number | null;
  investor_count: number | null;
  share_count: number | null;
  management_fee_annual_pct: number | null;
  expense_ratio_pct: number | null;
  source: string;
  fetched_at: string;
}
export type FundPriceInsert = Omit<FundPriceRow, "fetched_at"> & {
  fetched_at?: string;
};

export interface TefasIngestLogRow {
  id: string;
  ran_at: string;
  duration_ms: number;
  requested: number;
  succeeded: number;
  upserted: number;
  failed_count: number;
  failed_codes: string[];
  upsert_error: string | null;
  source: string;
  triggered_by: string;
}
export type TefasIngestLogInsert = Omit<TefasIngestLogRow, "id" | "ran_at"> & {
  id?: string;
  ran_at?: string;
};

export interface TefasFundHealthRow {
  fund_code: string;
  is_active: boolean;
  is_equity_intensive: boolean;
  is_free_fund: boolean;
  is_fx_denominated: boolean;
  last_as_of: string | null;
  last_nav: number | null;
  last_source: string | null;
  last_fetched_at: string | null;
  days_stale: number | null;
}

export interface CpiMonthlyRow {
  series_code: string;
  period_month: string;
  index_value: number;
  monthly_change_pct: number | null;
  source: string;
  fetched_at: string;
  is_final: boolean;
  notes: string | null;
}
export type CpiMonthlyInsert = Omit<CpiMonthlyRow, "fetched_at"> & {
  fetched_at?: string;
};

export interface CpiYoyRow {
  series_code: string;
  period_month: string;
  index_value: number;
  monthly_change_pct: number | null;
  index_12mo_ago: number | null;
  yoy_change: number | null;
  is_final: boolean;
  source: string;
  fetched_at: string;
}

export interface FundReturnsRow {
  fund_code: string;
  as_of: string;
  gross_1d: number | null;
  gross_1w: number | null;
  gross_1m: number | null;
  gross_3m: number | null;
  gross_6m: number | null;
  gross_ytd: number | null;
  gross_1y: number | null;
  gross_3y_cagr: number | null;
  gross_5y_cagr: number | null;
  real_1y: number | null;
  real_3y_cagr: number | null;
  real_5y_cagr: number | null;
  vs_category_1y: number | null;
  vs_category_3y: number | null;
  vs_category_net_1y: number | null;
  vs_category_net_3y: number | null;
  net_1y: number | null;
  net_3y_cagr: number | null;
  net_5y_cagr: number | null;
  applied_tax_kind: string | null;
  applied_tax_rate: number | null;
  tax_confidence: string | null;
  tax_source: string | null;
  computed_at: string;
  computed_from_period: string | null;
  warnings: string[];
}
export type FundReturnsInsert = Omit<FundReturnsRow, "computed_at"> & {
  computed_at?: string;
};

export interface FundReturnsIngestLogRow {
  id: string;
  ran_at: string;
  duration_ms: number;
  processed: number;
  upserted: number;
  skipped_count: number;
  skipped_codes: string[];
  error: string | null;
  triggered_by: string;
}
export type FundReturnsIngestLogInsert = Omit<
  FundReturnsIngestLogRow,
  "id" | "ran_at"
> & {
  id?: string;
  ran_at?: string;
};

export interface FundReturnsHealthRow {
  fund_code: string;
  is_equity_intensive: boolean;
  is_free_fund: boolean;
  is_fx_denominated: boolean;
  last_as_of: string | null;
  last_computed_at: string | null;
  tax_confidence: string | null;
  applied_tax_kind: string | null;
  applied_tax_rate: number | null;
  warnings: string[] | null;
  days_stale: number | null;
  has_1y: boolean;
  has_3y: boolean;
  has_5y: boolean;
  has_real_1y: boolean;
  has_net_1y: boolean;
}

export type TaxConfidenceFilter = "NONE" | "LOW" | "MEDIUM" | "HIGH";

export interface UserPersonaRow {
  id: string;
  user_id: string | null;
  name: string;
  is_default: boolean;
  inflation_weight: number;
  tax_weight: number;
  risk_weight: number;
  long_term_weight: number;
  diversification_weight: number;
  investment_horizon_years: number | null;
  max_volatility_pct: number | null;
  min_tax_confidence: TaxConfidenceFilter | null;
  notes: string | null;
  created_at: string;
  updated_at: string;
}
export type UserPersonaInsert = Omit<UserPersonaRow, "id" | "created_at" | "updated_at"> & {
  id?: string;
};

export interface FundScoresRow {
  fund_code: string;
  as_of: string;
  persona_id: string;
  volatility_1y: number | null;
  max_drawdown_3y: number | null;
  downside_volatility_1y: number | null;
  sharpe_like_1y: number | null;
  bist_correlation_1y: number | null;
  gold_correlation_1y: number | null;
  bist_source: string | null;
  gold_source: string | null;
  inflation_protection_score: number | null;
  tax_advantage_score: number | null;
  normalized_risk_score: number | null;
  long_term_performance_score: number | null;
  diversification_score: number | null;
  bist_dependency_score: number | null;
  gold_dependency_score: number | null;
  mehmet_score: number | null;
  components_used: number | null;
  computed_at: string;
  warnings: string[];
}
export type FundScoresInsert = Omit<FundScoresRow, "computed_at"> & {
  computed_at?: string;
};

export interface FundScoresIngestLogRow {
  id: string;
  ran_at: string;
  duration_ms: number;
  processed_funds: number;
  processed_personas: number;
  upserted: number;
  skipped_count: number;
  skipped_codes: string[];
  error: string | null;
  triggered_by: string;
}
export type FundScoresIngestLogInsert = Omit<FundScoresIngestLogRow, "id" | "ran_at"> & {
  id?: string;
  ran_at?: string;
};

export interface FundScoresHealthRow {
  fund_code: string;
  persona_id: string;
  persona_name: string;
  investment_universe: FundInvestmentUniverse;
  last_as_of: string | null;
  last_computed_at: string | null;
  mehmet_score: number | null;
  components_used: number | null;
  warnings: string[] | null;
  days_stale: number | null;
  has_mehmet: boolean;
  has_volatility: boolean;
  has_max_drawdown: boolean;
}

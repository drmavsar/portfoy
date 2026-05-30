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
    };
    Views: {
      v_account_balances: { Row: AccountBalanceRow };
      v_portfolio_marked_to_market: { Row: HoldingMTMRow };
      v_screener_today: { Row: ScreenerTodayRow };
      v_monthly_cashflow: { Row: MonthlyCashflowRow };
      v_beneficiary_spend: { Row: BeneficiarySpendRow };
      v_fund_prices_latest: { Row: FundPriceRow };
      v_tefas_fund_prices_health: { Row: TefasFundHealthRow };
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

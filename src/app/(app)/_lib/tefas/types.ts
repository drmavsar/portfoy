// TEFAS Sprint-1 — domain tiplerinin re-export'u + Sprint-1'de tüketilmeyen
// ama API surface'i sabit kalsın diye burada tanımlanan iki tip:
// - `ResolvedTaxRule`: resolveTaxRule(fundCode, acquiredAt, soldAt) çıktısı.
//   Sprint-3'te performans motoru ve Sprint-6'da realized_lots trigger'ı
//   bu imzayı tüketir.

export type {
  FundCategoryRow as FundCategory,
  FundRow as Fund,
  FundTaxRuleRow as FundTaxRule,
  TaxRulesAuditRow as TaxRulesAuditEntry,
  TrackedFundRow as TrackedFund,
  FundPriceRow as FundPrice,
  TefasIngestLogRow as TefasIngestLog,
  TefasFundHealthRow as TefasFundHealth,
  CpiMonthlyRow as CpiMonthly,
  CpiYoyRow as CpiYoy,
  FundReturnsRow as FundReturns,
  FundReturnsIngestLogRow as FundReturnsIngestLog,
  FundReturnsHealthRow as FundReturnsHealth,
  FundTaxKind,
  FundInvestmentUniverse,
  FundTaxConfidence,
  FundTaxRuleScope,
  TaxAuditOperation,
} from "@/lib/types/database";

import type {
  FundTaxKind,
  FundTaxConfidence,
  FundTaxRuleRow,
} from "@/lib/types/database";

/**
 * `resolveTaxRule(fundCode, acquiredAt, soldAt)` çıktısı.
 *
 * - `rule`: efektif kural (FUND > CATEGORY > TAX_KIND öncelikli).
 *   Hiçbir kural eşleşmezse `null`.
 * - `effective_rate`: kuralın `withholding_rate`'i; BELIRSIZ / DOVIZ_BAZLI /
 *   SERBEST_FON tarafından çözünen kural için `null`.
 * - `confidence`: `funds.tax_confidence` değeri (fon master'ından).
 *   `effective_rate` `null` ise confidence düşürülür (max LOW).
 * - `kind`: hızlı switch için `tax_kind` kopyası.
 * - `source`: kuralın hangi seviyeden seçildiği — debugging / UI'da görünür.
 */
export interface ResolvedTaxRule {
  rule: FundTaxRuleRow | null;
  effective_rate: number | null;
  confidence: FundTaxConfidence;
  kind: FundTaxKind;
  source: "FUND" | "CATEGORY" | "TAX_KIND_DEFAULT" | "NONE";
}

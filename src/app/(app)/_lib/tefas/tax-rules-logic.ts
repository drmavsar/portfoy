// Saf logic — DB bağımlılığı yok. Test edilebilirlik ve Sprint-3'te batch
// performans hesabı (her pozisyon için DB call etmeden) için ayrıldı.

import { clampConfidenceForRate } from "./constants";
import type {
  Fund,
  FundTaxKind,
  FundTaxRule,
  ResolvedTaxRule,
} from "./types";

export function toISODate(d: Date | string): string {
  if (typeof d === "string") return d.slice(0, 10);
  return d.toISOString().slice(0, 10);
}

/**
 * Sprint-1 stopaj kural çözüm mantığı.
 *
 * Öncelik sırası: FUND > CATEGORY > TAX_KIND_DEFAULT.
 * Tarih filtreleri (her seviye için):
 *  - `effective_from <= soldAt` ve (`effective_to` null veya `> soldAt`)
 *  - `applies_to_acquired_from` null veya `<= acquiredAt`
 *  - `applies_to_acquired_to` null veya `> acquiredAt`
 * Çakışma: aynı seviyede birden çok eşleşme varsa `priority DESC` karar verir.
 *
 * @param defaultKind Fonun kategorisinin `default_tax_kind`'i (TAX_KIND fallback).
 */
export function resolveTaxRulePure(
  fund: Pick<Fund, "code" | "category_id" | "tax_confidence">,
  rules: FundTaxRule[],
  defaultKind: FundTaxKind,
  acquired: string,
  sold: string,
): ResolvedTaxRule {
  const matches = (rule: FundTaxRule): boolean => {
    if (rule.effective_from > sold) return false;
    if (rule.effective_to && rule.effective_to <= sold) return false;
    if (rule.applies_to_acquired_from && rule.applies_to_acquired_from > acquired) return false;
    if (rule.applies_to_acquired_to && rule.applies_to_acquired_to <= acquired) return false;
    return true;
  };

  const pickHighest = (xs: FundTaxRule[]): FundTaxRule | null => {
    if (xs.length === 0) return null;
    return [...xs].sort((a, b) => b.priority - a.priority)[0];
  };

  const fundLevel = pickHighest(
    rules.filter((r) => r.scope === "FUND" && r.fund_code === fund.code && matches(r)),
  );
  if (fundLevel) return build(fund.tax_confidence, fundLevel, "FUND");

  const categoryLevel = pickHighest(
    rules.filter((r) => r.scope === "CATEGORY" && r.category_id === fund.category_id && matches(r)),
  );
  if (categoryLevel) return build(fund.tax_confidence, categoryLevel, "CATEGORY");

  const taxKindLevel = pickHighest(
    rules.filter((r) => r.scope === "TAX_KIND" && r.tax_kind === defaultKind && matches(r)),
  );
  if (taxKindLevel) return build(fund.tax_confidence, taxKindLevel, "TAX_KIND_DEFAULT");

  return {
    rule: null,
    effective_rate: null,
    confidence: "NONE",
    kind: "BELIRSIZ",
    source: "NONE",
  };
}

function build(
  fundConfidence: ResolvedTaxRule["confidence"],
  rule: FundTaxRule,
  source: ResolvedTaxRule["source"],
): ResolvedTaxRule {
  return {
    rule,
    effective_rate: rule.withholding_rate,
    confidence: clampConfidenceForRate(fundConfidence, rule.withholding_rate),
    kind: rule.tax_kind,
    source,
  };
}

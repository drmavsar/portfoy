import { describe, expect, it } from "vitest";

import { resolveTaxRulePure } from "./tax-rules-logic";
import type { Fund, FundTaxKind, FundTaxRule } from "./types";

function fund(overrides: Partial<Fund> = {}): Pick<Fund, "code" | "category_id" | "tax_confidence"> {
  return {
    code: "TST",
    category_id: 1,
    tax_confidence: "HIGH",
    ...overrides,
  };
}

function rule(overrides: Partial<FundTaxRule>): FundTaxRule {
  return {
    id: crypto.randomUUID(),
    scope: "TAX_KIND",
    fund_code: null,
    category_id: null,
    tax_kind: "GENEL_17_5" as FundTaxKind,
    withholding_rate: 0.175,
    effective_from: "2026-01-01",
    effective_to: null,
    applies_to_acquired_from: null,
    applies_to_acquired_to: null,
    min_holding_days: null,
    priority: 100,
    description: "test",
    source_url: null,
    is_active: true,
    created_at: "2026-01-01T00:00:00Z",
    ...overrides,
  };
}

describe("resolveTaxRulePure", () => {
  it("HSYF fonu için TAX_KIND_DEFAULT %0 stopaj", () => {
    const rules = [
      rule({ tax_kind: "HSYF_0_STOPAJ", withholding_rate: 0 }),
      rule({ tax_kind: "GENEL_17_5", withholding_rate: 0.175 }),
    ];
    const r = resolveTaxRulePure(
      fund({ tax_confidence: "HIGH" }),
      rules,
      "HSYF_0_STOPAJ",
      "2026-01-15",
      "2026-06-15",
    );
    expect(r.kind).toBe("HSYF_0_STOPAJ");
    expect(r.effective_rate).toBe(0);
    expect(r.confidence).toBe("HIGH");
    expect(r.source).toBe("TAX_KIND_DEFAULT");
  });

  it("Genel kategori → %17.5 stopaj", () => {
    const rules = [
      rule({ tax_kind: "HSYF_0_STOPAJ", withholding_rate: 0 }),
      rule({ tax_kind: "GENEL_17_5", withholding_rate: 0.175 }),
    ];
    const r = resolveTaxRulePure(fund(), rules, "GENEL_17_5", "2026-02-01", "2026-08-01");
    expect(r.effective_rate).toBe(0.175);
    expect(r.kind).toBe("GENEL_17_5");
  });

  it("DOVIZ_BAZLI → rate null, confidence LOW'a düşer (HIGH'tan)", () => {
    const rules = [rule({ tax_kind: "DOVIZ_BAZLI", withholding_rate: null })];
    const r = resolveTaxRulePure(
      fund({ tax_confidence: "HIGH" }),
      rules,
      "DOVIZ_BAZLI",
      "2026-01-01",
      "2026-06-01",
    );
    expect(r.effective_rate).toBeNull();
    expect(r.confidence).toBe("LOW");
    expect(r.kind).toBe("DOVIZ_BAZLI");
  });

  it("Hiçbir kural yoksa NONE source dönülür", () => {
    const r = resolveTaxRulePure(fund(), [], "BELIRSIZ", "2026-01-01", "2026-06-01");
    expect(r.rule).toBeNull();
    expect(r.source).toBe("NONE");
    expect(r.kind).toBe("BELIRSIZ");
    expect(r.confidence).toBe("NONE");
  });

  it("FUND > CATEGORY > TAX_KIND öncelik sırası", () => {
    const rules = [
      rule({ scope: "TAX_KIND", tax_kind: "GENEL_17_5", withholding_rate: 0.175 }),
      rule({ scope: "CATEGORY", category_id: 1, tax_kind: "GENEL_17_5", withholding_rate: 0.15 }),
      rule({ scope: "FUND", fund_code: "TST", tax_kind: "GENEL_17_5", withholding_rate: 0.10 }),
    ];
    const r = resolveTaxRulePure(fund(), rules, "GENEL_17_5", "2026-01-01", "2026-06-01");
    expect(r.effective_rate).toBe(0.10);
    expect(r.source).toBe("FUND");
  });

  it("FUND yoksa CATEGORY seçilir", () => {
    const rules = [
      rule({ scope: "TAX_KIND", tax_kind: "GENEL_17_5", withholding_rate: 0.175 }),
      rule({ scope: "CATEGORY", category_id: 1, tax_kind: "GENEL_17_5", withholding_rate: 0.15 }),
    ];
    const r = resolveTaxRulePure(fund(), rules, "GENEL_17_5", "2026-01-01", "2026-06-01");
    expect(r.effective_rate).toBe(0.15);
    expect(r.source).toBe("CATEGORY");
  });

  it("Yürürlük tarihi sold'tan sonraysa kural seçilmez", () => {
    const rules = [
      rule({
        scope: "FUND",
        fund_code: "TST",
        effective_from: "2027-01-01",
        tax_kind: "HSYF_0_STOPAJ",
        withholding_rate: 0,
      }),
    ];
    const r = resolveTaxRulePure(fund(), rules, "BELIRSIZ", "2026-01-01", "2026-06-01");
    expect(r.source).toBe("NONE");
  });

  it("effective_to sold'tan önceyse kural seçilmez", () => {
    const rules = [
      rule({
        scope: "FUND",
        fund_code: "TST",
        effective_from: "2024-01-01",
        effective_to: "2025-12-31",
        withholding_rate: 0.20,
      }),
    ];
    const r = resolveTaxRulePure(fund(), rules, "BELIRSIZ", "2024-06-01", "2026-06-01");
    expect(r.source).toBe("NONE");
  });

  it("Aynı fonu farklı acquired_at için farklı kurallar — eski kural lot iktisap aralığında", () => {
    const oldRule = rule({
      scope: "FUND",
      fund_code: "TST",
      applies_to_acquired_from: "2024-01-01",
      applies_to_acquired_to: "2025-01-01",
      withholding_rate: 0.10,
      priority: 200,
    });
    const newRule = rule({
      scope: "FUND",
      fund_code: "TST",
      applies_to_acquired_from: "2025-01-01",
      withholding_rate: 0.175,
      priority: 200,
    });
    const rules = [oldRule, newRule];

    // 2024-06-01 alınan lot → eski kural
    const lotOld = resolveTaxRulePure(fund(), rules, "GENEL_17_5", "2024-06-01", "2026-06-01");
    expect(lotOld.effective_rate).toBe(0.10);

    // 2025-06-01 alınan lot → yeni kural
    const lotNew = resolveTaxRulePure(fund(), rules, "GENEL_17_5", "2025-06-01", "2026-06-01");
    expect(lotNew.effective_rate).toBe(0.175);
  });

  it("Aynı seviyede iki eşleşen kural varsa priority DESC seçer", () => {
    const rules = [
      rule({ scope: "FUND", fund_code: "TST", withholding_rate: 0.10, priority: 100 }),
      rule({ scope: "FUND", fund_code: "TST", withholding_rate: 0.05, priority: 200 }),
    ];
    const r = resolveTaxRulePure(fund(), rules, "GENEL_17_5", "2026-01-01", "2026-06-01");
    expect(r.effective_rate).toBe(0.05);
    expect(r.source).toBe("FUND");
  });

  it("fund.tax_confidence MEDIUM + DOVIZ_BAZLI null rate → LOW'a düşer", () => {
    const rules = [rule({ tax_kind: "DOVIZ_BAZLI", withholding_rate: null })];
    const r = resolveTaxRulePure(
      fund({ tax_confidence: "MEDIUM" }),
      rules,
      "DOVIZ_BAZLI",
      "2026-01-01",
      "2026-06-01",
    );
    expect(r.confidence).toBe("LOW");
  });

  it("fund.tax_confidence HIGH + GENEL_17_5 (rate dolu) → HIGH korunur", () => {
    const rules = [rule({ tax_kind: "GENEL_17_5", withholding_rate: 0.175 })];
    const r = resolveTaxRulePure(
      fund({ tax_confidence: "HIGH" }),
      rules,
      "GENEL_17_5",
      "2026-01-01",
      "2026-06-01",
    );
    expect(r.confidence).toBe("HIGH");
  });
});

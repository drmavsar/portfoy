import { describe, expect, it } from "vitest";

import { progressiveIncomeTax, taxParamsFor } from "@/lib/finance/tr-tax-params";

import {
  bucketOf,
  computeTaxYearReport,
  taxIncomeKindForCategory,
  type TaxIncome,
  type TaxLot,
  type TaxYearInput,
} from "./tax-year-report";

function lot(o: Partial<TaxLot>): TaxLot {
  return {
    closed_at: o.closed_at ?? "2026-05-10T10:00:00Z",
    asset_symbol: o.asset_symbol ?? "THYAO",
    asset_class: o.asset_class ?? "equity_tr",
    portfolio_id: o.portfolio_id ?? "P1",
    beneficiary_id: o.beneficiary_id ?? "M",
    proceeds_try: o.proceeds_try ?? 1000,
    cost_basis_try: o.cost_basis_try ?? 900,
    realized_pnl_try: o.realized_pnl_try ?? 100,
    withholding_try: o.withholding_try ?? 0,
    applied_tax_kind: o.applied_tax_kind ?? "BELIRSIZ",
    applied_tax_rate: o.applied_tax_rate ?? null,
    manual_tax_override: o.manual_tax_override ?? false,
  };
}

function input(over: Partial<TaxYearInput> = {}): TaxYearInput {
  return {
    year: 2026,
    today: "2026-10-04",
    lots: [],
    incomes: [],
    beneficiaryId: null,
    konutIstisnaEligible: true,
    ...over,
  };
}

describe("progressiveIncomeTax", () => {
  it("2026 tarifesi: 1.000.000 TL → 232.500 TL", () => {
    // 190k×%15 + 210k×%20 + 600k×%27
    expect(progressiveIncomeTax(1_000_000, taxParamsFor(2026)!)).toBeCloseTo(232_500, 6);
  });
  it("ilk dilim içinde düz %15, sıfır/negatif → 0", () => {
    expect(progressiveIncomeTax(100_000, taxParamsFor(2026)!)).toBeCloseTo(15_000, 6);
    expect(progressiveIncomeTax(0, taxParamsFor(2026)!)).toBe(0);
  });
  it("son dilim %40", () => {
    const p = taxParamsFor(2025)!;
    const at = progressiveIncomeTax(4_300_000, p);
    expect(progressiveIncomeTax(4_400_000, p) - at).toBeCloseTo(40_000, 6);
  });
});

describe("bucketOf / kategori eşleme", () => {
  it("varlık sınıfı ve vergi türüne göre", () => {
    expect(bucketOf({ asset_class: "equity_tr", applied_tax_kind: "BELIRSIZ", applied_tax_rate: null })).toBe("BIST_HISSE");
    expect(bucketOf({ asset_class: "fund", applied_tax_kind: "HSYF_0_STOPAJ", applied_tax_rate: 0 })).toBe("FON_HSYF");
    expect(bucketOf({ asset_class: "fund", applied_tax_kind: "GENEL_17_5", applied_tax_rate: 0.175 })).toBe("FON_STOPAJLI");
    expect(bucketOf({ asset_class: "fund", applied_tax_kind: "DOVIZ_BAZLI", applied_tax_rate: null })).toBe("FON_BELIRSIZ");
    expect(bucketOf({ asset_class: "crypto", applied_tax_kind: null, applied_tax_rate: null })).toBe("DIGER");
  });
  it("kategori adları", () => {
    expect(taxIncomeKindForCategory("Temettü")).toBe("dividend");
    expect(taxIncomeKindForCategory("Kâr Payı")).toBe("dividend");
    expect(taxIncomeKindForCategory("Kira Geliri")).toBe("rent");
    expect(taxIncomeKindForCategory("Maaş")).toBeNull();
  });
});

describe("computeTaxYearReport — alım-satım", () => {
  it("hisse zararı ve kârı ayrı toplanır, stopaj yok; başka yıl ve kişi süzülür", () => {
    const r = computeTaxYearReport(
      input({
        beneficiaryId: "M",
        lots: [
          lot({ realized_pnl_try: 300 }),
          lot({ realized_pnl_try: -500, asset_symbol: "BINHO" }),
          lot({ realized_pnl_try: 999, closed_at: "2025-12-31T10:00:00Z" }),
          lot({ realized_pnl_try: 777, beneficiary_id: "E" }),
        ],
      }),
    );
    expect(r.buckets).toHaveLength(1);
    const b = r.buckets[0];
    expect(b.key).toBe("BIST_HISSE");
    expect(b.lots).toBe(2);
    expect(b.gains).toBe(300);
    expect(b.losses).toBe(500);
    expect(b.net).toBe(-200);
    expect(b.withholdingNetted).toBe(0);
    expect(r.symbols[0].symbol).toBe("BINHO");
  });

  it("stopajlı fonda aynı portföyde yıl içi zarar kârdan mahsup edilir", () => {
    const fund = { asset_class: "fund", applied_tax_kind: "GENEL_17_5", applied_tax_rate: 0.175 } as const;
    const r = computeTaxYearReport(
      input({
        lots: [
          lot({ ...fund, asset_symbol: "AAA", realized_pnl_try: 1000, withholding_try: 175 }),
          lot({ ...fund, asset_symbol: "BBB", realized_pnl_try: -400, withholding_try: 0 }),
          // başka portföy (aracı kurum) — mahsup edilmez
          lot({ ...fund, asset_symbol: "CCC", portfolio_id: "P2", realized_pnl_try: -300, withholding_try: 0 }),
        ],
      }),
    );
    const b = r.buckets.find((x) => x.key === "FON_STOPAJLI")!;
    expect(b.withholdingLot).toBeCloseTo(175, 6);
    expect(b.withholdingNetted).toBeCloseTo(600 * 0.175, 6);
  });

  it("manuel girilen stopaj olduğu gibi alınır", () => {
    const r = computeTaxYearReport(
      input({
        lots: [
          lot({ asset_class: "fund", applied_tax_kind: "GENEL_17_5", applied_tax_rate: 0.175, realized_pnl_try: 100, withholding_try: 12, manual_tax_override: true }),
        ],
      }),
    );
    expect(r.buckets[0].withholdingNetted).toBe(12);
  });
});

describe("computeTaxYearReport — kâr payı ve kira", () => {
  const inc = (o: Partial<TaxIncome>): TaxIncome => ({
    occurred_on: o.occurred_on ?? "2026-05-15",
    amount: o.amount ?? 0,
    kind: o.kind ?? "dividend",
    beneficiary_id: o.beneficiary_id ?? "M",
  });

  it("net temettü brüte çevrilir (%15), yarısı sınırla karşılaştırılır", () => {
    const r = computeTaxYearReport(input({ incomes: [inc({ amount: 8500 })] }));
    expect(r.dividend.gross).toBeCloseTo(10_000, 6);
    expect(r.dividend.withheld).toBeCloseTo(1_500, 6);
    expect(r.dividend.declarablePart).toBeCloseTo(5_000, 6);
    expect(r.dividend.mustDeclare).toBe(false);

    const big = computeTaxYearReport(input({ incomes: [inc({ amount: 700_000 })] }));
    // brüt 823.529 → yarısı 411.765 > 400.000
    expect(big.dividend.mustDeclare).toBe(true);
    expect(big.declarations).toContain("Kâr payı (MSİ) — beyan sınırını aşıyor");
  });

  it("2024'teki temettü %10 stopajla brüte çevrilir", () => {
    const r = computeTaxYearReport(input({ year: 2024, today: "2026-10-04", incomes: [inc({ occurred_on: "2024-06-01", amount: 9000 })] }));
    expect(r.dividend.gross).toBeCloseTo(10_000, 6);
  });

  it("cari yılda kira yıl sonuna tahmin edilir; istisna, götürü gider ve vergi", () => {
    // Ocak–Haziran 20.000, Temmuz'da artış → 26.000 (gerçek veri örüntüsü).
    // Bugün 4 Ekim, Ekim kirası henüz gelmedi.
    const rents = Array.from({ length: 9 }, (_, i) =>
      inc({ kind: "rent", amount: i < 6 ? 20_000 : 26_000, occurred_on: `2026-${String(i + 1).padStart(2, "0")}-15` }),
    );
    const r = computeTaxYearReport(input({ incomes: rents }));
    expect(r.rent.received).toBe(198_000);
    expect(r.rent.projected).toBe(true);
    // Son kira 26.000 × kalan 3 ay (Ekim–Aralık) → 276.000 (ortalama 264.000 derdi)
    expect(r.rent.annualBasis).toBeCloseTo(276_000, 6);
    // (276.000 − 58.000) × 0,85 = 185.300 → ilk dilimde %15 = 27.795
    expect(r.rent.estTax).toBeCloseTo(27_795, 6);
    expect(r.rent.istisna).toBe(58_000);
    const taxable = r.rent.annualBasis - 58_000;
    expect(r.rent.matrah).toBeCloseTo(taxable * 0.85, 6);
    expect(r.rent.estTax).toBeCloseTo(progressiveIncomeTax(taxable * 0.85, taxParamsFor(2026)!), 6);
    expect(r.rent.mustDeclare).toBe(true);
    expect(r.declarations).toContain("Konut kira geliri (GMSİ)");
  });

  it("istisna altındaki kira beyan gerektirmez; istisna hakkı yoksa beyan edilir", () => {
    const small = [inc({ kind: "rent", amount: 40_000, occurred_on: "2025-03-01" })];
    const ok = computeTaxYearReport(input({ year: 2025, incomes: small }));
    expect(ok.partialYear).toBe(false);
    expect(ok.rent.annualBasis).toBe(40_000);
    expect(ok.rent.mustDeclare).toBe(false);
    expect(ok.rent.estTax).toBe(0);

    const noIst = computeTaxYearReport(input({ year: 2025, incomes: small, konutIstisnaEligible: false }));
    expect(noIst.rent.mustDeclare).toBe(true);
    expect(noIst.rent.matrah).toBeCloseTo(34_000, 6);
  });

  it("parametresi tanımsız yılda beyan kararı verilmez", () => {
    const r = computeTaxYearReport(
      input({ year: 2023, incomes: [inc({ kind: "rent", amount: 50_000, occurred_on: "2023-02-01" })] }),
    );
    expect(r.params).toBeNull();
    expect(r.rent.mustDeclare).toBeNull();
    expect(r.rent.estTax).toBeNull();
  });
});

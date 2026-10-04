import { describe, expect, it } from "vitest";

import {
  computeSavingsReport,
  depositAlternativeValue,
  unitAlternativeValue,
  type SavingsInputs,
} from "./savings-analysis";

function base(over: Partial<SavingsInputs> = {}): SavingsInputs {
  return {
    year: 2026,
    today: "2026-10-04",
    txns: [
      { occurred_on: "2026-01-10", direction: "inflow", amount: 300_000, category: "Maaş" },
      { occurred_on: "2026-01-20", direction: "outflow", amount: 480_000, category: "Eğitim" },
      { occurred_on: "2026-06-10", direction: "inflow", amount: 300_000, category: "Maaş" },
      { occurred_on: "2026-06-15", direction: "outflow", amount: 100_000, category: "Market" },
      { occurred_on: "2026-07-10", direction: "inflow", amount: 300_000, category: "Maaş" },
      { occurred_on: "2026-07-15", direction: "outflow", amount: 50_000, category: "Market" },
      { occurred_on: "2025-12-30", direction: "outflow", amount: 999, category: "Market" }, // başka yıl
    ],
    daily: [
      { date: "2026-05-17", total_wealth: 5_000_000, equity_mv: 2_800_000 },
      { date: "2026-06-30", total_wealth: 5_100_000, equity_mv: 2_850_000 },
      { date: "2026-07-31", total_wealth: 5_150_000, equity_mv: 2_700_000 },
      { date: "2026-10-03", total_wealth: 5_200_000, equity_mv: 3_190_000 },
    ],
    yearStart: { date: "2025-12-31", value: 4_200_000, source: "manual" },
    flows: [
      { date: "2026-05-15", amount: -2_700_000 }, // açılış pozisyonu (pencere dışı)
      { date: "2026-07-17", amount: -400_000 },
    ],
    dividends: [{ date: "2026-10-02", amount: 10_000 }],
    series: {
      XU100: [["2026-05-17", 14_000], ["2026-07-17", 14_000], ["2026-10-03", 12_000]],
      XAUTRY: [["2026-05-17", 6_600], ["2026-07-17", 6_100], ["2026-10-02", 6_500]],
      USDTRY: [["2026-05-17", 45.6], ["2026-07-17", 47.2], ["2026-10-02", 49.2]],
    },
    ...over,
  };
}

describe("computeSavingsReport — gelir, gider, servet", () => {
  it("yıl içi toplamlar, birikim oranı, hiç harcamasaydın", () => {
    const r = computeSavingsReport(base());
    expect(r.end).toBe("2026-10-04");
    expect(r.income.total).toBe(900_000);
    expect(r.expense.total).toBe(630_000);
    expect(r.net).toBe(270_000);
    expect(r.savingsRate).toBeCloseTo(0.3, 9);
    expect(r.expense.byCategory[0]).toMatchObject({ name: "Eğitim", amount: 480_000 });
    expect(r.wealthEnd).toEqual({ date: "2026-10-03", value: 5_200_000 });
    expect(r.noSpendWealth).toBe(5_200_000 + 630_000);
  });

  it("servet köprüsü: değişim = birikim + piyasa", () => {
    const r = computeSavingsReport(base());
    expect(r.bridge).toEqual({ delta: 1_000_000, savings: 270_000, market: 730_000 });
  });

  it("aylık piyasa etkisi yalnız önceki ay sonu biliniyorsa", () => {
    const r = computeSavingsReport(base());
    const by = Object.fromEntries(r.monthly.map((m) => [m.month, m]));
    expect(r.monthly).toHaveLength(10);
    expect(by["2026-01"].market).toBeNull(); // Ocak sonu kaydı yok
    expect(by["2026-05"].market).toBeNull(); // Nisan sonu bilinmiyor
    expect(by["2026-06"].market).toBe(5_100_000 - 5_000_000 - 200_000);
    expect(by["2026-07"].market).toBe(5_150_000 - 5_100_000 - 250_000);
    expect(by["2026-08"].wealthEnd).toBeNull();
  });
});

describe("portföy karşılaştırması", () => {
  it("ilk günlük kayıttan başlar; açılış alımı sayılmaz; temettü dahil", () => {
    const p = computeSavingsReport(base()).portfolio!;
    expect(p.start).toEqual({ date: "2026-05-17", value: 2_800_000 });
    expect(p.netInvested).toBe(2_800_000 + 400_000 - 10_000);
    expect(p.pnl).toBe(3_190_000 - 3_190_000);
    expect(p.shareOfWealth).toBeCloseTo(3_190_000 / 5_200_000, 9);
    const xu = p.alternatives.find((a) => a.key === "XU100")!;
    // 2.8M + 0.4M @14000 alınır; 2 Ekim temettüsü o günkü (≤) değer 14000 ile çıkar → 12000
    expect(xu.endValue).toBeCloseTo((3_200_000 - 10_000) * (12 / 14), 6);
    expect(xu.diff).toBeCloseTo(3_190_000 - xu.endValue, 6);
  });

  it("yıl başı günlük kaydı varsa oradan başlar", () => {
    const p = computeSavingsReport(
      base({
        daily: [{ date: "2025-12-31", total_wealth: 4_200_000, equity_mv: 2_000_000 }, ...base().daily],
      }),
    ).portfolio!;
    expect(p.start.date).toBe("2025-12-31");
  });

  it("birim ve mevduat alternatifleri", () => {
    const flows = [{ date: "2026-01-01", amount: -1000 }, { date: "2026-07-02", amount: 500 }];
    expect(unitAlternativeValue(flows, [["2026-01-01", 10], ["2026-07-02", 20], ["2027-01-01", 40]], "2027-01-01")).toBeCloseTo(
      (100 - 25) * 40,
      9,
    );
    expect(unitAlternativeValue(flows, [["2026-06-01", 10]], "2027-01-01")).toBeNull(); // ilk akış tarihinde fiyat yok
    expect(depositAlternativeValue([{ date: "2026-01-01", amount: -1000 }], 0.4, "2027-01-01")).toBeCloseTo(1400, 6);
  });
});

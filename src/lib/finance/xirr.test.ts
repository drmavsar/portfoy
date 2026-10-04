import { describe, expect, it } from "vitest";

import { periodReturn, xirr } from "./xirr";

describe("xirr", () => {
  it("tek yatırım, bir yıl sonra %10 fazlası → %10", () => {
    const r = xirr([
      { date: "2025-01-01", amount: -1000 },
      { date: "2026-01-01", amount: 1100 },
    ]);
    expect(r).toBeCloseTo(0.1, 6);
  });

  it("Excel XIRR referans örneği (≈ %37,34)", () => {
    // Microsoft XIRR dokümantasyonundaki örnek
    const r = xirr([
      { date: "2008-01-01", amount: -10000 },
      { date: "2008-03-01", amount: 2750 },
      { date: "2008-10-30", amount: 4250 },
      { date: "2009-02-15", amount: 3250 },
      { date: "2009-04-01", amount: 2750 },
    ]);
    expect(r).toBeCloseTo(0.373362535, 6);
  });

  it("ara katkılar para ağırlıklı: sonradan eklenen para getiriyi şişirmez", () => {
    // 1000 yatır, 6 ay sonra 1000 daha; yıl sonunda toplam 2100.
    const r = xirr([
      { date: "2025-01-01", amount: -1000 },
      { date: "2025-07-02", amount: -1000 },
      { date: "2026-01-01", amount: 2100 },
    ])!;
    // Basit "kâr / yatırılan" %5 olurdu; para ağırlıklı yıllık ≈ %6,6
    expect(r).toBeGreaterThan(0.06);
    expect(r).toBeLessThan(0.07);
  });

  it("zarar → negatif oran", () => {
    const r = xirr([
      { date: "2025-01-01", amount: -1000 },
      { date: "2026-01-01", amount: 800 },
    ]);
    expect(r).toBeCloseTo(-0.2, 6);
  });

  it("kısa vadede yüksek yıllık oran da çözülür", () => {
    const r = xirr([
      { date: "2026-01-01", amount: -1000 },
      { date: "2026-01-15", amount: 1100 },
    ])!;
    expect(periodReturn(r, 14)).toBeCloseTo(0.1, 6);
  });

  it("hesaplanamayan durumlar → null", () => {
    expect(xirr([])).toBeNull();
    expect(xirr([{ date: "2025-01-01", amount: -1000 }])).toBeNull();
    expect(xirr([{ date: "2025-01-01", amount: -1000 }, { date: "2026-01-01", amount: -10 }])).toBeNull();
    expect(xirr([{ date: "2025-01-01", amount: -1000 }, { date: "2025-01-01", amount: 1000 }])).toBeNull();
  });
});

describe("periodReturn", () => {
  it("yıllık %21 → 6 ayda ≈ %10", () => {
    expect(periodReturn(0.21, 182.5)).toBeCloseTo(0.1, 3);
  });
});

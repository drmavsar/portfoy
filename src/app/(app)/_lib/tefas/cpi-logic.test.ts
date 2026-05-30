import { describe, expect, it } from "vitest";

import {
  cpiPeriodForNavDate,
  ratioBetween,
  realReturnFisher,
  realReturnFromCpiPair,
} from "./cpi-logic";

describe("realReturnFisher", () => {
  it("Türkiye yüksek enflasyon senaryosu: %45 nominal, %30 enflasyon", () => {
    // Fisher: (1.45 / 1.30) - 1 = 0.11538...
    const r = realReturnFisher(0.45, 0.30);
    expect(r).toBeCloseTo(0.1154, 4);
    // Kaba çıkarma bunu %15 derdi (4 puanlık hata)
    expect(Math.abs(r - (0.45 - 0.30))).toBeGreaterThan(0.03);
  });

  it("nominal = enflasyon → reel sıfır", () => {
    expect(realReturnFisher(0.30, 0.30)).toBe(0);
  });

  it("nominal < enflasyon → negatif reel", () => {
    expect(realReturnFisher(0.20, 0.30)).toBeLessThan(0);
  });

  it("enflasyon sıfır → reel = nominal", () => {
    expect(realReturnFisher(0.15, 0)).toBeCloseTo(0.15, 10);
  });

  it("negatif nominal + pozitif enflasyon → reel daha da negatif", () => {
    const r = realReturnFisher(-0.10, 0.20);
    expect(r).toBeCloseTo(-0.25, 4);
    expect(r).toBeLessThan(-0.10);
  });
});

describe("ratioBetween", () => {
  it("başlangıçtan bitişe büyüme oranı", () => {
    expect(ratioBetween(100, 145)).toBeCloseTo(0.45, 10);
  });

  it("aynı değer → 0", () => {
    expect(ratioBetween(100, 100)).toBe(0);
  });

  it("küçülme → negatif", () => {
    expect(ratioBetween(100, 80)).toBeCloseTo(-0.20, 10);
  });

  it("start <= 0 → NaN", () => {
    expect(ratioBetween(0, 100)).toBeNaN();
    expect(ratioBetween(-1, 100)).toBeNaN();
  });

  it("NaN input → NaN", () => {
    expect(ratioBetween(NaN, 100)).toBeNaN();
    expect(ratioBetween(100, NaN)).toBeNaN();
  });
});

describe("cpiPeriodForNavDate", () => {
  it("Mayıs NAV → Nisan CPI", () => {
    expect(cpiPeriodForNavDate("2026-05-15")).toBe("2026-04");
  });

  it("Aralık NAV → Kasım CPI", () => {
    expect(cpiPeriodForNavDate("2026-12-31")).toBe("2026-11");
  });

  it("Ocak NAV → bir önceki yılın Aralık CPI'si", () => {
    expect(cpiPeriodForNavDate("2026-01-10")).toBe("2025-12");
  });

  it("ay başı tarih → bir önceki ay", () => {
    expect(cpiPeriodForNavDate("2026-03-01")).toBe("2026-02");
  });
});

describe("realReturnFromCpiPair", () => {
  it("CPI 1000 → 1300, nominal %50 → reel ~%15.4", () => {
    const r = realReturnFromCpiPair(0.50, 1000, 1300);
    expect(r).toBeCloseTo(0.1538, 4);
  });

  it("startCpi null → null döner", () => {
    expect(realReturnFromCpiPair(0.50, null, 1300)).toBeNull();
  });

  it("endCpi null → null döner", () => {
    expect(realReturnFromCpiPair(0.50, 1000, null)).toBeNull();
  });

  it("startCpi <= 0 → null", () => {
    expect(realReturnFromCpiPair(0.50, 0, 1300)).toBeNull();
  });

  it("CPI değişmedi (1000 → 1000), nominal %20 → reel = %20", () => {
    expect(realReturnFromCpiPair(0.20, 1000, 1000)).toBeCloseTo(0.20, 10);
  });
});

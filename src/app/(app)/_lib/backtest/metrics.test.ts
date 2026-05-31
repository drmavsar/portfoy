import { describe, expect, it } from "vitest";

import {
  computeCagr,
  computeMaxDrawdown,
  computeRealCagr,
  computeSharpeLike,
  computeTotalReturn,
  computeVolatility,
  computeWinRatio,
  yearsBetween,
} from "./metrics";

describe("yearsBetween", () => {
  it("1 yıl tam", () => {
    expect(yearsBetween("2023-01-01", "2024-01-01")).toBeCloseTo(0.9993, 2);
  });
  it("Aynı tarih → 0", () => {
    expect(yearsBetween("2024-01-01", "2024-01-01")).toBe(0);
  });
});

describe("computeCagr", () => {
  it("2x büyüme 4 yıl → ~%18.92 CAGR", () => {
    // 2^(1/4) - 1 = 0.1892
    expect(computeCagr(100, 200, 4)).toBeCloseTo(0.1892, 3);
  });
  it("0 büyüme → 0", () => {
    expect(computeCagr(100, 100, 5)).toBe(0);
  });
  it("Negatif değerler → null", () => {
    expect(computeCagr(-100, 100, 1)).toBeNull();
    expect(computeCagr(100, -100, 1)).toBeNull();
  });
  it("Yıl 0 → null", () => {
    expect(computeCagr(100, 200, 0)).toBeNull();
  });
});

describe("computeTotalReturn", () => {
  it("1.5x → 50%", () => {
    expect(computeTotalReturn(100, 150)).toBe(0.5);
  });
  it("Negatif start → null", () => {
    expect(computeTotalReturn(0, 150)).toBeNull();
  });
});

describe("computeVolatility", () => {
  it("Sabit seri → 0", () => {
    expect(computeVolatility([100, 100, 100, 100])).toBe(0);
  });
  it("Linear artış → düşük volatility", () => {
    const series = [100, 101, 102, 103, 104];
    const v = computeVolatility(series);
    expect(v).not.toBeNull();
    expect(v!).toBeLessThan(0.5);
  });
  it("Çok kısa seri → null", () => {
    expect(computeVolatility([100])).toBeNull();
  });
});

describe("computeMaxDrawdown", () => {
  it("Hiç düşüş yoksa → 0", () => {
    expect(computeMaxDrawdown([100, 110, 120, 130])).toBe(0);
  });
  it("Peak %50 sonrası → -%50", () => {
    expect(computeMaxDrawdown([100, 200, 100])).toBe(-0.5);
  });
  it("V şeklinde recovery → en kötü dip yakalanır", () => {
    expect(computeMaxDrawdown([100, 80, 90, 100, 110])).toBeCloseTo(-0.20, 5);
  });
  it("Boş seri → null", () => {
    expect(computeMaxDrawdown([])).toBeNull();
  });
});

describe("computeSharpeLike", () => {
  it("CAGR %20, vol %15, rf %30 → (-0.10/0.15) = -0.667", () => {
    expect(computeSharpeLike(0.20, 0.15, 0.30)).toBeCloseTo(-0.667, 2);
  });
  it("Vol 0 → null", () => {
    expect(computeSharpeLike(0.10, 0, 0.05)).toBeNull();
  });
  it("CAGR null → null", () => {
    expect(computeSharpeLike(null, 0.15, 0.05)).toBeNull();
  });
});

describe("computeRealCagr (Fisher)", () => {
  it("Nominal %20, enflasyon %10 → ~%9.09 reel", () => {
    // (1.20/1.10) - 1 = 0.0909
    expect(computeRealCagr(0.20, 0.10)).toBeCloseTo(0.0909, 3);
  });
  it("Nominal = enflasyon → 0 reel", () => {
    expect(computeRealCagr(0.30, 0.30)).toBeCloseTo(0, 5);
  });
  it("Enflasyon -%100 (impossible) → null", () => {
    expect(computeRealCagr(0.10, -1)).toBeNull();
  });
});

describe("computeWinRatio", () => {
  it("Portfolio her zaman yüksek (relative) → ~1 (i=0 baseline hariç)", () => {
    // i=0 1.0 vs 1.0 (tie, win sayılmaz); 1-3 win → 3/4
    const port = [100, 110, 120, 130];
    const bench = [100, 105, 105, 105];
    expect(computeWinRatio(port, bench)).toBe(0.75);
  });
  it("Portfolio her zaman düşük → 0", () => {
    const port = [100, 95, 90, 85];
    const bench = [100, 105, 110, 115];
    expect(computeWinRatio(port, bench)).toBe(0);
  });
});

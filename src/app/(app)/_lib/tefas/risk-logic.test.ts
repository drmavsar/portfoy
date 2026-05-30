import { describe, expect, it } from "vitest";

import {
  computeFundRiskMetrics,
  downsideVolatilityAnnualized,
  logReturns,
  maxDrawdown,
  normalizedRiskScore,
  returnRiskRatio,
  sampleStdev,
  volatilityAnnualized,
} from "./risk-logic";
import type { NavPoint } from "./returns-logic";

function flatSeries(value: number, days: number, startDate = "2024-01-01"): NavPoint[] {
  const start = Date.parse(`${startDate}T00:00:00Z`);
  const points: NavPoint[] = [];
  for (let i = 0; i < days; i++) {
    const iso = new Date(start + i * 86_400_000).toISOString().slice(0, 10);
    points.push({ as_of: iso, nav: value });
  }
  return points;
}

/** Her gün eşit oranla büyüyen seri. */
function geometricSeries(base: number, dailyReturn: number, days: number, startDate = "2024-01-01"): NavPoint[] {
  const start = Date.parse(`${startDate}T00:00:00Z`);
  const points: NavPoint[] = [];
  let nav = base;
  for (let i = 0; i < days; i++) {
    const iso = new Date(start + i * 86_400_000).toISOString().slice(0, 10);
    points.push({ as_of: iso, nav });
    nav *= 1 + dailyReturn;
  }
  return points;
}

describe("logReturns", () => {
  it("Boş seri → boş", () => {
    expect(logReturns([])).toEqual([]);
    expect(logReturns([{ as_of: "2024-01-01", nav: 100 }])).toEqual([]);
  });

  it("Düz seri → tüm getiri 0", () => {
    const r = logReturns(flatSeries(100, 5));
    expect(r).toHaveLength(4);
    for (const v of r) expect(v).toBe(0);
  });

  it("100 → 105 → 110 mantıklı log değerler döner", () => {
    const r = logReturns([
      { as_of: "2024-01-01", nav: 100 },
      { as_of: "2024-01-02", nav: 105 },
      { as_of: "2024-01-03", nav: 110 },
    ]);
    expect(r).toHaveLength(2);
    expect(r[0]).toBeCloseTo(Math.log(105 / 100), 10);
    expect(r[1]).toBeCloseTo(Math.log(110 / 105), 10);
  });

  it("Sıfır veya negatif NAV süzülür", () => {
    const r = logReturns([
      { as_of: "2024-01-01", nav: 100 },
      { as_of: "2024-01-02", nav: 0 },
      { as_of: "2024-01-03", nav: 110 },
    ]);
    // 0 nav iki adımı da bozar; 100→0 ve 0→110 atlanır → boş
    expect(r).toEqual([]);
  });
});

describe("sampleStdev", () => {
  it("Tek/iki elemanlı yetersiz", () => {
    expect(sampleStdev([])).toBeNull();
    expect(sampleStdev([1])).toBeNull();
  });

  it("[1,2,3,4,5] std ≈ 1.5811", () => {
    expect(sampleStdev([1, 2, 3, 4, 5])).toBeCloseTo(1.5811, 4);
  });

  it("Tüm değerler aynı → 0", () => {
    expect(sampleStdev([5, 5, 5, 5])).toBe(0);
  });
});

describe("volatilityAnnualized", () => {
  it("Düz seri → 0 vol", () => {
    const series = flatSeries(100, 300);
    expect(volatilityAnnualized(series)).toBe(0);
  });

  it("Yetersiz veri (60 gün, minObs 151) → null", () => {
    // 60 gün < 252 * 0.6 = 151 (default minObs)
    const series = flatSeries(100, 60);
    expect(volatilityAnnualized(series)).toBeNull();
  });

  it("Geometrik %0.1/gün → vol ≈ 0 (sabit oran → stdev ~0)", () => {
    const series = geometricSeries(100, 0.001, 300);
    const vol = volatilityAnnualized(series);
    expect(vol).not.toBeNull();
    expect(vol!).toBeCloseTo(0, 10); // floating-point: < 1e-10
  });

  it("Rastgele günlük getiriler — vol > 0", () => {
    // Pseudo-random getiri ekle (deterministic seed yerine fix dizi)
    const start = Date.parse("2024-01-01T00:00:00Z");
    const points: NavPoint[] = [];
    let nav = 100;
    // 252 gün, getiriler [-2%, +2%] arası deterministic salınım
    for (let i = 0; i < 252; i++) {
      const iso = new Date(start + i * 86_400_000).toISOString().slice(0, 10);
      points.push({ as_of: iso, nav });
      const r = i % 2 === 0 ? 0.02 : -0.02;
      nav *= 1 + r;
    }
    const vol = volatilityAnnualized(points);
    expect(vol).not.toBeNull();
    expect(vol!).toBeGreaterThan(0);
    // ±%2/gün ≈ %2 günlük stdev ≈ 0.02 * sqrt(252) ≈ 0.317
    expect(vol!).toBeCloseTo(0.317, 1);
  });

  it("custom lookbackDays kısa: yalnız son N noktadan hesapla", () => {
    const stableHistory = flatSeries(100, 100, "2023-01-01");
    const points = [...stableHistory];
    // Son 30 gün volatil seri ekle
    const start = Date.parse("2023-04-11T00:00:00Z");
    let nav = 100;
    for (let i = 0; i < 30; i++) {
      const iso = new Date(start + i * 86_400_000).toISOString().slice(0, 10);
      const r = i % 2 === 0 ? 0.02 : -0.02;
      nav *= 1 + r;
      points.push({ as_of: iso, nav });
    }
    const vol30 = volatilityAnnualized(points, { lookbackDays: 30, minObservations: 20 });
    const vol100 = volatilityAnnualized(points, { lookbackDays: 100, minObservations: 60 });
    expect(vol30).not.toBeNull();
    expect(vol100).not.toBeNull();
    // Kısa pencere daha yüksek vol göstermeli (sadece volatil dönem)
    expect(vol30!).toBeGreaterThan(vol100!);
  });
});

describe("maxDrawdown", () => {
  it("Düz seri → 0", () => {
    expect(maxDrawdown(flatSeries(100, 10))).toBe(0);
  });

  it("Monoton artan → 0", () => {
    const series = geometricSeries(100, 0.001, 100);
    expect(maxDrawdown(series)).toBe(0);
  });

  it("100 → 200 (peak) → 150 → 180 → en kötü drawdown −%25", () => {
    const series: NavPoint[] = [
      { as_of: "2024-01-01", nav: 100 },
      { as_of: "2024-01-02", nav: 150 },
      { as_of: "2024-01-03", nav: 200 },
      { as_of: "2024-01-04", nav: 180 },
      { as_of: "2024-01-05", nav: 150 },
      { as_of: "2024-01-06", nav: 180 },
    ];
    // peak=200, en düşük 150 → 150/200 - 1 = -0.25
    expect(maxDrawdown(series)).toBeCloseTo(-0.25, 6);
  });

  it("Lookback penceresi kısaltılırsa eski peak hesaba katılmaz", () => {
    // Tüm pencere: peak 200, son 3 gün için peak 150
    const series: NavPoint[] = [
      { as_of: "2024-01-01", nav: 100 },
      { as_of: "2024-01-02", nav: 200 },
      { as_of: "2024-01-03", nav: 100 },
      { as_of: "2024-01-04", nav: 150 },
      { as_of: "2024-01-05", nav: 140 },
      { as_of: "2024-01-06", nav: 145 },
    ];
    const ddAll = maxDrawdown(series, { lookbackDays: 10 });
    const dd3 = maxDrawdown(series, { lookbackDays: 3 });
    expect(ddAll).toBeCloseTo(-0.5, 6); // 100/200 - 1 = -0.5
    // Son 3 nokta: 150, 140, 145. Peak 150, en düşük 140 → -0.0667
    expect(dd3).toBeCloseTo(-(10 / 150), 4);
  });

  it("Tek nokta → null", () => {
    expect(maxDrawdown([{ as_of: "2024-01-01", nav: 100 }])).toBeNull();
  });
});

describe("downsideVolatilityAnnualized", () => {
  it("Tüm pozitif getiriler → 0 (downside yok)", () => {
    const series = geometricSeries(100, 0.001, 300);
    expect(downsideVolatilityAnnualized(series)).toBe(0);
  });

  it("Düz seri (getiri 0) → MAR=0 ile downside boş → 0", () => {
    expect(downsideVolatilityAnnualized(flatSeries(100, 300))).toBe(0);
  });

  it("Karışık getiri → downside pozitif", () => {
    const start = Date.parse("2024-01-01T00:00:00Z");
    const points: NavPoint[] = [];
    let nav = 100;
    for (let i = 0; i < 252; i++) {
      const iso = new Date(start + i * 86_400_000).toISOString().slice(0, 10);
      points.push({ as_of: iso, nav });
      const r = i % 3 === 0 ? -0.02 : 0.01;
      nav *= 1 + r;
    }
    const dv = downsideVolatilityAnnualized(points);
    expect(dv).not.toBeNull();
    expect(dv!).toBeGreaterThan(0);
  });

  it("Yetersiz veri → null", () => {
    expect(downsideVolatilityAnnualized(flatSeries(100, 30))).toBeNull();
  });
});

describe("returnRiskRatio", () => {
  it("Pozitif getiri / pozitif vol → pozitif ratio", () => {
    expect(returnRiskRatio(0.30, 0.20)).toBeCloseTo(1.5, 10);
  });

  it("Sıfır vol → null (tanımsız)", () => {
    expect(returnRiskRatio(0.30, 0)).toBeNull();
  });

  it("Null girişler → null", () => {
    expect(returnRiskRatio(null, 0.20)).toBeNull();
    expect(returnRiskRatio(0.30, null)).toBeNull();
  });

  it("Negatif getiri → negatif ratio (riske göre kötü)", () => {
    expect(returnRiskRatio(-0.10, 0.20)).toBeCloseTo(-0.5, 10);
  });
});

describe("normalizedRiskScore (0-100)", () => {
  it("vol = 0 → 100", () => {
    expect(normalizedRiskScore(0)).toBe(100);
  });

  it("vol = maxVol → 0", () => {
    expect(normalizedRiskScore(0.40, 0.40)).toBe(0);
  });

  it("vol > maxVol → clamp 0", () => {
    expect(normalizedRiskScore(0.60, 0.40)).toBe(0);
  });

  it("vol = 0.20 (orta), maxVol = 0.40 → ~50", () => {
    expect(normalizedRiskScore(0.20, 0.40)).toBe(50);
  });

  it("null vol → null", () => {
    expect(normalizedRiskScore(null)).toBeNull();
  });

  it("Negatif vol → null (gerçekçi değil)", () => {
    expect(normalizedRiskScore(-0.01)).toBeNull();
  });
});

describe("computeFundRiskMetrics — toplu hesap", () => {
  it("Düz seri (300 gün) → vol 0, MaxDD 0, ratio null", () => {
    const series = flatSeries(100, 300);
    const m = computeFundRiskMetrics(series, 0);
    expect(m.volatility_1y).toBe(0);
    expect(m.max_drawdown_3y).toBe(0);
    expect(m.downside_volatility_1y).toBe(0);
    expect(m.return_risk_ratio_1y).toBeNull(); // vol 0 → ratio null
    expect(m.normalized_risk_score).toBe(100);
  });

  it("Yetersiz veri (30 gün) → tüm metrikler null", () => {
    const series = flatSeries(100, 30);
    const m = computeFundRiskMetrics(series, 0.10);
    expect(m.volatility_1y).toBeNull();
    expect(m.return_risk_ratio_1y).toBeNull();
    expect(m.normalized_risk_score).toBeNull();
  });

  it("Karışık seri → tutarlı dolu metrikler", () => {
    const start = Date.parse("2023-01-01T00:00:00Z");
    const points: NavPoint[] = [];
    let nav = 100;
    for (let i = 0; i < 800; i++) {
      const iso = new Date(start + i * 86_400_000).toISOString().slice(0, 10);
      points.push({ as_of: iso, nav });
      const r = i % 2 === 0 ? 0.015 : -0.012;
      nav *= 1 + r;
    }
    const m = computeFundRiskMetrics(points, 0.20, { maxVolatility: 0.40 });
    expect(m.volatility_1y).not.toBeNull();
    expect(m.volatility_1y!).toBeGreaterThan(0);
    expect(m.max_drawdown_3y).not.toBeNull();
    expect(m.max_drawdown_3y!).toBeLessThanOrEqual(0);
    expect(m.return_risk_ratio_1y).not.toBeNull();
    expect(m.normalized_risk_score).toBeGreaterThanOrEqual(0);
    expect(m.normalized_risk_score!).toBeLessThanOrEqual(100);
  });
});

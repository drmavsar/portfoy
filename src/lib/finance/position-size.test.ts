import { describe, expect, it } from "vitest";

import { BSMV_RATE, medianFeeRate, parseLooseNumber, sizePosition, type PositionSizeResult } from "./position-size";

const base = { equity: 1_000_000, riskPct: 0.01, entry: 100, stop: 95, commissionRate: 0.0017 };

function ok(r: ReturnType<typeof sizePosition>): PositionSizeResult {
  if (!r.ok) throw new Error(r.error);
  return r;
}

describe("sizePosition", () => {
  it("risk bütçesi masraflar dahil hisse başı riske bölünür", () => {
    const r = ok(sizePosition(base));
    const c = 0.0017 * (1 + BSMV_RATE); // 0.001785
    const perShare = 5 + 100 * c + 95 * c; // 5.348...
    expect(r.effectiveRate).toBeCloseTo(c, 12);
    expect(r.riskPerShare).toBeCloseTo(perShare, 9);
    expect(r.qty).toBe(Math.floor(10_000 / perShare)); // 1869 (masrafsız 2000 olurdu)
    expect(r.actualRisk).toBeLessThanOrEqual(10_000);
    expect(r.limitedBy).toBe("risk");
  });

  it("hedefte net kâr ve R/R iki yön masrafı düşer", () => {
    const r = ok(sizePosition({ ...base, target: 115 }));
    const c = r.effectiveRate;
    const net = 115 - 100 - 100 * c - 115 * c;
    expect(r.rr).toBeCloseTo(net / r.riskPerShare, 9);
    expect(r.rr!).toBeLessThan(3); // brüt 15/5 = 3
    expect(r.netRewardAtTarget).toBeCloseTo(r.qty * net, 6);
    expect(r.breakeven).toBeGreaterThan(100);
  });

  it("azami pozisyon ve nakit sınırı", () => {
    // Dar stop → risk 10.000 / ~0,5 = ~19.000 hisse = 1,9 M ₺ > hesap
    const tight = ok(sizePosition({ ...base, stop: 99.5, maxPositionPct: 0.2 }));
    expect(tight.limitedBy).toBe("maxPosition");
    expect(tight.positionValue).toBeLessThanOrEqual(200_000);

    const cash = ok(sizePosition({ ...base, cash: 50_000 }));
    expect(cash.limitedBy).toBe("cash");
    expect(cash.qty * 100 * (1 + cash.effectiveRate)).toBeLessThanOrEqual(50_000);
  });

  it("BSMV kapatılabilir; geçersiz girdiler hata", () => {
    expect(ok(sizePosition({ ...base, includeBsmv: false })).effectiveRate).toBe(0.0017);
    expect(sizePosition({ ...base, stop: 100 }).ok).toBe(false);
    expect(sizePosition({ ...base, stop: 101 }).ok).toBe(false);
    expect(sizePosition({ ...base, riskPct: 0 }).ok).toBe(false);
    expect(sizePosition({ ...base, equity: 0 }).ok).toBe(false);
  });
});

describe("medianFeeRate", () => {
  it("masraflı işlemlerin medyanı; masrafsız ve uçuk olanlar atlanır", () => {
    const t = (q: number, p: number, f: number) => ({ quantity: q, price: p, fees: f });
    expect(
      medianFeeRate([t(100, 100, 17.85), t(100, 100, 17), t(100, 100, 21), t(100, 100, 0), t(1, 1, 5)]),
    ).toBeCloseTo(0.001785, 9); // geçerli 3 oran: 0,0017 · 0,001785 · 0,0021
    expect(medianFeeRate([t(100, 100, 17), t(100, 100, 21)])).toBeCloseTo(0.0019, 9);
    expect(medianFeeRate([])).toBeNull();
  });
});

describe("parseLooseNumber", () => {
  it("TR biçimi, binlik noktalar ve ondalık nokta", () => {
    expect(parseLooseNumber("1.234,5")).toBe(1234.5);
    expect(parseLooseNumber("1.500.000")).toBe(1_500_000);
    expect(parseLooseNumber("95.5")).toBe(95.5); // ön doldurulan fiyat 955 okunmamalı
    expect(parseLooseNumber("1,7")).toBe(1.7);
    expect(parseLooseNumber(" 250 000 ")).toBe(250_000);
    expect(Number.isNaN(parseLooseNumber("abc"))).toBe(true);
  });
});

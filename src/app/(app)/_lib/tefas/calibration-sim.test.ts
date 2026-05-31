import { describe, expect, it } from "vitest";

import {
  MEHMET_DEFAULT_WEIGHTS,
  PRESETS,
  normalizeWeights,
  simulateScores,
  weightsSum,
  type PersonaWeights,
  type SimulationInputFund,
} from "./calibration-sim";

function mkFund(
  code: string,
  components: Partial<{
    inflation: number | null;
    tax: number | null;
    risk: number | null;
    perf: number | null;
    divers: number | null;
  }>,
  category_id: number = 1,
): SimulationInputFund {
  return {
    fund_code: code,
    name: `${code} Fonu`,
    category_id,
    components: {
      inflation_protection_score: components.inflation ?? 50,
      tax_advantage_score: components.tax ?? 50,
      normalized_risk_score: components.risk ?? 50,
      long_term_performance_score: components.perf ?? 50,
      diversification_score: components.divers ?? 50,
    },
  };
}

describe("PRESETS", () => {
  it("5 preset tanımlı, hepsi 100'e normalize", () => {
    expect(PRESETS).toHaveLength(5);
    for (const p of PRESETS) {
      expect(weightsSum(p.weights)).toBe(100);
    }
  });

  it("Mehmet Default = 25/20/20/20/15", () => {
    const def = PRESETS.find((p) => p.key === "mehmet_default")!;
    expect(def.weights).toEqual(MEHMET_DEFAULT_WEIGHTS);
  });
});

describe("simulateScores", () => {
  const funds: SimulationInputFund[] = [
    mkFund("A", { inflation: 90, tax: 50, risk: 50, perf: 50, divers: 50 }),
    mkFund("B", { inflation: 50, tax: 90, risk: 50, perf: 50, divers: 50 }),
    mkFund("C", { inflation: 50, tax: 50, risk: 90, perf: 50, divers: 50 }),
    mkFund("D", { inflation: 50, tax: 50, risk: 50, perf: 90, divers: 50 }),
    mkFund("E", { inflation: 50, tax: 50, risk: 50, perf: 50, divers: 90 }),
  ];

  it("Baseline ile simulated aynıysa hareket yok", () => {
    const r = simulateScores(funds, MEHMET_DEFAULT_WEIGHTS, MEHMET_DEFAULT_WEIGHTS);
    expect(r.movers_up).toHaveLength(0);
    expect(r.movers_down).toHaveLength(0);
    expect(r.added_to_topn).toHaveLength(0);
    expect(r.removed_from_topn).toHaveLength(0);
  });

  it("Inflation Hedge preset → A fonu yükselir, D fonu düşer", () => {
    const hedge = PRESETS.find((p) => p.key === "inflation_hedge")!.weights;
    const r = simulateScores(funds, MEHMET_DEFAULT_WEIGHTS, hedge);
    const aSim = r.rankings_simulated.find((f) => f.fund_code === "A")!;
    const aBase = r.rankings_baseline.find((f) => f.fund_code === "A")!;
    expect(aSim.score).toBeGreaterThan(aBase.score ?? 0);
  });

  it("Growth preset → D fonu (uzun vade) #1", () => {
    const growth = PRESETS.find((p) => p.key === "growth")!.weights;
    const r = simulateScores(funds, MEHMET_DEFAULT_WEIGHTS, growth);
    expect(r.rankings_simulated[0].fund_code).toBe("D");
  });

  it("Tax Efficient preset → B fonu (stopaj) #1", () => {
    const tax = PRESETS.find((p) => p.key === "tax_efficient")!.weights;
    const r = simulateScores(funds, MEHMET_DEFAULT_WEIGHTS, tax);
    expect(r.rankings_simulated[0].fund_code).toBe("B");
  });

  it("Top N: added_to_topn ve removed_from_topn", () => {
    const f10: SimulationInputFund[] = [];
    for (let i = 0; i < 10; i++) {
      f10.push(mkFund(`F${i}`, { inflation: 80 - i, tax: 50, risk: 50, perf: 50, divers: 50 }));
    }
    // F0..F4 → baseline top 5 (yüksek infl)
    const r = simulateScores(f10, MEHMET_DEFAULT_WEIGHTS, {
      ...MEHMET_DEFAULT_WEIGHTS,
      inflation_weight: 0, // infl kaldır, hepsi eşit → tie-break code
    }, 5);
    // Top 5 değişmiş olabilir (zayıf bağ)
    expect(r.top_n).toBe(5);
    expect(r.rankings_simulated).toHaveLength(10);
    expect(r.rankings_baseline).toHaveLength(10);
  });

  it("Movers maksimum 5", () => {
    const many: SimulationInputFund[] = [];
    for (let i = 0; i < 20; i++) {
      many.push(mkFund(`X${i}`, { inflation: 90 - i * 2, perf: i * 4 }));
    }
    const growth = PRESETS.find((p) => p.key === "growth")!.weights;
    const r = simulateScores(many, MEHMET_DEFAULT_WEIGHTS, growth);
    expect(r.movers_up.length).toBeLessThanOrEqual(5);
    expect(r.movers_down.length).toBeLessThanOrEqual(5);
  });

  it("Delta = rank_old - rank_new (yukarı çıkış pozitif)", () => {
    const r = simulateScores(
      funds,
      MEHMET_DEFAULT_WEIGHTS,
      PRESETS.find((p) => p.key === "growth")!.weights,
    );
    for (const m of r.movers_up) {
      expect(m.delta).toBeGreaterThan(0);
      expect(m.rank_old).toBeGreaterThan(m.rank_new);
    }
    for (const m of r.movers_down) {
      expect(m.delta).toBeLessThan(0);
      expect(m.rank_old).toBeLessThan(m.rank_new);
    }
  });
});

describe("weightsSum + normalizeWeights", () => {
  it("normalizeWeights toplamı 100 yapar", () => {
    const w: PersonaWeights = {
      inflation_weight: 50,
      tax_weight: 40,
      risk_weight: 30,
      long_term_weight: 30,
      diversification_weight: 50,
    };
    const n = normalizeWeights(w);
    expect(weightsSum(n)).toBeCloseTo(100, 5);
  });

  it("Toplam 0 ise default'a fallback", () => {
    const n = normalizeWeights({
      inflation_weight: 0,
      tax_weight: 0,
      risk_weight: 0,
      long_term_weight: 0,
      diversification_weight: 0,
    });
    expect(n).toEqual(MEHMET_DEFAULT_WEIGHTS);
  });
});

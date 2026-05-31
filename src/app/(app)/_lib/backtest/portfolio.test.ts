import { describe, expect, it } from "vitest";

import {
  computeOverlap,
  computeTurnover,
  rebalance,
  valuePortfolio,
  type PortfolioState,
} from "./portfolio";

describe("valuePortfolio", () => {
  it("Boş holdings → cash döner", () => {
    const state: PortfolioState = { holdings: new Map(), cash: 100 };
    expect(valuePortfolio(state, new Map())).toBe(100);
  });

  it("Holdings × NAV + cash", () => {
    const state: PortfolioState = {
      holdings: new Map([
        ["A", { fund_code: "A", units: 10, weight_at_rebalance: 0.5 }],
        ["B", { fund_code: "B", units: 5, weight_at_rebalance: 0.5 }],
      ]),
      cash: 0,
    };
    const nav = new Map([["A", 5], ["B", 10]]);
    expect(valuePortfolio(state, nav)).toBe(10 * 5 + 5 * 10);
  });

  it("NAV bulunmayan fon ignored", () => {
    const state: PortfolioState = {
      holdings: new Map([["A", { fund_code: "A", units: 10, weight_at_rebalance: 1.0 }]]),
      cash: 0,
    };
    expect(valuePortfolio(state, new Map())).toBe(0);
  });
});

describe("rebalance", () => {
  it("Boş portfolio → cash'i yeni Top N'e böler", () => {
    const empty: PortfolioState = { holdings: new Map(), cash: 100 };
    const newState = rebalance(empty, ["A", "B"], [0.6, 0.4], new Map([["A", 1.0], ["B", 2.0]]));
    expect(newState.holdings.get("A")?.units).toBeCloseTo(60, 5); // 100*0.6 / 1.0
    expect(newState.holdings.get("B")?.units).toBeCloseTo(20, 5); // 100*0.4 / 2.0
  });

  it("Mevcut pozisyonlar satılır + yeni Top N alınır", () => {
    const old: PortfolioState = {
      holdings: new Map([["X", { fund_code: "X", units: 100, weight_at_rebalance: 1.0 }]]),
      cash: 0,
    };
    // X NAV 1.5 → 100 × 1.5 = 150 cash
    const newState = rebalance(old, ["A", "B"], [0.5, 0.5], new Map([["X", 1.5], ["A", 1.0], ["B", 3.0]]));
    expect(newState.holdings.get("A")?.units).toBeCloseTo(75, 5); // 150*0.5 / 1.0
    expect(newState.holdings.get("B")?.units).toBeCloseTo(25, 5); // 150*0.5 / 3.0
  });
});

describe("computeTurnover", () => {
  it("Aynı portföy → 0", () => {
    const prev = new Map([["A", 0.5], ["B", 0.5]]);
    const curr = new Map([["A", 0.5], ["B", 0.5]]);
    expect(computeTurnover(prev, curr)).toBe(0);
  });

  it("Tamamen değişen portföy → 1", () => {
    const prev = new Map([["A", 1.0]]);
    const curr = new Map([["B", 1.0]]);
    expect(computeTurnover(prev, curr)).toBe(1);
  });

  it("Yarı değişim → 0.5", () => {
    const prev = new Map([["A", 0.5], ["B", 0.5]]);
    const curr = new Map([["A", 0.5], ["C", 0.5]]);
    expect(computeTurnover(prev, curr)).toBe(0.5);
  });
});

describe("computeOverlap (Jaccard)", () => {
  it("Tamamen aynı → 1", () => {
    expect(computeOverlap(["A", "B", "C"], ["A", "B", "C"])).toBe(1);
  });

  it("Hiç ortak yok → 0", () => {
    expect(computeOverlap(["A", "B"], ["C", "D"])).toBe(0);
  });

  it("Yarısı ortak (örnek A∩B=2, A∪B=4) → 0.5", () => {
    expect(computeOverlap(["A", "B", "C", "D"], ["C", "D", "E", "F"])).toBe(2 / 6);
  });

  it("İkisi de boş → null", () => {
    expect(computeOverlap([], [])).toBeNull();
  });
});

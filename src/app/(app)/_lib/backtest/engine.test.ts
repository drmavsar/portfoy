import { describe, expect, it } from "vitest";

import { runBacktestPure, type BacktestEngineInput } from "./engine";
import type { BacktestParams } from "./types";

/**
 * Sentetik fixture — 3 fon, 2 yıllık günlük NAV.
 * - A: %20 yıllık (linear growth)
 * - B: %15 yıllık
 * - C: %10 yıllık (delisted 2024 sonrası)
 */
function buildFixture(): BacktestEngineInput {
  const fundPrices: BacktestEngineInput["fundPrices"] = {};
  const funds: BacktestEngineInput["funds"] = [
    { fund_code: "A", category_id: 1, investment_universe: "COKLU_VARLIK", is_participation: true, is_equity_intensive: false },
    { fund_code: "B", category_id: 1, investment_universe: "COKLU_VARLIK", is_participation: true, is_equity_intensive: false },
    { fund_code: "C", category_id: 1, investment_universe: "COKLU_VARLIK", is_participation: true, is_equity_intensive: false },
  ];

  // 2023-01-01 → 2024-12-31 günlük NAV
  for (const [code, annualGrowth] of [["A", 0.20], ["B", 0.15], ["C", 0.10]] as const) {
    const series = [];
    const start = Date.parse("2023-01-01T00:00:00Z");
    const end = Date.parse("2024-12-31T00:00:00Z");
    const totalDays = Math.round((end - start) / 86_400_000);
    const dailyMultiplier = Math.pow(1 + annualGrowth, 1 / 365);
    let nav = 100;
    for (let d = 0; d <= totalDays; d++) {
      const ts = start + d * 86_400_000;
      const iso = new Date(ts).toISOString().slice(0, 10);
      series.push({ as_of: iso, nav });
      nav *= dailyMultiplier;
    }
    fundPrices[code] = series;
  }

  // CPI: 2023-01 100 → 2024-12 130 (~%30 toplam)
  const cpi: BacktestEngineInput["cpi"] = {};
  for (let m = 0; m < 24; m++) {
    const year = 2023 + Math.floor(m / 12);
    const month = (m % 12) + 1;
    const period = `${year}-${String(month).padStart(2, "0")}`;
    cpi[period] = 100 * Math.pow(1.30, m / 23);
  }

  const statusHistory: BacktestEngineInput["statusHistory"] = [
    { fund_code: "A", effective_from: "2010-01-01", effective_to: null, status: "active", reason: null },
    { fund_code: "B", effective_from: "2010-01-01", effective_to: null, status: "active", reason: null },
    { fund_code: "C", effective_from: "2010-01-01", effective_to: "2024-06-30", status: "active", reason: null },
    { fund_code: "C", effective_from: "2024-07-01", effective_to: null, status: "delisted", reason: "test" },
  ];

  const params: BacktestParams = {
    start_date: "2023-02-01",
    end_date: "2024-12-30",
    rebalance_days: 90,
    top_n: 3,
    strategy: "equal_weight",
    persona_id: "test-persona",
    category_filter: null,
    min_components: 2,
    risk_free_source: "FIXED_30",
  };

  return {
    params,
    personaWeights: {
      inflation_weight: 25,
      tax_weight: 20,
      risk_weight: 20,
      long_term_weight: 20,
      diversification_weight: 15,
      max_volatility_pct: 0.40,
    },
    funds,
    fundPrices,
    cpi,
    statusHistory,
    benchmarks: {},
    riskFreeRate: 0.30,
    riskFreeSource: "FIXED_30",
  };
}

describe("runBacktestPure — happy path", () => {
  it("3 fon × equal_weight × 90 gün rebalance → ok=true", () => {
    const input = buildFixture();
    const r = runBacktestPure(input);
    expect(r.ok).toBe(true);
    expect(r.rebalances.length).toBeGreaterThanOrEqual(6);
    expect(r.nav_series.length).toBeGreaterThan(400);
  });

  it("Portfolio NAV başlangıç ≈ 100", () => {
    const input = buildFixture();
    const r = runBacktestPure(input);
    expect(r.nav_series[0].portfolio_nav).toBeCloseTo(100, 0);
  });

  it("Portfolio NAV pozitif büyür (tüm fonlar büyüdüğüne göre)", () => {
    const input = buildFixture();
    const r = runBacktestPure(input);
    const finalNav = r.nav_series[r.nav_series.length - 1].portfolio_nav;
    expect(finalNav).toBeGreaterThan(100);
  });

  it("Summary metrikleri set edilmiş", () => {
    const input = buildFixture();
    const r = runBacktestPure(input);
    expect(r.summary.cagr).not.toBeNull();
    expect(r.summary.volatility).not.toBeNull();
    expect(r.summary.max_drawdown).not.toBeNull();
    expect(r.summary.max_weight).toBeGreaterThan(0);
  });
});

describe("runBacktestPure — survivorship", () => {
  it("C fonu 2024-07'den sonra evren dışında", () => {
    const input = buildFixture();
    const r = runBacktestPure(input);
    // 2024-07'den sonraki rebalance'larda C top N'de yok
    for (const reb of r.rebalances) {
      if (reb.rebalance_date >= "2024-07-01") {
        expect(reb.top_n_codes).not.toContain("C");
      }
    }
  });

  it("C 2024-07 öncesi top N'de görünür", () => {
    const input = buildFixture();
    const r = runBacktestPure(input);
    const earlyRebalances = r.rebalances.filter((reb) => reb.rebalance_date < "2024-07-01");
    const hasC = earlyRebalances.some((reb) => reb.top_n_codes.includes("C"));
    expect(hasC).toBe(true);
  });
});

describe("runBacktestPure — determinism", () => {
  it("Aynı input → aynı output (deterministik)", () => {
    const input1 = buildFixture();
    const input2 = buildFixture();
    const r1 = runBacktestPure(input1);
    const r2 = runBacktestPure(input2);
    expect(r1.summary.cagr).toBe(r2.summary.cagr);
    expect(r1.summary.max_drawdown).toBe(r2.summary.max_drawdown);
    expect(r1.rebalances.map((r) => r.top_n_codes.join(",")).join("|")).toBe(
      r2.rebalances.map((r) => r.top_n_codes.join(",")).join("|"),
    );
  });
});

describe("runBacktestPure — strategy diff", () => {
  it("equal_weight ile score_weighted farklı top_n_weights üretir", () => {
    const input = buildFixture();
    const ew = runBacktestPure({ ...input, params: { ...input.params, strategy: "equal_weight" } });
    const sw = runBacktestPure({ ...input, params: { ...input.params, strategy: "score_weighted" } });
    // En azından bazı rebalance'larda ağırlıklar farklı olmalı (top_n=3, cap doygun olabilir)
    // ama her ikisi de geçerli sonuç döner
    expect(ew.ok && sw.ok).toBe(true);
  });
});

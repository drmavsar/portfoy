import { describe, expect, it } from "vitest";

import {
  ALLOCATION_DEFAULTS,
  type AllocationCurrentPosition,
  type AllocationTargetFund,
  type SellDryRunResult,
} from "./allocation-types";
import {
  buildAllocationDiff,
  buildAllocationSummary,
  buildCurrentPositions,
  checkForbiddenWords,
  computeTargetWeights,
  selectTopN,
  type RawHolding,
  type ScoreCandidate,
} from "./allocation-engine";

// ──────────────────────────────────────────────────────────────────────────
// selectTopN
// ──────────────────────────────────────────────────────────────────────────

const score = (overrides: Partial<ScoreCandidate>): ScoreCandidate => ({
  fund_code: overrides.fund_code ?? "AAA",
  // Explicit `in` so `null` override is preserved (not replaced by default).
  mehmet_score: "mehmet_score" in overrides ? overrides.mehmet_score ?? null : 70,
  components_used:
    "components_used" in overrides ? overrides.components_used ?? null : 5,
});

describe("selectTopN", () => {
  it("Skor DESC, components >= 3, top N adet", () => {
    const r = selectTopN(
      [
        score({ fund_code: "A", mehmet_score: 50 }),
        score({ fund_code: "B", mehmet_score: 90 }),
        score({ fund_code: "C", mehmet_score: 70 }),
        score({ fund_code: "D", mehmet_score: 80 }),
      ],
      2,
    );
    expect(r.map((x) => x.fund_code)).toEqual(["B", "D"]);
  });

  it("mehmet_score null → süzülür", () => {
    const r = selectTopN(
      [
        score({ fund_code: "A", mehmet_score: null }),
        score({ fund_code: "B", mehmet_score: 60 }),
      ],
      5,
    );
    expect(r.map((x) => x.fund_code)).toEqual(["B"]);
  });

  it("components_used < 3 → süzülür", () => {
    const r = selectTopN(
      [
        score({ fund_code: "A", mehmet_score: 95, components_used: 2 }),
        score({ fund_code: "B", mehmet_score: 60, components_used: 5 }),
      ],
      5,
    );
    expect(r.map((x) => x.fund_code)).toEqual(["B"]);
  });

  it("Eşit skor → fund_code ASC tie-break (deterministic)", () => {
    const r = selectTopN(
      [
        score({ fund_code: "ZZZ", mehmet_score: 80 }),
        score({ fund_code: "AAA", mehmet_score: 80 }),
        score({ fund_code: "MMM", mehmet_score: 80 }),
      ],
      5,
    );
    expect(r.map((x) => x.fund_code)).toEqual(["AAA", "MMM", "ZZZ"]);
  });

  it("Default TOP_N=10, MIN_COMPONENTS=3", () => {
    const candidates = Array.from({ length: 15 }, (_, i) =>
      score({ fund_code: `F${String(i).padStart(2, "0")}`, mehmet_score: 100 - i }),
    );
    const r = selectTopN(candidates);
    expect(r).toHaveLength(10);
    expect(r[0].fund_code).toBe("F00");
  });
});

// ──────────────────────────────────────────────────────────────────────────
// computeTargetWeights
// ──────────────────────────────────────────────────────────────────────────

describe("computeTargetWeights", () => {
  it("Equal weight: 1/N", () => {
    const w = computeTargetWeights([
      score({ fund_code: "A" }),
      score({ fund_code: "B" }),
      score({ fund_code: "C" }),
      score({ fund_code: "D" }),
    ]);
    expect(w.size).toBe(4);
    for (const v of w.values()) expect(v).toBeCloseTo(0.25);
  });

  it("Boş input → boş Map", () => {
    expect(computeTargetWeights([]).size).toBe(0);
  });
});

// ──────────────────────────────────────────────────────────────────────────
// buildCurrentPositions
// ──────────────────────────────────────────────────────────────────────────

const holding = (overrides: Partial<RawHolding>): RawHolding => ({
  asset_id: overrides.asset_id ?? "asset-1",
  asset_class: overrides.asset_class ?? "fund",
  symbol: overrides.symbol ?? "AAA",
  fund_code: overrides.fund_code ?? "AAA",
  fund_name: overrides.fund_name ?? "AAA Fund",
  quantity: overrides.quantity ?? 100,
  wac_try: overrides.wac_try ?? 10,
  cost_basis_try: overrides.cost_basis_try ?? 1000,
  // Explicit `in` so `null` override is preserved.
  last_price_try:
    "last_price_try" in overrides ? overrides.last_price_try ?? null : 12,
});

describe("buildCurrentPositions", () => {
  it("Market value = qty * last_price; weight = mv / total", () => {
    const { positions, totalMarketValueTry } = buildCurrentPositions([
      holding({ fund_code: "A", quantity: 100, last_price_try: 10 }), // 1000
      holding({ fund_code: "B", quantity: 50, last_price_try: 20 }),   // 1000
    ]);
    expect(totalMarketValueTry).toBe(2000);
    expect(positions[0].market_value_try).toBe(1000);
    expect(positions[0].weight_pct).toBe(0.5);
    expect(positions[1].weight_pct).toBe(0.5);
  });

  it("last_price null → WAC fallback", () => {
    const { positions } = buildCurrentPositions([
      holding({ fund_code: "A", quantity: 100, wac_try: 8, last_price_try: null }),
    ]);
    expect(positions[0].market_value_try).toBe(800);
  });

  it("Empty holdings → zero total, no positions", () => {
    const { positions, totalMarketValueTry } = buildCurrentPositions([]);
    expect(positions).toHaveLength(0);
    expect(totalMarketValueTry).toBe(0);
  });
});

// ──────────────────────────────────────────────────────────────────────────
// buildAllocationDiff
// ──────────────────────────────────────────────────────────────────────────

const targetFund = (code: string, weight = 0.1): AllocationTargetFund => ({
  fund_code: code,
  fund_name: `${code} Fund`,
  category_name: null,
  mehmet_score: 80,
  components_used: 5,
  target_weight_pct: weight,
  komite: null,
});

const currentPos = (
  fund_code: string,
  weight: number,
  mv: number,
): AllocationCurrentPosition => ({
  asset_id: `asset-${fund_code}`,
  asset_class: "fund",
  symbol: fund_code,
  fund_code,
  fund_name: `${fund_code} Fund`,
  quantity: 100,
  wac_try: mv / 100,
  cost_basis_try: mv,
  last_price_try: mv / 100,
  market_value_try: mv,
  weight_pct: weight,
});

describe("buildAllocationDiff", () => {
  it("Empty portfolio → her target EKLEME, current=0", () => {
    const diffs = buildAllocationDiff({
      targets: [targetFund("A", 0.5), targetFund("B", 0.5)],
      current: [],
      totalMarketValueTry: 0,
    });
    expect(diffs).toHaveLength(2);
    expect(diffs.every((d) => d.action === "EKLEME")).toBe(true);
    expect(diffs.every((d) => d.current_weight_pct === 0)).toBe(true);
  });

  it("Tam dengeli portföy → tüm TUT (band içinde)", () => {
    const diffs = buildAllocationDiff({
      targets: [targetFund("A", 0.5), targetFund("B", 0.5)],
      current: [currentPos("A", 0.5, 50000), currentPos("B", 0.5, 50000)],
      totalMarketValueTry: 100000,
    });
    expect(diffs.every((d) => d.action === "TUT")).toBe(true);
  });

  it("Underweight fund → EKLEME (delta_try negatif)", () => {
    const diffs = buildAllocationDiff({
      targets: [targetFund("A", 0.5)],
      current: [currentPos("A", 0.2, 20000)],
      totalMarketValueTry: 100000,
    });
    expect(diffs[0].action).toBe("EKLEME");
    expect(diffs[0].delta_pct).toBeCloseTo(-0.3);
    expect(diffs[0].delta_try).toBeCloseTo(-30000);
  });

  it("Overweight fund → AZALTMA (delta_try pozitif)", () => {
    const diffs = buildAllocationDiff({
      targets: [targetFund("A", 0.3)],
      current: [currentPos("A", 0.6, 60000)],
      totalMarketValueTry: 100000,
    });
    expect(diffs[0].action).toBe("AZALTMA");
    expect(diffs[0].delta_pct).toBeCloseTo(0.3);
    expect(diffs[0].delta_try).toBeCloseTo(30000);
  });

  it("Band içinde küçük delta (4%) → TUT (default band 5%)", () => {
    const diffs = buildAllocationDiff({
      targets: [targetFund("A", 0.5)],
      current: [currentPos("A", 0.54, 54000)],
      totalMarketValueTry: 100000,
    });
    expect(diffs[0].action).toBe("TUT");
  });

  it("Custom band: 3% — 4% delta artık AZALTMA", () => {
    const diffs = buildAllocationDiff({
      targets: [targetFund("A", 0.5)],
      current: [currentPos("A", 0.54, 54000)],
      totalMarketValueTry: 100000,
      rebalanceBandPct: 0.03,
    });
    expect(diffs[0].action).toBe("AZALTMA");
  });

  it("Target dışı fund (portföyde var, target'da yok) → AZALTMA", () => {
    const diffs = buildAllocationDiff({
      targets: [targetFund("A", 1.0)],
      current: [currentPos("A", 0.6, 60000), currentPos("Z", 0.4, 40000)],
      totalMarketValueTry: 100000,
    });
    const zDiff = diffs.find((d) => d.fund_code === "Z");
    expect(zDiff).toBeDefined();
    expect(zDiff!.in_target).toBe(false);
    expect(zDiff!.in_portfolio).toBe(true);
    expect(zDiff!.action).toBe("AZALTMA");
    expect(zDiff!.target_weight_pct).toBe(0);
    expect(zDiff!.delta_try).toBe(40000);
  });

  it("Determinism: aynı input → aynı output", () => {
    const args = {
      targets: [targetFund("A", 0.5), targetFund("B", 0.5)],
      current: [currentPos("A", 0.6, 60000), currentPos("B", 0.4, 40000)],
      totalMarketValueTry: 100000,
    };
    const r1 = buildAllocationDiff(args);
    const r2 = buildAllocationDiff(args);
    expect(r1).toEqual(r2);
  });
});

// ──────────────────────────────────────────────────────────────────────────
// buildAllocationSummary
// ──────────────────────────────────────────────────────────────────────────

const dryRun = (overrides: Partial<SellDryRunResult>): SellDryRunResult => ({
  fund_code: overrides.fund_code ?? "X",
  sell_quantity: overrides.sell_quantity ?? 10,
  estimated_cost_basis_try: overrides.estimated_cost_basis_try ?? 100,
  estimated_proceeds_try: overrides.estimated_proceeds_try ?? 150,
  estimated_realized_pnl_try: overrides.estimated_realized_pnl_try ?? 50,
  estimated_withholding_try: overrides.estimated_withholding_try ?? 0,
  estimated_net_proceeds_try: overrides.estimated_net_proceeds_try ?? 150,
  applied_tax_kind: overrides.applied_tax_kind ?? "HSYF_0_STOPAJ",
  applied_tax_rate: overrides.applied_tax_rate ?? 0,
  tax_confidence: overrides.tax_confidence ?? "HIGH",
  lots_consumed: overrides.lots_consumed ?? 1,
});

describe("buildAllocationSummary", () => {
  it("Net cash need = total_buy - estimated_net_proceeds", () => {
    const summary = buildAllocationSummary({
      diffs: [
        // EKLEME 10000, AZALTMA 5000
        {
          fund_code: "A",
          fund_name: null,
          in_target: true,
          in_portfolio: true,
          current_weight_pct: 0.3,
          target_weight_pct: 0.4,
          delta_pct: -0.1,
          action: "EKLEME",
          delta_try: -10000,
        },
        {
          fund_code: "B",
          fund_name: null,
          in_target: true,
          in_portfolio: true,
          current_weight_pct: 0.5,
          target_weight_pct: 0.4,
          delta_pct: 0.1,
          action: "AZALTMA",
          delta_try: 5000,
        },
      ],
      sellDryRuns: [
        dryRun({
          estimated_proceeds_try: 5000,
          estimated_realized_pnl_try: 800,
          estimated_withholding_try: 140,
          estimated_net_proceeds_try: 4860,
        }),
      ],
      totalMarketValueTry: 100000,
      topN: ALLOCATION_DEFAULTS.TOP_N,
      rebalanceBandPct: ALLOCATION_DEFAULTS.REBALANCE_BAND_PCT,
    });
    expect(summary.total_buy_try).toBe(10000);
    expect(summary.total_sell_try).toBe(5000);
    expect(summary.estimated_net_proceeds_try).toBe(4860);
    expect(summary.net_cash_need_try).toBe(10000 - 4860);
    expect(summary.total_realized_pnl_try).toBe(800);
    expect(summary.total_tax_try).toBe(140);
    expect(summary.total_net_pnl_try).toBe(660);
  });

  it("No diffs / no sells → all zero", () => {
    const summary = buildAllocationSummary({
      diffs: [],
      sellDryRuns: [],
      totalMarketValueTry: 50000,
      topN: 10,
      rebalanceBandPct: 0.05,
    });
    expect(summary.total_buy_try).toBe(0);
    expect(summary.total_sell_try).toBe(0);
    expect(summary.net_cash_need_try).toBe(0);
  });
});

// ──────────────────────────────────────────────────────────────────────────
// checkForbiddenWords
// ──────────────────────────────────────────────────────────────────────────

describe("checkForbiddenWords", () => {
  it("Temiz string'ler → true", () => {
    expect(
      checkForbiddenWords([
        "Enflasyon koruması yüksek",
        "Kategori medyanı üstünde",
        "EKLEME önerisi",
        "AZALTMA önerisi",
        null,
      ]),
    ).toBe(true);
  });

  it("Yasaklı tek kelime (al) → false", () => {
    expect(checkForbiddenWords(["Hemen al", "OK"])).toBe(false);
  });

  it("Türkçe çekim 'alış' false alarm vermez", () => {
    expect(checkForbiddenWords(["Alış kaydı"])).toBe(true);
    expect(checkForbiddenWords(["Satış kaydı"])).toBe(true);
  });

  it("'tavsiye' yakalanır", () => {
    expect(checkForbiddenWords(["yatırım tavsiyesi"])).toBe(false);
    expect(checkForbiddenWords(["bu bir tavsiye değildir"])).toBe(false);
  });

  it("Empty input → true", () => {
    expect(checkForbiddenWords([])).toBe(true);
    expect(checkForbiddenWords([null, undefined, ""])).toBe(true);
  });
});

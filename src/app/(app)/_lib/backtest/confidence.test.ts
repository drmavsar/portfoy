import { describe, expect, it } from "vitest";

import {
  bestStrategyAlpha,
  computeConfidence,
  configuredStrategyAlpha,
  evaluateSprint6,
  type ScenarioBenchmarkAlphas,
} from "./confidence";

describe("bestStrategyAlpha", () => {
  it("İki strateji mevcut → max", () => {
    expect(
      bestStrategyAlpha(
        { alpha_cagr: 0.05, win_ratio: null, benchmark_cagr: null },
        { alpha_cagr: 0.08, win_ratio: null, benchmark_cagr: null },
      ),
    ).toBe(0.08);
  });

  it("Bir strateji null → diğeri döner", () => {
    expect(
      bestStrategyAlpha({ alpha_cagr: 0.05, win_ratio: null, benchmark_cagr: null }, null),
    ).toBe(0.05);
  });

  it("Her ikisi null → null", () => {
    expect(bestStrategyAlpha(null, null)).toBeNull();
  });
});

describe("computeConfidence", () => {
  it("4 senaryoda 4 win → confidence 100", () => {
    const input: ScenarioBenchmarkAlphas[] = [
      { benchmark: "XU100", alphas: [0.05, 0.08, 0.03, 0.10] },
    ];
    const r = computeConfidence(input);
    expect(r.per_benchmark[0].confidence).toBe(100);
    expect(r.per_benchmark[0].wins).toBe(4);
  });

  it("4 senaryoda 3 win → confidence 75", () => {
    const input: ScenarioBenchmarkAlphas[] = [
      { benchmark: "XU100", alphas: [0.05, -0.02, 0.03, 0.10] },
    ];
    const r = computeConfidence(input);
    expect(r.per_benchmark[0].confidence).toBe(75);
  });

  it("Median alpha hesabı", () => {
    const input: ScenarioBenchmarkAlphas[] = [
      { benchmark: "KAT_FON_SEPETI", alphas: [0.03, 0.05, 0.08, 0.10] },
    ];
    const r = computeConfidence(input);
    expect(r.per_benchmark[0].alpha.median_alpha).toBeCloseTo(0.065, 3);
    expect(r.per_benchmark[0].alpha.mean_alpha).toBeCloseTo(0.065, 3);
  });

  it("Overall confidence = mean of per-benchmark confidences", () => {
    const input: ScenarioBenchmarkAlphas[] = [
      { benchmark: "XU100", alphas: [0.05, 0.05, 0.05, 0.05] },     // 100
      { benchmark: "CPI_TR", alphas: [0.05, 0.05, -0.05, -0.05] },  // 50
    ];
    const r = computeConfidence(input);
    expect(r.overall_confidence).toBe(75);
  });

  it("Boş alphas → confidence 0", () => {
    const r = computeConfidence([{ benchmark: "X", alphas: [] }]);
    expect(r.per_benchmark[0].confidence).toBe(0);
    expect(r.per_benchmark[0].alpha.median_alpha).toBeNull();
  });
});

describe("evaluateSprint6", () => {
  function mkInput(
    katAlphas: number[],
    xuAlphas: number[],
    cpiAlphas: number[],
  ): ScenarioBenchmarkAlphas[] {
    return [
      { benchmark: "KAT_FON_SEPETI", alphas: katAlphas },
      { benchmark: "XU100", alphas: xuAlphas },
      { benchmark: "CPI_TR", alphas: cpiAlphas },
    ];
  }

  it("Tüm koşullar sağlanırsa → ok=true", () => {
    const conf = computeConfidence(
      mkInput([0.05, 0.05, 0.05, 0.05], [0.01, 0.01, 0.01, 0.01], [0.02, 0.02, 0.02, 0.02]),
    );
    const r = evaluateSprint6(conf);
    expect(r.ok).toBe(true);
    expect(r.failures).toEqual([]);
  });

  it("KAT confidence yeterli ama median <3% → fail", () => {
    const conf = computeConfidence(
      mkInput([0.01, 0.01, 0.02, 0.02], [0.01, 0.01, 0.01, 0.01], [0.01, 0.01, 0.01, 0.01]),
    );
    const r = evaluateSprint6(conf);
    expect(r.ok).toBe(false);
    expect(r.failures.some((f) => f.includes("KAT_FON_SEPETI median"))).toBe(true);
  });

  it("XU100 confidence <75 → fail", () => {
    const conf = computeConfidence(
      mkInput([0.05, 0.05, 0.05, 0.05], [0.01, -0.01, -0.01, -0.01], [0.01, 0.01, 0.01, 0.01]),
    );
    const r = evaluateSprint6(conf);
    expect(r.ok).toBe(false);
    expect(r.failures.some((f) => f.includes("XU100"))).toBe(true);
  });

  it("CPI confidence <75 → fail", () => {
    const conf = computeConfidence(
      mkInput([0.05, 0.05, 0.05, 0.05], [0.01, 0.01, 0.01, 0.01], [0.01, -0.01, -0.01, -0.01]),
    );
    const r = evaluateSprint6(conf);
    expect(r.ok).toBe(false);
    expect(r.failures.some((f) => f.includes("CPI_TR"))).toBe(true);
  });

  it("3 farklı failure birikir", () => {
    const conf = computeConfidence(
      mkInput([0.01, 0.01, -0.01, -0.01], [0.01, -0.01, -0.01, -0.01], [0.01, -0.01, -0.01, -0.01]),
    );
    const r = evaluateSprint6(conf);
    expect(r.failures.length).toBeGreaterThanOrEqual(3);
  });
});

describe("configuredStrategyAlpha (GO/NO-GO seçim yanlılığı)", () => {
  const vs = (a: number) => ({ alpha_cagr: a, win_ratio: null, benchmark_cagr: null });
  const ew = [0.02, -0.01, 0.04, -0.03];
  const sw = [-0.01, 0.02, 0.01, 0.01];

  it("yalnız yapılandırılmış stratejinin alfasını döner", () => {
    expect(configuredStrategyAlpha("equal_weight", vs(0.02), vs(0.05))).toBe(0.02);
    expect(configuredStrategyAlpha("score_weighted", vs(0.02), vs(0.05))).toBe(0.05);
    expect(configuredStrategyAlpha("equal_weight", null, vs(0.05))).toBeNull();
  });

  it("senaryo başına 'en iyisi' güveni şişiriyordu; EW tek başına daha düşük", () => {
    const best: ScenarioBenchmarkAlphas[] = [
      { benchmark: "KAT_FON_SEPETI", alphas: ew.map((a, i) => bestStrategyAlpha(vs(a), vs(sw[i]))!) },
    ];
    const ewOnly: ScenarioBenchmarkAlphas[] = [
      { benchmark: "KAT_FON_SEPETI", alphas: ew.map((a, i) => configuredStrategyAlpha("equal_weight", vs(a), vs(sw[i]))!) },
    ];
    const cBest = computeConfidence(best).per_benchmark[0].confidence;
    const cEw = computeConfidence(ewOnly).per_benchmark[0].confidence;
    expect(cBest).toBe(100);
    expect(cEw).toBe(50);
  });
});

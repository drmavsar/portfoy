import { describe, expect, it } from "vitest";

import { MAX_WEIGHT_CAP, applyCap, buildWeights } from "./strategies";

describe("applyCap", () => {
  it("Hiçbir ağırlık cap'i aşmıyorsa olduğu gibi (normalized) döner", () => {
    // N=10 → N×cap=2.0, çok yer var; girdi düşük → cap etki etmez
    const w = applyCap(
      [0.05, 0.10, 0.08, 0.12, 0.15, 0.10, 0.10, 0.10, 0.10, 0.10],
      0.20,
    );
    expect(w.reduce((a, b) => a + b, 0)).toBeCloseTo(1.0, 5);
    expect(Math.max(...w)).toBeLessThanOrEqual(0.20 + 1e-6);
  });

  it("Tek ağırlık cap'i aşıyor → cap'lenir, fazlası diğerlerine dağıtılır", () => {
    // N=10, biri 0.50, fazla diğerlerine dağılır
    const w = applyCap(
      [0.50, 0.10, 0.05, 0.05, 0.05, 0.05, 0.05, 0.05, 0.05, 0.05],
      0.20,
    );
    expect(Math.max(...w)).toBeCloseTo(0.20, 5);
    expect(w.reduce((a, b) => a + b, 0)).toBeCloseTo(1.0, 5);
  });

  it("TopN=5 + cap=0.20 → equal_weight'e doygun çöker", () => {
    const w = applyCap([0.30, 0.25, 0.20, 0.15, 0.10], 0.20);
    expect(w).toHaveLength(5);
    expect(w.every((x) => Math.abs(x - 0.20) < 1e-6)).toBe(true);
  });

  it("Çoklu iterasyon yakınsar (N≥5+cap=0.20, kapasite var)", () => {
    const w = applyCap([0.80, 0.10, 0.05, 0.03, 0.02, 0.0, 0.0, 0.0, 0.0, 0.0], 0.20);
    expect(Math.max(...w)).toBeCloseTo(0.20, 5);
    expect(w.reduce((a, b) => a + b, 0)).toBeCloseTo(1.0, 5);
  });

  it("Toplam 0 girdi → equal weight fallback", () => {
    const w = applyCap([0, 0, 0, 0], 0.20);
    expect(w).toEqual([0.25, 0.25, 0.25, 0.25]);
  });

  it("Cap 1'den büyük veya ≤0 → no-op", () => {
    expect(applyCap([0.5, 0.5], 0)).toEqual([0.5, 0.5]);
    expect(applyCap([0.5, 0.5], 2)).toEqual([0.5, 0.5]);
  });

  it("Boş dizi → []", () => {
    expect(applyCap([], 0.20)).toEqual([]);
  });
});

describe("buildWeights", () => {
  const topN = [
    { score: 73 }, { score: 72 }, { score: 71 }, { score: 70 }, { score: 65 },
    { score: 64 }, { score: 63 }, { score: 62 }, { score: 60 }, { score: 58 },
  ];

  it("equal_weight: 1/N", () => {
    const w = buildWeights(topN, "equal_weight");
    expect(w).toHaveLength(10);
    expect(w.every((x) => Math.abs(x - 0.1) < 1e-9)).toBe(true);
  });

  it("score_weighted (cap=0.20): toplam 1, max ≤ 0.20", () => {
    const w = buildWeights(topN, "score_weighted");
    expect(w.reduce((a, b) => a + b, 0)).toBeCloseTo(1.0, 5);
    expect(Math.max(...w)).toBeLessThanOrEqual(MAX_WEIGHT_CAP + 1e-9);
  });

  it("score_weighted: TopN=5 → equal_weight'e çöker", () => {
    const small = [{ score: 80 }, { score: 75 }, { score: 70 }, { score: 65 }, { score: 60 }];
    const w = buildWeights(small, "score_weighted");
    expect(w.every((x) => Math.abs(x - 0.20) < 1e-6)).toBe(true);
  });

  it("Null skorları 0 sayar; hepsi null/0 → equal_weight fallback", () => {
    const allNull = [{ score: null }, { score: null }, { score: null }];
    const w = buildWeights(allNull, "score_weighted");
    expect(w.every((x) => Math.abs(x - 1 / 3) < 1e-9)).toBe(true);
  });

  it("score_weighted lider skor ağırlığı equal'dan büyük (yeterli universe)", () => {
    const w = buildWeights(topN, "score_weighted");
    const eqW = buildWeights(topN, "equal_weight");
    // En yüksek skorlu fonun ağırlığı equal'dan büyük olmalı (cap doygun değilse)
    expect(w[0]).toBeGreaterThan(eqW[0] - 1e-9);
  });

  it("Boş Top N → []", () => {
    expect(buildWeights([], "equal_weight")).toEqual([]);
    expect(buildWeights([], "score_weighted")).toEqual([]);
  });
});

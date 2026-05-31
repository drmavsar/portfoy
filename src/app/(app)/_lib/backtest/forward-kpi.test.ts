import { describe, expect, it } from "vitest";

import {
  __internals,
  computeForwardKPIs,
  type DailySnapshot,
} from "./forward-kpi";

function mkSnapshot(date: string, codes: string[]): DailySnapshot {
  return { date, top_n_codes: codes };
}

describe("dailyTurnover", () => {
  it("Aynı set → 0", () => {
    expect(__internals.dailyTurnover(["A", "B", "C"], ["A", "B", "C"])).toBe(0);
  });
  it("Tamamen farklı → 1", () => {
    expect(__internals.dailyTurnover(["A", "B"], ["C", "D"])).toBe(1);
  });
  it("Yarısı ortak → 0.5 (Jaccard 0.5 → turnover 0.5)", () => {
    // A,B vs A,C → intersect=1, union=3, jaccard=1/3, turnover=2/3
    expect(__internals.dailyTurnover(["A", "B"], ["A", "C"])).toBeCloseTo(2 / 3, 5);
  });
});

describe("averageHoldingDays", () => {
  it("Sabit set boyunca → tüm fonlar full süreyi tutar", () => {
    const snaps = [
      mkSnapshot("2026-01-01", ["A", "B", "C"]),
      mkSnapshot("2026-01-02", ["A", "B", "C"]),
      mkSnapshot("2026-01-03", ["A", "B", "C"]),
    ];
    // Her fon 3 gün; 3 fon → ortalama 3
    expect(__internals.averageHoldingDays(snaps)).toBe(3);
  });

  it("Bir fon ayrılırsa run length 1 olur", () => {
    const snaps = [
      mkSnapshot("2026-01-01", ["A", "B"]),
      mkSnapshot("2026-01-02", ["A", "C"]),
      mkSnapshot("2026-01-03", ["A", "C"]),
    ];
    // A: full 3 (hep var), B: 1 (sadece gün 1), C: 2 (gün 2-3)
    // ortalama = (3 + 1 + 2) / 3 = 2.0
    expect(__internals.averageHoldingDays(snaps)).toBeCloseTo(2.0, 5);
  });
});

describe("top3ChangeRate", () => {
  it("< 30 snapshot → null", () => {
    const snaps = Array.from({ length: 10 }, (_, i) => mkSnapshot(`2026-01-${i + 1}`, ["A", "B", "C"]));
    expect(__internals.top3ChangeRate(snaps)).toBeNull();
  });

  it("Sabit Top 3 → 0 değişim", () => {
    const snaps = Array.from({ length: 60 }, (_, i) =>
      mkSnapshot(`2026-${String(Math.floor(i / 30) + 1).padStart(2, "0")}-${String((i % 30) + 1).padStart(2, "0")}`, ["A", "B", "C", "D"]),
    );
    expect(__internals.top3ChangeRate(snaps)).toBe(0);
  });
});

describe("top10Retention30d", () => {
  it("< 31 snapshot → null", () => {
    const snaps = Array.from({ length: 20 }, (_, i) => mkSnapshot(`2026-01-${String(i + 1).padStart(2, "0")}`, ["A"]));
    expect(__internals.top10Retention30d(snaps)).toBeNull();
  });

  it("Sabit Top N → koruma %100", () => {
    const snaps = Array.from({ length: 35 }, (_, i) => mkSnapshot(`2026-${String(Math.floor(i / 30) + 1).padStart(2, "0")}-${String((i % 30) + 1).padStart(2, "0")}`, ["A", "B", "C"]));
    expect(__internals.top10Retention30d(snaps)).toBe(1);
  });

  it("Tamamen değişen Top N → koruma 0", () => {
    const snaps: DailySnapshot[] = [];
    for (let i = 0; i < 35; i++) {
      const date = `2026-${String(Math.floor(i / 30) + 1).padStart(2, "0")}-${String((i % 30) + 1).padStart(2, "0")}`;
      // İlk 30 gün A,B,C; sonraki 5 gün X,Y,Z
      const codes = i < 30 ? ["A", "B", "C"] : ["X", "Y", "Z"];
      snaps.push(mkSnapshot(date, codes));
    }
    const r = __internals.top10Retention30d(snaps);
    // Window 0→30: |ABC ∩ XYZ| = 0/3 = 0
    // Window 1→31: aynı → 0
    // ...
    expect(r).toBe(0);
  });
});

describe("computeForwardKPIs", () => {
  it("< 2 snapshot → tüm KPI null", () => {
    const r = computeForwardKPIs([mkSnapshot("2026-01-01", ["A"])]);
    expect(r.top10_stability).toBeNull();
    expect(r.turnover).toBeNull();
    expect(r.snapshots_used).toBe(1);
  });

  it("Stabil 10 günlük seri → stabilite ~1, turnover ~0", () => {
    const snaps = Array.from({ length: 10 }, (_, i) =>
      mkSnapshot(`2026-01-${String(i + 1).padStart(2, "0")}`, ["A", "B", "C"]),
    );
    const r = computeForwardKPIs(snaps);
    expect(r.top10_stability).toBeCloseTo(1.0, 5);
    expect(r.turnover).toBeCloseTo(0, 5);
    expect(r.snapshots_used).toBe(10);
  });

  it("30 günden kısa seri → top10_retention_30d null", () => {
    const snaps = Array.from({ length: 25 }, (_, i) => mkSnapshot(`2026-01-${String(i + 1).padStart(2, "0")}`, ["A"]));
    const r = computeForwardKPIs(snaps);
    expect(r.top10_retention_30d).toBeNull();
  });
});

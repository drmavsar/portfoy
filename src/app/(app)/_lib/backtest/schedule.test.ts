import { describe, expect, it } from "vitest";

import {
  BACKTEST_ENGINE_VERSION_AT,
  backtestEndDate,
  backtestScenarios,
  firstBusinessDayOfYear,
  isFreshRun,
  latestRunsByKey,
  prioritizedMatrix,
  type StoredRun,
} from "./schedule";

describe("backtest takvimi", () => {
  it("ilk iş günü eski sabitlerle aynı (2022-2025), 2026 Cuma", () => {
    expect([2022, 2023, 2024, 2025].map(firstBusinessDayOfYear)).toEqual([
      "2022-01-03",
      "2023-01-02",
      "2024-01-02",
      "2025-01-02",
    ]);
    expect(firstBusinessDayOfYear(2026)).toBe("2026-01-02");
    expect(firstBusinessDayOfYear(2028)).toBe("2028-01-03"); // 2 Ocak Pazar
  });

  it("bitiş: önceki ayın son günü (ay içinde sabit)", () => {
    expect(backtestEndDate("2026-10-04")).toBe("2026-09-30");
    expect(backtestEndDate("2026-10-31")).toBe("2026-09-30");
    expect(backtestEndDate("2027-01-05")).toBe("2026-12-31");
    expect(backtestEndDate("2028-03-01")).toBe("2028-02-29");
  });

  it("senaryolar yeni yılla kendiliğinden genişler; kısa pencere dışarıda", () => {
    expect(backtestScenarios("2026-10-04")).toEqual([
      "2022-01-03",
      "2023-01-02",
      "2024-01-02",
      "2025-01-02",
      "2026-01-02",
    ]);
    // Ocak 2027: bitiş 2026-12-31 → 2027 henüz yok
    expect(backtestScenarios("2027-01-05").at(-1)).toBe("2026-01-02");
    // Temmuz 2027: bitiş 2027-06-30 → 2027-01-04'ten 177 gün < 180 → yok
    expect(backtestScenarios("2027-07-10").at(-1)).toBe("2026-01-02");
    // Ağustos 2027: 208 gün → var
    expect(backtestScenarios("2027-08-10").at(-1)).toBe("2027-01-04");
  });

  it("matris önceliği: en iyi yapılandırma, sonra Faz-1 tabanı", () => {
    const m = prioritizedMatrix({ top_n: 5, rebalance_days: 30 }, { top_n: 10, rebalance_days: 90 });
    expect(m).toHaveLength(24);
    expect(m.slice(0, 2).map((c) => `${c.top_n}/${c.rebalance_days}/${c.strategy}`)).toEqual([
      "5/30/equal_weight",
      "5/30/score_weighted",
    ]);
    expect(m.slice(2, 4).every((c) => c.top_n === 10 && c.rebalance_days === 90)).toBe(true);
  });
});

describe("çalıştırma seçimi", () => {
  const run = (id: string, created_at: string, start = "2024-01-02", end = "2026-09-30"): StoredRun => ({
    id,
    created_at,
    params: { start_date: start, end_date: end, top_n: 5, rebalance_days: 30, strategy: "equal_weight" },
  });

  it("anahtar başına en yeni; güncel olmayan senaryo atlanır", () => {
    const out = latestRunsByKey(
      [
        run("eski", "2026-05-31T10:00:00+00:00", "2024-01-02", "2026-05-26"),
        run("yeni", "2026-10-05T03:00:00+00:00"),
        run("tanimsiz", "2026-10-05T03:00:00+00:00", "2021-01-04"),
      ],
      ["2024-01-02"],
    );
    expect(out.map((r) => r.id)).toEqual(["yeni"]);
  });

  it("güncellik: aynı bitiş, motor düzeltmesinden ve son TÜFE'den sonra", () => {
    const after = new Date(Date.parse(BACKTEST_ENGINE_VERSION_AT) + 3600_000).toISOString();
    expect(isFreshRun(run("a", after), "2026-09-30", null)).toBe(true);
    expect(isFreshRun(run("b", "2026-05-31T10:00:00+00:00", "2024-01-02", "2026-09-30"), "2026-09-30", null)).toBe(false);
    expect(isFreshRun(run("c", after), "2026-10-31", null)).toBe(false);
    // TÜFE çalıştırmadan sonra güncellendiyse yeniden hesapla
    const cpiLater = new Date(Date.parse(after) + 60_000).toISOString();
    expect(isFreshRun(run("d", after), "2026-09-30", cpiLater)).toBe(false);
  });
});

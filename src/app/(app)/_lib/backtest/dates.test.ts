import { describe, expect, it } from "vitest";

import { addDays, computeRebalanceDates, cpiPeriodFor, daysBetween } from "./dates";

describe("addDays", () => {
  it("Ay geçişi", () => {
    expect(addDays("2024-01-31", 1)).toBe("2024-02-01");
  });
  it("Yıl geçişi", () => {
    expect(addDays("2024-12-31", 1)).toBe("2025-01-01");
  });
  it("Negatif", () => {
    expect(addDays("2024-02-01", -1)).toBe("2024-01-31");
  });
});

describe("daysBetween", () => {
  it("Aynı tarih → 0", () => {
    expect(daysBetween("2024-01-01", "2024-01-01")).toBe(0);
  });
  it("Bir gün ileri", () => {
    expect(daysBetween("2024-01-01", "2024-01-02")).toBe(1);
  });
});

describe("computeRebalanceDates", () => {
  it("90 günlük rebalance ile 1 yıllık aralık → ~4 tarih", () => {
    const dates = computeRebalanceDates("2024-01-01", "2025-01-01", 90);
    expect(dates.length).toBe(5); // 0, 90, 180, 270, 360
    expect(dates[0]).toBe("2024-01-01");
  });

  it("End start'tan önce → []", () => {
    expect(computeRebalanceDates("2024-12-31", "2024-01-01", 90)).toEqual([]);
  });
});

describe("cpiPeriodFor", () => {
  it("2024-05-15 → 2024-04", () => {
    expect(cpiPeriodFor("2024-05-15")).toBe("2024-04");
  });
  it("2024-01-15 → 2023-12 (önceki yıl)", () => {
    expect(cpiPeriodFor("2024-01-15")).toBe("2023-12");
  });
});

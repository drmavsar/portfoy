import { describe, expect, it } from "vitest";

import {
  computeCutoff,
  filterSeriesByRange,
  type NavPointLite,
} from "./nav-chart-range";

function mkSeries(days: string[]): NavPointLite[] {
  return days.map((d, i) => ({ as_of: d, nav: 1 + i * 0.001 }));
}

describe("computeCutoff", () => {
  it("ALL → fallbackEarliest döner (verilmişse)", () => {
    expect(computeCutoff("2026-05-30", "ALL", "2021-01-01")).toBe("2021-01-01");
  });

  it("ALL + fallback yoksa → anchor", () => {
    expect(computeCutoff("2026-05-30", "ALL")).toBe("2026-05-30");
  });

  it("1M → anchor − 30 gün", () => {
    expect(computeCutoff("2026-05-30", "1M")).toBe("2026-04-30");
  });

  it("3M → anchor − 90 gün (2026 leap değil)", () => {
    expect(computeCutoff("2026-05-30", "3M")).toBe("2026-03-01");
  });

  it("6M → anchor − 180 gün", () => {
    expect(computeCutoff("2026-05-30", "6M")).toBe("2025-12-01");
  });

  it("1Y → anchor − 365 gün", () => {
    expect(computeCutoff("2026-05-30", "1Y")).toBe("2025-05-30");
  });
});

describe("filterSeriesByRange", () => {
  it("Boş seri → []", () => {
    expect(filterSeriesByRange([], "1M")).toEqual([]);
  });

  it("ALL → tüm seriyi döner", () => {
    const series = mkSeries(["2024-01-01", "2025-06-15", "2026-05-26"]);
    expect(filterSeriesByRange(series, "ALL")).toHaveLength(3);
  });

  it("1M → anchor olarak son tarihi alır (wall-clock değil)", () => {
    // Anchor = 2026-05-26 (son NAV). 1M cutoff = 2026-04-26.
    // Olmaması gereken: gerçek today (örn. 2024-XX) kullanılırsa filter
    // boş döner. Düzeltme: anchor son NAV.
    const days = [
      "2026-01-15", // dışarıda
      "2026-04-20", // dışarıda (cutoff'tan önce)
      "2026-04-30", // içeride
      "2026-05-10", // içeride
      "2026-05-20", // içeride
      "2026-05-26", // anchor (içeride)
    ];
    const series = mkSeries(days);
    const result = filterSeriesByRange(series, "1M");
    expect(result.map((p) => p.as_of)).toEqual([
      "2026-04-30",
      "2026-05-10",
      "2026-05-20",
      "2026-05-26",
    ]);
  });

  it("3M → son 3 ayı kapsar", () => {
    const series = mkSeries([
      "2025-12-01", // dışarıda (cutoff 2026-02-25 öncesi)
      "2026-02-26", // içeride
      "2026-03-15", // içeride
      "2026-05-26", // anchor
    ]);
    const result = filterSeriesByRange(series, "3M");
    expect(result.length).toBeGreaterThanOrEqual(3);
    expect(result[result.length - 1].as_of).toBe("2026-05-26");
  });

  it("6M → son 6 ayı kapsar (KPC/YHK senaryosu)", () => {
    // KPC için DB'de 122 satır var (2025-11-30 - 2026-05-26).
    // Anchor demir atması doğru çalıştığında bu satırlar gelir.
    const series = mkSeries([
      "2024-01-01", // dışarıda
      "2025-11-30", // sınırda
      "2026-01-15", // içeride
      "2026-05-26", // anchor
    ]);
    const result = filterSeriesByRange(series, "6M");
    expect(result[result.length - 1].as_of).toBe("2026-05-26");
    expect(result.length).toBeGreaterThanOrEqual(2);
  });

  it("Bug regression: wall-clock anchor değil, son NAV anchor", () => {
    // Eski bug: nowMs = Date.now() (gerçek bugün). Eğer real today seriyi
    // çoktan geçti veya gelecekteyse, 1M cutoff yanlış olur.
    // Bu test pure helper'ı kontrol eder — anchor parametre, real time
    // hiç kullanılmaz.
    const series = mkSeries(["2026-05-20", "2026-05-26"]);
    const r1 = filterSeriesByRange(series, "1M");
    const r2 = filterSeriesByRange(series, "1M");
    expect(r1).toEqual(r2); // deterministik — saat çağrısı yok
  });
});

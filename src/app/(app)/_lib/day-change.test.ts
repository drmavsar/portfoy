import { describe, expect, it } from "vitest";

import { allocateByValue, classDayChanges, marketEffect } from "./day-change";

describe("classDayChanges", () => {
  // 26.11.2026 Özet ekranı: dün gece kaydı (25.11) ve şu anki değerler
  const now = { equity: 3_289_757.18, metal: 913_037.17, fx: 537_136.63, cash: 411_960.66 };
  const snap = { equity_mv: "3290964.24", metal_try: "901461.95", fx_try: "537137.69", cash_try: "418490.66" };
  const market = { equity: -3_197, metal: 1_049, fx: 0, cash: -6_530 };

  it("cards sum to the headline (now − last night's snapshot)", () => {
    const c = classDayChanges(now, snap, market);
    const sum = c.equity + c.metal + c.fx + c.cash;
    const total = now.equity + now.metal + now.fx + now.cash;
    const snapTotal = 3290964.24 + 901461.95 + 537137.69 + 418490.66;
    expect(sum).toBeCloseTo(total - snapTotal, 2);
    expect(c.metal).toBeCloseTo(11_575.22, 2);
    expect(c.cash).toBeCloseTo(-6_530, 2);
  });

  it("falls back to market changes without a snapshot", () => {
    expect(classDayChanges(now, null, market)).toEqual(market);
  });
});

describe("marketEffect", () => {
  it("removes today's net buy so moving cash into a fund is not a gain", () => {
    // 100.000 ₺ fon alındı, fiyat +500; nakitten 100.000 düştü
    const changes = { equity: 100_500, metal: 0, fx: 0, cash: -100_000 };
    expect(marketEffect(changes, 100_000)).toBe(500);
    expect(marketEffect(changes, 100_000) + changes.cash + 100_000).toBe(
      changes.equity + changes.metal + changes.fx + changes.cash,
    );
  });
});

describe("allocateByValue", () => {
  it("splits a class change by value share", () => {
    const rows = allocateByValue([{ value: 750 }, { value: 250 }], 100);
    expect(rows.map((r) => r.dayChange)).toEqual([75, 25]);
  });

  it("returns zero changes when the class is empty", () => {
    expect(allocateByValue([{ value: 0 }], 50)[0].dayChange).toBe(0);
  });
});

import { describe, expect, it } from "vitest";

import { isReplaceableYearRow, planYearEndSnapshot } from "./year-end-wealth";

const dec31 = { snapshot_date: "2026-12-31", total_wealth: 5_412_345.678 };

describe("planYearEndSnapshot", () => {
  it("tahmini kayıt 31 Aralık snapshot'ıyla değiştirilir", () => {
    const plan = planYearEndSnapshot("2027-01-01", dec31, {
      period: "2026",
      total_try: 5_096_623.7,
      notes: "17.05.2026 tahmini",
    });
    expect(plan).toEqual({
      period: "2026",
      total_try: 5_412_345.68,
      notes: "Yıl sonu (otomatik · 2026-12-31 günlük kaydı)",
    });
  });

  it("kayıt yoksa yazılır; cron 31 Aralık'ı kaçırdıysa Aralık'ın son kaydı kullanılır", () => {
    expect(planYearEndSnapshot("2027-01-03", { snapshot_date: "2026-12-29", total_wealth: 100 }, null)?.notes).toContain(
      "2026-12-29",
    );
  });

  it("elle girilmiş yıl sonu kaydına dokunulmaz", () => {
    expect(planYearEndSnapshot("2027-01-01", dec31, { period: "2026", total_try: 1, notes: "Yıl sonu" })).toBeNull();
  });

  it("Aralık dışı snapshot yıl sonu sayılmaz; aynı otomatik kayıt tekrar yazılmaz", () => {
    expect(planYearEndSnapshot("2027-01-01", { snapshot_date: "2026-11-30", total_wealth: 100 }, null)).toBeNull();
    const first = planYearEndSnapshot("2027-01-01", dec31, null)!;
    expect(planYearEndSnapshot("2027-01-02", dec31, { ...first })).toBeNull();
  });

  it("not sınıflandırma", () => {
    expect(isReplaceableYearRow(null)).toBe(true);
    expect(isReplaceableYearRow("17.05.2026 TAHMİNİ")).toBe(true);
    expect(isReplaceableYearRow("Yıl sonu (otomatik · 2026-12-31 günlük kaydı)")).toBe(true);
    expect(isReplaceableYearRow("Yıl sonu")).toBe(false);
  });
});

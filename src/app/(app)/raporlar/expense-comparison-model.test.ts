import { describe, it, expect } from "vitest";
import { previousPeriod, expenseMatrix, comparisonCell } from "./expense-comparison-model";
import type { RawTxn } from "@/app/(app)/_lib/reports-actions";
describe("expense comparison", () => {
  it("uses inclusive equal-length periods across year boundaries", () => {
    expect(previousPeriod({ from: "2026-01-01", to: "2026-01-08" }, "period")).toEqual({ from: "2025-12-24", to: "2025-12-31" });
  });
  it("clamps previous month dates for leap years", () => {
    expect(previousPeriod({ from: "2024-03-01", to: "2024-03-31" }, "month")).toEqual({ from: "2024-02-01", to: "2024-02-29" });
  });
  it("rejects empty, reversed and invalid dates", () => {
    for (const p of [{ from: "", to: "2026-01-01" }, { from: "2026-02-30", to: "2026-03-01" }, { from: "2026-02-01", to: "2026-01-01" }]) expect(previousPeriod(p, "period")).toBeNull();
  });
  it("does not report infinite growth when the previous value is zero", () => {
    expect(comparisonCell(100, 0).percent).toBeNull();
    expect(comparisonCell(0, 50).percent).toBe(-100);
  });
  const txn = (patch: Partial<RawTxn>): RawTxn => ({ occurred_on: "2026-09-08", direction: "outflow", amount: 10, currency: "TRY", category_id: "food", beneficiary_id: "m", description: null, merchant_raw: null, ...patch });
  const period = { from: "2026-09-08", to: "2026-09-08" }, previous = { from: "2026-09-07", to: "2026-09-07" };
  it("includes prior-only categories and unassigned people, keeping currencies separate", () => {
    const result = expenseMatrix([txn({ amount: 0.1 }), txn({ amount: 0.2 }), txn({ amount: 100, currency: "USD" }), txn({ direction: "inflow", amount: 100 }), txn({ occurred_on: "2026-09-07", category_id: null, beneficiary_id: null, amount: 20 })], period, previous, "TRY", [], "");
    expect(result.get("food", "m").current).toBe(0.3);
    expect(result.get(null, null).previous).toBe(20);
    expect(result.categoryIds).toContain("__none__");
    expect(result.get("__none__", "__none__").percent).toBe(-100);
  });
  it("applies person and category filters to both periods", () => {
    const result = expenseMatrix([txn({}), txn({ beneficiary_id: "b" }), txn({ category_id: "rent" }), txn({ occurred_on: "2026-09-07", amount: 5 })], period, previous, "TRY", ["m"], "food");
    expect(result.get(null, null)).toEqual({ current: 10, previous: 5, delta: 5, percent: 100 });
  });
});

import { describe, expect, it } from "vitest";
import { csvCell, moneyTotals } from "./model";

const rows = [
  { person: "Mehmet", category: "Gıda", amount: 0.1, currency: "TRY" },
  { person: "Mehmet", category: "Gıda", amount: 0.2, currency: "TRY" },
  { person: "Ahmet Burak", category: "Ulaşım", amount: 20, currency: "USD" },
  { person: "Mehmet", category: "Ulaşım", amount: 40, currency: "TRY" },
];
describe("money totals and CSV", () => {
  it("does not merge currency totals and avoids binary decimal residue", () => {
    const total = moneyTotals(rows, r => r.amount, r => r.currency);
    expect(total).toContain("40,30");
    expect(total).toContain("20,00");
    expect(total).not.toContain("60,30");
  });
  it("empty filters yield no invented zero currency", () => {
    expect(moneyTotals([], () => 0, () => "TRY")).toBe("—");
  });
  it("escapes delimiters and spreadsheet formulas in text", () => {
    expect(csvCell('a;"b')).toBe('"a;""b"');
    expect(csvCell("=HYPERLINK(A1)")).toBe('"\'=HYPERLINK(A1)"');
    expect(csvCell(-15)).toBe('"-15"');
  });
});

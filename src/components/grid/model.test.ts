import { describe, expect, it } from "vitest";
import { csvCell, filterAndSort, groupRows, moneyTotals } from "./model";

const rows = [
  { person: "Mehmet", category: "Gıda", amount: 0.1, currency: "TRY" },
  { person: "Mehmet", category: "Gıda", amount: 0.2, currency: "TRY" },
  { person: "Ahmet Burak", category: "Ulaşım", amount: 20, currency: "USD" },
  { person: "Mehmet", category: "Ulaşım", amount: 40, currency: "TRY" },
];
const columns = [
  { id: "person", value: (r: typeof rows[number]) => r.person },
  { id: "category", value: (r: typeof rows[number]) => r.category },
  { id: "amount", value: (r: typeof rows[number]) => r.amount },
];
describe("shared grid analysis", () => {
  it("filters before grouping and retains all matching rows across display pages", () => {
    const many = Array.from({ length: 120 }, (_, i) => ({ ...rows[i % 4] }));
    const filtered = filterAndSort(many, columns, { person: "mehmet" }, []);
    const groups = groupRows(filtered, columns, ["person", "category"]);
    expect(filtered).toHaveLength(90);
    expect(groups[0].rows).toHaveLength(90);
    expect(groups[0].children.map(g => g.rows.length)).toEqual([60, 30]);
  });
  it("sorts by multiple fields without mutating source rows", () => {
    const result = filterAndSort(rows, columns, {}, [{ id: "person", desc: false }, { id: "amount", desc: true }]);
    expect(result.map(r => r.amount)).toEqual([20, 40, 0.2, 0.1]);
    expect(rows[0].amount).toBe(0.1);
  });
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

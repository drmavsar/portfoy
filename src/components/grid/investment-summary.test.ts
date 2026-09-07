import { describe, expect, it } from "vitest";
import { quantityTotals } from "./investment-summary";
import { filterAndSort, groupRows, moneyTotals } from "./model";

describe("investment subtotals", () => {
  const rows = [
    { id: "a", person: "Mehmet", symbol: "AAA", quantity: 0.00000012, amount: 10, currency: "USD" },
    { id: "a", person: "Mehmet", symbol: "AAA", quantity: -0.00000002, amount: 20, currency: "TRY" },
    { id: "b", person: "Ahmet", symbol: "BBB", quantity: 5, amount: 50, currency: "TRY" },
  ];
  it("keeps net quantities per instrument and preserves fractional units", () => {
    const total = quantityTotals(rows, r => r.id, r => r.symbol, r => r.quantity);
    expect(total).toBe("AAA: 0,0000001 adet · BBB: 5 adet");
  });
  it("applies person filters before group and currency totals", () => {
    const columns = [{ id: "person", value: (r: typeof rows[number]) => r.person }];
    const filtered = filterAndSort(rows, columns, { person: "Mehmet" }, []);
    const groups = groupRows(filtered, columns, ["person"]);
    expect(groups).toHaveLength(1);
    expect(groups[0].rows).toHaveLength(2);
    const text = moneyTotals(groups[0].rows, r => r.amount, r => r.currency);
    expect(text).toContain("10,00");
    expect(text).toContain("20,00");
    expect(text).not.toContain("30,00");
  });
});

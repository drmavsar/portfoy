import { describe, expect, it } from "vitest";

import {
  dayLabel,
  facetOptions,
  filterLedger,
  foldTr,
  groupLedger,
  matchesQuery,
  monthLabel,
  primaryCurrency,
  sortLedger,
  windowGroups,
} from "./model";

interface Row {
  id: string;
  date: string;
  amount: number;
  category: string;
  desc: string;
}
const rows: Row[] = [
  { id: "a", date: "2026-10-01", amount: 120, category: "Market", desc: "MIGROS KADIKOY" },
  { id: "b", date: "2026-09-15", amount: 2_500, category: "Eğitim", desc: "Okul taksiti" },
  { id: "c", date: "2026-10-03", amount: 80, category: "Market", desc: "Şok market" },
  { id: "d", date: "2026-09-30", amount: 300, category: "Ulaşım", desc: "İstanbulkart" },
  { id: "e", date: "2026-10-03", amount: 45, category: "Market", desc: "Fırın" },
];
const acc = { date: (r: Row) => r.date, amount: (r: Row) => r.amount };
const facets = [{ id: "category", value: (r: Row) => r.category }];

describe("arama", () => {
  it("Türkçe harf ve büyük/küçük farkını yok sayar", () => {
    expect(foldTr("MİGROS Şişli ÇAĞLAYAN")).toBe("migros sisli caglayan");
    expect(matchesQuery("MIGROS KADIKOY", "migros")).toBe(true);
    expect(matchesQuery("İstanbulkart", "istanbul")).toBe(true);
    expect(matchesQuery("Şok market", "sok")).toBe(true);
  });
  it("tüm kelimeler geçmeli, sıra fark etmez", () => {
    expect(matchesQuery("Okul taksiti Eğitim", "egitim okul")).toBe(true);
    expect(matchesQuery("Okul taksiti Eğitim", "okul market")).toBe(false);
    expect(matchesQuery("herhangi", "   ")).toBe(true);
  });
  it("filtre + arama birlikte", () => {
    const out = filterLedger(rows, (r) => `${r.desc} ${r.category}`, "market", facets, { category: "Market" });
    expect(out.map((r) => r.id)).toEqual(["a", "c", "e"]);
    expect(filterLedger(rows, (r) => r.desc, "", facets, { category: "Yok" })).toEqual([]);
    expect(filterLedger(rows, (r) => r.desc, "", facets, { category: "" })).toHaveLength(5);
  });
});

describe("sıralama", () => {
  it("tarih yeni → eski, eşitlikte gelen sıra korunur; kaynağı değiştirmez", () => {
    const out = sortLedger(rows, acc, "date-desc");
    expect(out.map((r) => r.id)).toEqual(["c", "e", "a", "d", "b"]);
    expect(rows[0].id).toBe("a");
  });
  it("tutara göre; eşitlikte yeni tarih önde", () => {
    const tie = [...rows, { id: "f", date: "2026-10-04", amount: 120, category: "Market", desc: "x" }];
    expect(sortLedger(tie, acc, "amount-desc").map((r) => r.id)).toEqual(["b", "d", "f", "a", "c", "e"]);
    expect(sortLedger(rows, acc, "amount-asc")[0].id).toBe("e");
  });
});

describe("gruplama", () => {
  it("alan grupları büyüklüğe göre, toplam ağırlıkla", () => {
    const g = groupLedger(sortLedger(rows, acc, "date-desc"), acc, "category", facets, "date-desc");
    expect(g.map((x) => [x.label, x.weight, x.rows.length])).toEqual([
      ["Eğitim", 2_500, 1],
      ["Ulaşım", 300, 1],
      ["Market", 245, 3],
    ]);
    expect(g[2].rows.map((r) => r.id)).toEqual(["c", "e", "a"]);
  });
  it("ay ve gün grupları tarih sırasında; tutara göre sıralıyken de yeni → eski", () => {
    const sorted = sortLedger(rows, acc, "amount-desc");
    const months = groupLedger(sorted, acc, "month", facets, "amount-desc");
    expect(months.map((m) => m.label)).toEqual(["Ekim 2026", "Eylül 2026"]);
    expect(months[0].rows.map((r) => r.id)).toEqual(["a", "c", "e"]);
    const daysAsc = groupLedger(sortLedger(rows, acc, "date-asc"), acc, "day", facets, "date-asc");
    expect(daysAsc[0].label).toBe("15 Eylül 2026, Salı");
  });
  it("özel ağırlık: yalnız baskın para birimi paya girer", () => {
    const cur = (r: Row) => (r.id === "b" ? "USD" : "TRY");
    expect(primaryCurrency(rows, cur)).toBe("TRY");
    expect(primaryCurrency([], cur)).toBeNull();
    const g = groupLedger(rows, acc, "category", facets, "date-desc", (r) => (cur(r) === "TRY" ? r.amount : 0));
    expect(g.map((x) => [x.label, x.weight])).toEqual([
      ["Ulaşım", 300],
      ["Market", 245],
      ["Eğitim", 0],
    ]);
  });
  it("bilinmeyen alan → grup yok", () => {
    expect(groupLedger(rows, acc, "nope", facets, "date-desc")).toEqual([]);
  });
  it("etiketler", () => {
    expect(monthLabel("2027-01")).toBe("Ocak 2027");
    expect(dayLabel("2026-10-04")).toBe("4 Ekim 2026, Pazar");
  });
});

describe("sayfalama", () => {
  it("bütçe gruplar arasında paylaşılır; kapalı grup bütçe harcamaz", () => {
    const g = groupLedger(rows, acc, "category", facets, "date-desc"); // Eğitim 1, Ulaşım 1, Market 3
    const all = windowGroups(g, new Set(), 2);
    expect(all.items.map((i) => i.rows.length)).toEqual([1, 1, 0]);
    expect(all.items[2].hidden).toBe(3);
    expect(all.hidden).toBe(3);
    const closed = windowGroups(g, new Set([g[0].key]), 2);
    expect(closed.items.map((i) => i.rows.length)).toEqual([0, 1, 1]);
    expect(closed.hidden).toBe(2);
  });
});

describe("filtre seçenekleri", () => {
  it("kayıt sayısına göre, eşitlikte alfabetik", () => {
    expect(facetOptions(rows, (r) => r.category)).toEqual([
      { value: "Market", count: 3 },
      { value: "Eğitim", count: 1 },
      { value: "Ulaşım", count: 1 },
    ]);
  });
});

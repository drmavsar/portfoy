import { describe, expect, it } from "vitest";

import {
  __internals,
  computeKatFonSepetiSeries,
  type FundUniverseEntry,
  type KatFonSepetiOptions,
  type NavSeriesByFund,
} from "./kat-fon-sepeti";
import type { FundStatusEntry } from "./types";

describe("lastNavOnOrBefore", () => {
  const series = [
    { as_of: "2024-01-01", nav: 1.0 },
    { as_of: "2024-01-15", nav: 1.1 },
    { as_of: "2024-02-01", nav: 1.2 },
  ];
  it("Tam eşleşme", () => {
    expect(__internals.lastNavOnOrBefore(series, "2024-01-15")).toBe(1.1);
  });
  it("Sonrası → en yakın önceki", () => {
    expect(__internals.lastNavOnOrBefore(series, "2024-01-20")).toBe(1.1);
  });
  it("İlk tarihten önce → null", () => {
    expect(__internals.lastNavOnOrBefore(series, "2023-12-01")).toBeNull();
  });
});

function buildFixture(): KatFonSepetiOptions {
  const fundPrices: NavSeriesByFund = {
    A: [
      { as_of: "2024-01-01", nav: 1.0 },
      { as_of: "2024-02-01", nav: 1.10 },
      { as_of: "2024-03-01", nav: 1.20 },
    ],
    B: [
      { as_of: "2024-01-01", nav: 2.0 },
      { as_of: "2024-02-01", nav: 2.20 },
      { as_of: "2024-03-01", nav: 2.40 },
    ],
    C_DELISTED: [
      { as_of: "2024-01-01", nav: 1.0 },
      { as_of: "2024-01-31", nav: 1.05 },
    ],
    D_NON_KATILIM: [
      { as_of: "2024-01-01", nav: 1.0 },
      { as_of: "2024-03-01", nav: 1.5 },
    ],
  };
  const funds: FundUniverseEntry[] = [
    { fund_code: "A", is_participation: true },
    { fund_code: "B", is_participation: true },
    { fund_code: "C_DELISTED", is_participation: true },
    { fund_code: "D_NON_KATILIM", is_participation: false },
  ];
  const statusHistory: FundStatusEntry[] = [
    { fund_code: "A", effective_from: "2010-01-01", effective_to: null, status: "active", reason: null },
    { fund_code: "B", effective_from: "2010-01-01", effective_to: null, status: "active", reason: null },
    { fund_code: "C_DELISTED", effective_from: "2010-01-01", effective_to: "2024-02-01", status: "active", reason: null },
    { fund_code: "C_DELISTED", effective_from: "2024-02-02", effective_to: null, status: "delisted", reason: "test" },
    { fund_code: "D_NON_KATILIM", effective_from: "2010-01-01", effective_to: null, status: "active", reason: null },
  ];
  return {
    startDate: "2024-01-01",
    endDate: "2024-03-01",
    fundPrices,
    funds,
    statusHistory,
    filterParticipation: true,
  };
}

describe("computeKatFonSepetiSeries", () => {
  it("2 aktif katılım fonu, equal weight basket", () => {
    const opts = buildFixture();
    // C_DELISTED 2024-02-01'e kadar dahil — başlangıçta universe'de
    // D_NON_KATILIM hariç (is_participation=false)
    const r = computeKatFonSepetiSeries(opts);

    // Başlangıç değeri 100
    const first = r.find((p) => p.as_of === "2024-01-01")!;
    expect(first.value).toBeCloseTo(100, 1);

    // 2024-03-01: A=1.20/1.00=1.20, B=2.40/2.00=1.20, C delisted
    // ortalama = (1.20+1.20)/2 = 1.20 → sepeti = 120
    const last = r.find((p) => p.as_of === "2024-03-01")!;
    expect(last.value).toBeCloseTo(120, 1);
  });

  it("D_NON_KATILIM her zaman hariç (filterParticipation=true)", () => {
    const opts = buildFixture();
    // Eğer D dahil olsaydı, sepetinin değeri farklı olurdu — kontrol
    // dolaylı: D %50 büyüdü, ortalamayı yukarı çekerdi
    const r = computeKatFonSepetiSeries(opts);
    const last = r.find((p) => p.as_of === "2024-03-01")!;
    // A ve B %20 büyüdü → 120 olmalı. D dahil olsaydı (D=%50) ortalama ~130 olurdu.
    expect(last.value).toBeLessThan(125);
  });

  it("filterParticipation=false → D_NON_KATILIM da dahil", () => {
    const opts = buildFixture();
    opts.filterParticipation = false;
    const r = computeKatFonSepetiSeries(opts);
    const last = r.find((p) => p.as_of === "2024-03-01")!;
    // A=1.20, B=1.20, D=1.50, C delisted → (1.20+1.20+1.50)/3 = 1.30 → 130
    expect(last.value).toBeCloseTo(130, 1);
  });

  it("Delisted fon belirtilen tarihten sonra hariç", () => {
    const opts = buildFixture();
    const r = computeKatFonSepetiSeries(opts);
    // 2024-01-15: A=1.0/1.0=1.0, B=2.0/2.0=1.0, C=1.0/1.0=1.0 (last <= 01-15)
    // Hepsi 1.0 → sepeti 100
    const midPoint = r.find((p) => p.as_of === "2024-01-15")!;
    expect(midPoint.value).toBeCloseTo(100, 1);

    // 2024-01-31: C nav=1.05 → ratio 1.05; A,B hâlâ 1.0
    // Ortalama (1.0+1.0+1.05)/3 ≈ 1.0167 → 101.67
    const lastJan = r.find((p) => p.as_of === "2024-01-31")!;
    expect(lastJan.value).toBeCloseTo(101.67, 1);

    // 2024-02-15: C delisted (2024-02-02'den sonra), A=1.10, B=2.20/2.00=1.10
    // Ortalama 1.10 → 110
    const after = r.find((p) => p.as_of === "2024-02-15")!;
    expect(after.value).toBeCloseTo(110, 1);
  });

  it("Boş universe → []", () => {
    const opts: KatFonSepetiOptions = {
      startDate: "2024-01-01",
      endDate: "2024-03-01",
      fundPrices: {},
      funds: [],
      statusHistory: [],
    };
    expect(computeKatFonSepetiSeries(opts)).toEqual([]);
  });

  it("Tarih aralığı boyunca her gün için sepeti dolu", () => {
    const opts = buildFixture();
    const r = computeKatFonSepetiSeries(opts);
    // 60 gün (Jan 1 → Mar 1 inclusive) — universe boş olmadığı için her gün dolu
    expect(r.length).toBeGreaterThan(55);
  });
});

describe("addDays", () => {
  it("Ay geçişi doğru", () => {
    expect(__internals.addDays("2024-01-31", 1)).toBe("2024-02-01");
  });
  it("Yıl geçişi doğru", () => {
    expect(__internals.addDays("2024-12-31", 1)).toBe("2025-01-01");
  });
  it("Negatif gün", () => {
    expect(__internals.addDays("2024-02-01", -1)).toBe("2024-01-31");
  });
});

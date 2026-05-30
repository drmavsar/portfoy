import { describe, expect, it } from "vitest";

import {
  computeFundReturns,
  median,
  vsCategoryDelta,
  type NavPoint,
} from "./returns-logic";

/**
 * Sentetik bir NAV serisi üretir: as_of='2026-05-30'da nav=baseEnd,
 * geriye doğru `lengthDays` gün, her gün eşit oranlı büyüme yansıtarak
 * baseStart'a kadar.
 *
 * navAt(i)/nav(i-1) = ratio  →  nav(i)=base * ratio^i
 *
 * Bu, "her gün eşit yüzde değişen" düz ayarlanabilir bir seriydir.
 */
function makeSeries(opts: {
  baseStart: number;
  baseEnd: number;
  startDate: string;
  endDate: string;
}): NavPoint[] {
  const start = Date.parse(`${opts.startDate}T00:00:00Z`);
  const end = Date.parse(`${opts.endDate}T00:00:00Z`);
  const totalDays = Math.round((end - start) / 86_400_000);
  const ratio = Math.pow(opts.baseEnd / opts.baseStart, 1 / totalDays);

  const points: NavPoint[] = [];
  for (let i = 0; i <= totalDays; i++) {
    const ts = start + i * 86_400_000;
    const iso = new Date(ts).toISOString().slice(0, 10);
    points.push({ as_of: iso, nav: opts.baseStart * Math.pow(ratio, i) });
  }
  return points;
}

describe("computeFundReturns — temel pencereler", () => {
  it("Düz sıfır getiri serisi", () => {
    const series: NavPoint[] = [];
    const start = Date.parse("2020-01-01T00:00:00Z");
    for (let i = 0; i <= 2000; i++) {
      series.push({
        as_of: new Date(start + i * 86_400_000).toISOString().slice(0, 10),
        nav: 100,
      });
    }
    const r = computeFundReturns(series);
    expect(r).not.toBeNull();
    expect(r!.gross_1d).toBe(0);
    expect(r!.gross_1y).toBe(0);
    expect(r!.gross_3y_cagr).toBe(0);
    expect(r!.gross_5y_cagr).toBe(0);
  });

  it("365 günde +%50 büyüme → gross_1y ≈ %50", () => {
    const series = makeSeries({
      baseStart: 100,
      baseEnd: 150,
      startDate: "2025-05-30",
      endDate: "2026-05-30",
    });
    const r = computeFundReturns(series);
    expect(r!.gross_1y).toBeCloseTo(0.5, 2);
  });

  it("3 yıllık seri, toplam %120 → 3Y CAGR ≈ %30", () => {
    // Window 3*365=1095 gün back; gerçek 3 yıl = 365.25*3 ≈ 1096 gün.
    // 1 günlük kayma yüzünden ~0.003 sapma var (kabul edilebilir).
    const series = makeSeries({
      baseStart: 100,
      baseEnd: 220,
      startDate: "2023-05-30",
      endDate: "2026-05-30",
    });
    const r = computeFundReturns(series);
    expect(r!.gross_3y_cagr).toBeCloseTo(0.30, 2);
  });

  it("5 yıllık seri, toplam +%200 → 5Y CAGR ≈ %24.6", () => {
    const series = makeSeries({
      baseStart: 100,
      baseEnd: 300,
      startDate: "2021-05-30",
      endDate: "2026-05-30",
    });
    const r = computeFundReturns(series);
    expect(r!.gross_5y_cagr).toBeCloseTo(0.246, 2);
  });

  it("Kısa veri: 1 yıllık seri için 3Y/5Y CAGR null + warning", () => {
    const series = makeSeries({
      baseStart: 100,
      baseEnd: 150,
      startDate: "2025-05-30",
      endDate: "2026-05-30",
    });
    const r = computeFundReturns(series);
    expect(r!.gross_3y_cagr).toBeNull();
    expect(r!.gross_5y_cagr).toBeNull();
    expect(r!.warnings).toContain("no_3y_history");
    expect(r!.warnings).toContain("no_5y_history");
  });
});

describe("computeFundReturns — kısa pencereler", () => {
  it("7 gün önceki NAV 95, bugün 100 → gross_1w ≈ %5.26", () => {
    const series: NavPoint[] = [
      { as_of: "2026-05-23", nav: 95 },
      { as_of: "2026-05-30", nav: 100 },
    ];
    const r = computeFundReturns(series);
    expect(r!.gross_1w).toBeCloseTo(100 / 95 - 1, 4);
  });

  it("Tolerance aşılan pencere null döner", () => {
    // 1m hedef = as_of − 30g = 2026-04-30. En eski nokta 2026-05-12 (hedeften
    // SONRA) → uygun candidate yok → gross_1m null.
    const series: NavPoint[] = [
      { as_of: "2026-05-12", nav: 90 },
      { as_of: "2026-05-30", nav: 100 },
    ];
    const r = computeFundReturns(series, { windowToleranceDays: 14 });
    expect(r!.gross_1m).toBeNull();
    expect(r!.gross_3m).toBeNull();
    expect(r!.gross_6m).toBeNull();
    expect(r!.gross_1y).toBeNull();
    // 1H hedef = 2026-05-23. 2026-05-12 hedeften 11 gün önce → tolerance 14
    // içinde, hesaplanır.
    expect(r!.gross_1w).toBeCloseTo(100 / 90 - 1, 6);
  });

  it("Yıl başı YTD: 1 Ocak'tan beri %25 büyüme", () => {
    const series = makeSeries({
      baseStart: 100,
      baseEnd: 125,
      startDate: "2026-01-01",
      endDate: "2026-05-30",
    });
    const r = computeFundReturns(series);
    expect(r!.gross_ytd).toBeCloseTo(0.25, 2);
  });
});

describe("computeFundReturns — reel getiri (CPI Fisher)", () => {
  it("CPI yoksa reel kolonlar null + no_cpi_data warning", () => {
    const series = makeSeries({
      baseStart: 100,
      baseEnd: 150,
      startDate: "2025-05-30",
      endDate: "2026-05-30",
    });
    const r = computeFundReturns(series);
    expect(r!.real_1y).toBeNull();
    expect(r!.warnings).toContain("no_cpi_data");
  });

  it("Nominal %50, enflasyon %30 → reel ≈ %15.4", () => {
    // 1Y pencere: 2025-05-30 → 2026-05-30
    // cpiPeriodForNavDate("2026-05-30") = "2026-04"
    // cpiPeriodForNavDate("2025-05-30") = "2025-04"
    const series = makeSeries({
      baseStart: 100,
      baseEnd: 150,
      startDate: "2025-05-30",
      endDate: "2026-05-30",
    });
    const cpi = { "2025-04": 1000, "2026-04": 1300 };
    const r = computeFundReturns(series, { cpi });
    expect(r!.real_1y).toBeCloseTo(1.5 / 1.3 - 1, 4);
    expect(r!.computed_from_period).toBe("2026-04");
  });

  it("CPI end yoksa real_1y null + missing_cpi_end warning", () => {
    const series = makeSeries({
      baseStart: 100,
      baseEnd: 150,
      startDate: "2025-05-30",
      endDate: "2026-05-30",
    });
    const cpi = { "2025-04": 1000 }; // end period eksik
    const r = computeFundReturns(series, { cpi });
    expect(r!.real_1y).toBeNull();
    expect(r!.warnings).toContain("missing_cpi_end");
  });

  it("3Y reel CAGR: nominal %120, enflasyon %100 (3 yılda) → reel CAGR ≈ %3.2", () => {
    // 3Y total nominal = 1.2 (gross_3y_cagr ≈ %30.3 yıllık)
    // CPI 1000 → 2000 (3 yılda %100 toplam)
    // toplam reel = (1+1.2)/(1+1.0) - 1 = 2.2/2.0 - 1 = 0.10 (3 yılda %10 toplam)
    // CAGR = 1.10^(1/3) - 1 ≈ 0.0323
    const series = makeSeries({
      baseStart: 100,
      baseEnd: 220,
      startDate: "2023-05-30",
      endDate: "2026-05-30",
    });
    const cpi = {
      "2023-04": 1000,
      "2026-04": 2000,
    };
    const r = computeFundReturns(series, { cpi });
    expect(r!.real_3y_cagr).toBeCloseTo(0.0323, 3);
  });
});

describe("median + vsCategoryDelta", () => {
  it("Tek sayıda eleman → ortadaki", () => {
    expect(median([1, 2, 3])).toBe(2);
  });

  it("Çift sayıda eleman → iki ortanın aritmetik ortalaması", () => {
    expect(median([1, 2, 3, 4])).toBe(2.5);
  });

  it("Null/undefined süzülür", () => {
    expect(median([1, null, 2, undefined, 3])).toBe(2);
  });

  it("Hepsi null → null", () => {
    expect(median([null, null, undefined])).toBeNull();
    expect(median([])).toBeNull();
  });

  it("NaN/Infinity süzülür", () => {
    expect(median([1, 2, NaN, 3])).toBe(2);
  });

  it("vsCategoryDelta: fund %50, medyan %30 → +%20", () => {
    expect(vsCategoryDelta(0.5, 0.3)).toBeCloseTo(0.2, 10);
  });

  it("vsCategoryDelta: fund %20, medyan %40 → −%20", () => {
    expect(vsCategoryDelta(0.2, 0.4)).toBeCloseTo(-0.2, 10);
  });

  it("vsCategoryDelta: null girişler → null", () => {
    expect(vsCategoryDelta(null, 0.3)).toBeNull();
    expect(vsCategoryDelta(0.5, null)).toBeNull();
  });
});

describe("computeFundReturns — kenar durumlar", () => {
  it("Boş seri → null", () => {
    expect(computeFundReturns([])).toBeNull();
  });

  it("Tek nokta → tüm pencereler null, ama sonuç döner", () => {
    const r = computeFundReturns([{ as_of: "2026-05-30", nav: 100 }]);
    expect(r).not.toBeNull();
    expect(r!.gross_1d).toBeNull();
    expect(r!.gross_1y).toBeNull();
    expect(r!.warnings).toContain("no_1y_history");
  });

  it("asOf override — verilen tarih latest'tan farklı olsa bile geçerli", () => {
    const series = makeSeries({
      baseStart: 100,
      baseEnd: 150,
      startDate: "2025-05-30",
      endDate: "2026-05-30",
    });
    const r = computeFundReturns(series, { asOf: "2026-05-30" });
    expect(r!.as_of).toBe("2026-05-30");
  });
});

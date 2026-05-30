import { describe, expect, it } from "vitest";

import {
  applyTaxToCagr,
  applyWithholdingTax,
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

  it("CPI end yoksa real_1y null + missing_cpi_end warning (lag > 6 ay)", () => {
    // expected period 2026-04, latest 2025-04 → lag 12 ay > MAX_CPI_LAG_MONTHS
    const series = makeSeries({
      baseStart: 100,
      baseEnd: 150,
      startDate: "2025-05-30",
      endDate: "2026-05-30",
    });
    const cpi = { "2025-04": 1000 };
    const r = computeFundReturns(series, { cpi });
    expect(r!.real_1y).toBeNull();
    expect(r!.warnings).toContain("missing_cpi_end");
    expect(r!.warnings.some((w) => w.startsWith("cpi_lag_exceeded_max="))).toBe(true);
  });

  it("CPI fallback: latest CPI 4 ay eski (lag ≤ 6) → real_1y dolar + warning", () => {
    // 2 yıllık seri — fallback için 1Y geri kayma yapacağız
    // NAV: 2024-05-30 → 2026-05-30, %50 toplam büyüme
    const series = makeSeries({
      baseStart: 100,
      baseEnd: 200, // 2 yılda 2x
      startDate: "2024-05-30",
      endDate: "2026-05-30",
    });
    // CPI: 2026-01 latest (expected 2026-04 → lag 3 ay), 2025-01 startCpi available
    // Pencere shifted: asOf shifted back 3 ay → 2026-02-28, start1y → 2025-02-28
    // start CPI for shifted: cpiPeriodForNavDate("2025-02-28") = 2025-01
    const cpi = {
      "2025-01": 1500,
      "2026-01": 1800, // %20 enflasyon 1Y'da (2025-01 → 2026-01)
    };
    const r = computeFundReturns(series, { cpi });
    expect(r!.real_1y).not.toBeNull();
    expect(r!.warnings).toContain("cpi_lag_fallback_used");
    expect(r!.warnings).toContain("cpi_lag_months=3");
    expect(r!.computed_from_period).toBe("2026-01");
    // Shifted nominal: NAV 2025-02-28 → 2026-02-28, ratio = 2^(1Y/2Y) = √2
    // nominal_shifted ≈ 0.4142 (yani %41.4)
    // real = (1+0.4142)/(1+0.20) - 1 ≈ 0.1785 (%17.85)
    expect(r!.real_1y).toBeCloseTo(0.1785, 1);
  });

  it("CPI fallback: tam eşleşme varsa fallback warning üretmez", () => {
    const series = makeSeries({
      baseStart: 100,
      baseEnd: 150,
      startDate: "2025-05-30",
      endDate: "2026-05-30",
    });
    const cpi = { "2025-04": 1000, "2026-04": 1200 };
    const r = computeFundReturns(series, { cpi });
    expect(r!.warnings).not.toContain("cpi_lag_fallback_used");
    expect(r!.computed_from_period).toBe("2026-04");
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

describe("applyWithholdingTax (Türkiye fon stopajı)", () => {
  it("Pozitif kar + %17.5 stopaj → net = gross × 0.825", () => {
    expect(applyWithholdingTax(0.50, 0.175)).toBeCloseTo(0.4125, 6);
  });

  it("Negatif (zarar) → net = gross (stopaj kesilmez)", () => {
    expect(applyWithholdingTax(-0.20, 0.175)).toBe(-0.20);
  });

  it("Sıfır getiri → net = 0", () => {
    expect(applyWithholdingTax(0, 0.175)).toBe(0);
  });

  it("HSYF %0 stopaj → net = gross", () => {
    expect(applyWithholdingTax(0.50, 0)).toBe(0.50);
  });

  it("rate null (BELIRSIZ) → null", () => {
    expect(applyWithholdingTax(0.50, null)).toBeNull();
  });

  it("gross null → null", () => {
    expect(applyWithholdingTax(null, 0.175)).toBeNull();
  });
});

describe("applyTaxToCagr — annualize edilmiş CAGR'da vergi", () => {
  it("3Y CAGR %30, rate %17.5 → annualize öncesi vergilenir", () => {
    // total_gross = 1.30^3 − 1 = 1.197 (%119.7)
    // total_net   = 1.197 × 0.825 = 0.9875 (%98.75)
    // net_cagr    = 1.9875^(1/3) − 1 ≈ 0.2573
    const r = applyTaxToCagr(0.30, 0.175, 3);
    expect(r).toBeCloseTo(0.2573, 3);
  });

  it("HSYF %0 stopaj → net CAGR = brüt CAGR", () => {
    expect(applyTaxToCagr(0.45, 0, 3)).toBeCloseTo(0.45, 6);
  });

  it("Zarar CAGR (negatif) → net = gross (CAGR olarak)", () => {
    // -0.10 CAGR, 3 yıl: total -0.271 (zarar). Vergi yok.
    const r = applyTaxToCagr(-0.10, 0.175, 3);
    expect(r).toBeCloseTo(-0.10, 6);
  });

  it("rate null → null", () => {
    expect(applyTaxToCagr(0.30, null, 3)).toBeNull();
  });

  it("CAGR null → null", () => {
    expect(applyTaxToCagr(null, 0.175, 3)).toBeNull();
  });

  it("Naif cagr × (1−rate) yaklaşımı yanlış", () => {
    // Doğru: ~%25.5
    // Naif:  %30 × 0.825 = %24.75
    const correct = applyTaxToCagr(0.30, 0.175, 3);
    const naive = 0.30 * (1 - 0.175);
    expect(Math.abs((correct ?? 0) - naive)).toBeGreaterThan(0.005);
  });
});

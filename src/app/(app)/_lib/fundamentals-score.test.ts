import { describe, expect, it } from "vitest";

import {
  bandVerdict,
  deriveMetrics,
  enrichFundamentals,
  FAIR_PE,
  scoreFundamentals,
  type FundamentalsRaw,
} from "./fundamentals-score";

/** Test için tam, geçerli bir ham veri nesnesi üretir. */
function base(): FundamentalsRaw {
  return {
    ok: true,
    symbol: "TEST",
    fetched_at: 0,
    warnings: [],
    profile: { sector: null, industry: null, website: null, summary: null },
    quote: {
      price: 100,
      previous_close: 99,
      change_pct: 1,
      currency: "TRY",
      market_cap: 1_000_000,
      shares_outstanding: 10_000,
      fifty_two_week_high: 150,
      fifty_two_week_low: 50,
      fifty_day_average: 100,
      two_hundred_day_average: 95,
    },
    valuation: {
      pe: 10,
      pb: 1.5,
      ev_ebitda: 7,
      net_debt: 0,
      free_float: 40,
      foreign_ratio: 30,
    },
    dividend: { yield: 3, annual_rate: 3, ex_date: null, history: [] },
    analyst: {},
    financials: { derived: {}, income_annual: null, balance_annual: null, cashflow_annual: null },
  };
}

describe("bandVerdict", () => {
  it("higher-is-better: good / warn / bad bantları", () => {
    expect(bandVerdict(30, 20, 10, true)).toBe("good");
    expect(bandVerdict(15, 20, 10, true)).toBe("warn");
    expect(bandVerdict(5, 20, 10, true)).toBe("bad");
  });

  it("lower-is-better: good / warn / bad bantları", () => {
    expect(bandVerdict(5, 10, 20, false)).toBe("good");
    expect(bandVerdict(15, 10, 20, false)).toBe("warn");
    expect(bandVerdict(25, 10, 20, false)).toBe("bad");
  });

  it("null / NaN → na", () => {
    expect(bandVerdict(null, 10, 20, true)).toBe("na");
    expect(bandVerdict(undefined, 10, 20, true)).toBe("na");
    expect(bandVerdict(NaN, 10, 20, true)).toBe("na");
  });
});

describe("deriveMetrics", () => {
  it("EPS = fiyat / F/K, adil değer = FAIR_PE × EPS", () => {
    const d = deriveMetrics(base());
    expect(d.eps_ttm).toBe(10); // 100 / 10
    expect(d.fair_value).toBe(FAIR_PE * 10);
  });

  it("Margin of Safety = (adil değer − fiyat) / fiyat", () => {
    const d = deriveMetrics(base());
    // adil = 150, fiyat = 100 → %50
    expect(d.margin_of_safety_pct).toBeCloseTo(50, 5);
  });

  it("F/K ≤ 0 ise EPS ve adil değer null", () => {
    const raw = base();
    raw.valuation.pe = -4;
    const d = deriveMetrics(raw);
    expect(d.eps_ttm).toBeNull();
    expect(d.fair_value).toBeNull();
    expect(d.margin_of_safety_pct).toBeNull();
  });

  it("ROE = net kâr TTM / özkaynak", () => {
    const raw = base();
    raw.financials.derived = { net_income_ttm: 200, equity: 1000 };
    expect(deriveMetrics(raw).roe).toBeCloseTo(20, 5);
  });

  it("net marj = net kâr / gelir", () => {
    const raw = base();
    raw.financials.derived = { net_income_ttm: 150, revenue_ttm: 1000 };
    expect(deriveMetrics(raw).net_margin).toBeCloseTo(15, 5);
  });

  it("gelir büyümesi: seri en güncel dönem başta", () => {
    const raw = base();
    raw.financials.derived = {
      revenue_annual: [
        { period: "2024", value: 120 },
        { period: "2023", value: 100 },
      ],
    };
    expect(deriveMetrics(raw).revenue_growth).toBeCloseTo(20, 5);
  });

  it("önceki dönem ≤ 0 ise büyüme null (anlamsız oran)", () => {
    const raw = base();
    raw.financials.derived = {
      net_income_annual: [
        { period: "2024", value: 50 },
        { period: "2023", value: -10 },
      ],
    };
    expect(deriveMetrics(raw).earnings_growth).toBeNull();
  });

  it("cari oran = dönen varlık / kısa vadeli yükümlülük", () => {
    const raw = base();
    raw.financials.derived = { current_assets: 300, current_liabilities: 200 };
    expect(deriveMetrics(raw).current_ratio).toBeCloseTo(1.5, 5);
  });

  it("serbest nakit akışı = işletme NA − capex", () => {
    const raw = base();
    raw.financials.derived = { operating_cf_ttm: 500, capex_ttm: 120 };
    expect(deriveMetrics(raw).free_cash_flow_ttm).toBe(380);
  });

  it("52 hafta konumu: (fiyat − dip) / (zirve − dip)", () => {
    const d = deriveMetrics(base());
    // (100 - 50) / (150 - 50) = %50
    expect(d.price_position_52w).toBeCloseTo(50, 5);
  });
});

describe("scoreFundamentals", () => {
  it("güçlü temeller → yüksek skor, Güçlü etiketi", () => {
    const raw = base();
    raw.valuation.pe = 6; // ucuz
    raw.financials.derived = {
      net_income_ttm: 350,
      equity: 1000, // ROE %35
      current_assets: 400,
      current_liabilities: 200, // cari 2.0
      revenue_annual: [
        { period: "2024", value: 160 },
        { period: "2023", value: 100 }, // %60 büyüme
      ],
    };
    const derived = deriveMetrics(raw);
    const s = scoreFundamentals(raw, derived);
    expect(s.score).toBeGreaterThanOrEqual(70);
    expect(s.label).toBe("Güçlü");
  });

  it("zayıf temeller → düşük skor, Zayıf etiketi", () => {
    const raw = base();
    raw.valuation.pe = 40; // pahalı
    raw.valuation.net_debt = 900_000; // ağır borç (PD'nin %90'ı)
    raw.dividend.yield = 0;
    raw.financials.derived = {
      net_income_ttm: -50,
      equity: 1000, // negatif ROE
      current_assets: 100,
      current_liabilities: 200, // cari 0.5
      revenue_annual: [
        { period: "2024", value: 80 },
        { period: "2023", value: 100 }, // küçülme
      ],
    };
    const derived = deriveMetrics(raw);
    const s = scoreFundamentals(raw, derived);
    expect(s.score).toBeLessThan(45);
    expect(s.label).toBe("Zayıf");
  });

  it("eksik veri → o sütun atlanır, kalan ağırlıklar normalize edilir", () => {
    const raw = base();
    // sadece değerleme + temettü verisi var; mali tablo yok
    const derived = deriveMetrics(raw);
    const s = scoreFundamentals(raw, derived);
    const keys = s.pillars.map((p) => p.key);
    expect(keys).toContain("valuation");
    expect(keys).not.toContain("profitability"); // ROE verisi yok
    expect(s.score).not.toBeNull();
    expect(s.score!).toBeGreaterThanOrEqual(0);
    expect(s.score!).toBeLessThanOrEqual(100);
  });

  it("hiç sütun yoksa skor null, etiket —", () => {
    const raw = base();
    raw.valuation.pe = null;
    raw.valuation.net_debt = null;
    raw.dividend.yield = null;
    const s = scoreFundamentals(raw, deriveMetrics(raw));
    expect(s.score).toBeNull();
    expect(s.label).toBe("—");
  });

  it("F/K negatifse değerleme sütunu 'bad'", () => {
    const raw = base();
    raw.valuation.pe = -3;
    const s = scoreFundamentals(raw, deriveMetrics(raw));
    const valuation = s.pillars.find((p) => p.key === "valuation");
    expect(valuation?.verdict).toBe("bad");
  });
});

describe("enrichFundamentals", () => {
  it("raw + derived + score üçlüsünü döndürür", () => {
    const result = enrichFundamentals(base());
    expect(result.raw.symbol).toBe("TEST");
    expect(result.derived.eps_ttm).toBe(10);
    expect(result.score.score).not.toBeNull();
  });
});

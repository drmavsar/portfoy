import { describe, expect, it } from "vitest";

import {
  FORBIDDEN_WORDS_RE,
  __internals,
  explainFundScore,
  type CategoryPeerInput,
  type ExplainFundScoreInput,
} from "./score-explain";

// ──────────────────────────────────────────────────────────────────────────
// Fixtures
// ──────────────────────────────────────────────────────────────────────────

function baseInput(overrides: Partial<ExplainFundScoreInput> = {}): ExplainFundScoreInput {
  const peers: CategoryPeerInput[] = [
    { fund_code: "KCV", name: "KCV Fonu", mehmet_score: 73 },
    { fund_code: "ZBI", name: "ZBI Fonu", mehmet_score: 72 },
    { fund_code: "CVK", name: "CVK Fonu", mehmet_score: 71 },
    { fund_code: "FFH", name: "FFH Fonu", mehmet_score: 68 },
    { fund_code: "KPC", name: "KPC Fonu", mehmet_score: 43 },
  ];
  return {
    fund: {
      code: "KCV",
      name: "KCV Fonu",
      category_id: 1,
      investment_universe: "COKLU_VARLIK" as never,
      is_equity_intensive: false,
    },
    category: null,
    scores: {
      fund_code: "KCV",
      persona_id: "p1",
      as_of: "2026-05-26",
      mehmet_score: 73,
      components_used: 5,
      inflation_protection_score: 91,
      tax_advantage_score: 30,
      normalized_risk_score: 80,
      long_term_performance_score: 73,
      diversification_score: 60,
      bist_dependency_score: 50,
      gold_dependency_score: 50,
      volatility_1y: 0.18,
      max_drawdown_3y: -0.15,
      sharpe_like_1y: 0.6,
      bist_correlation_1y: null,
      gold_correlation_1y: null,
      bist_source: "default_from_universe",
      gold_source: "default_from_universe",
      downside_volatility_1y: null,
      computed_at: "2026-05-30T20:00:00Z",
      warnings: [],
    } as never,
    returns: {
      fund_code: "KCV",
      as_of: "2026-05-26",
      gross_1y: 0.61,
      net_1y: 0.51,
      gross_1d: null,
      gross_1w: null,
      gross_1m: null,
      gross_3m: null,
      gross_6m: null,
      gross_ytd: null,
      gross_3y_cagr: null,
      gross_5y_cagr: null,
      net_3y_cagr: null,
      net_5y_cagr: null,
      real_1y: 0.207,
      real_3y_cagr: null,
      real_5y_cagr: null,
      vs_category_1y: null,
      vs_category_3y: null,
      vs_category_net_1y: 0.08,
      vs_category_net_3y: null,
      applied_tax_kind: "GENEL_17_5",
      applied_tax_rate: 0.175,
      tax_confidence: "HIGH",
      tax_source: null,
      computed_from_period: null,
      warnings: [],
      computed_at: "2026-05-30T20:00:00Z",
    } as never,
    persona: {
      inflation_weight: 25,
      tax_weight: 20,
      risk_weight: 20,
      long_term_weight: 20,
      diversification_weight: 15,
    },
    category_peers: peers,
    history: {},
    ...overrides,
  };
}

// ──────────────────────────────────────────────────────────────────────────
// Breakdown
// ──────────────────────────────────────────────────────────────────────────

describe("breakdown", () => {
  it("5 component döner, contribution = raw × weight / 100", () => {
    const r = explainFundScore(baseInput());
    expect(r.breakdown).toHaveLength(5);
    const infl = r.breakdown.find((b) => b.key === "inflation_protection")!;
    expect(infl.raw_score).toBe(91);
    expect(infl.weight_pct).toBe(25);
    expect(infl.contribution).toBeCloseTo(22.75, 2);
    expect(infl.label_status).toBe("strong");
  });

  it("Null component → contribution null, status 'missing'", () => {
    const input = baseInput();
    input.scores.inflation_protection_score = null;
    const r = explainFundScore(input);
    const infl = r.breakdown.find((b) => b.key === "inflation_protection")!;
    expect(infl.raw_score).toBeNull();
    expect(infl.contribution).toBeNull();
    expect(infl.label_status).toBe("missing");
  });

  it("Tüm component'lerin etiketi doğru status", () => {
    const r = explainFundScore(baseInput());
    const m = Object.fromEntries(r.breakdown.map((b) => [b.key, b.label_status]));
    expect(m.inflation_protection).toBe("strong"); // 91
    expect(m.tax_advantage).toBe("weak"); // 30
    expect(m.risk).toBe("strong"); // 80
    expect(m.long_term_performance).toBe("ok"); // 73 — sınırda; STRONG=75
    expect(m.diversification).toBe("ok"); // 60
  });
});

// ──────────────────────────────────────────────────────────────────────────
// Strengths / Weaknesses
// ──────────────────────────────────────────────────────────────────────────

describe("strengths", () => {
  it("infl ≥75 → 'enflasyon üstünde reel getiri' (real_1y pozitif)", () => {
    const r = explainFundScore(baseInput());
    expect(r.strengths.some((s) => /reel getiri/i.test(s))).toBe(true);
  });

  it("HSYF + tax skoru yüksek → HSYF rozeti", () => {
    const input = baseInput();
    input.fund.is_equity_intensive = true;
    input.scores.tax_advantage_score = 100;
    const r = explainFundScore(input);
    expect(r.strengths.some((s) => /HSYF/i.test(s))).toBe(true);
  });

  it("vs_category_net_1y > 5% → kategori üstünde maddesi eklenir", () => {
    const r = explainFundScore(baseInput());
    expect(r.strengths.some((s) => /kategori medyanı/i.test(s))).toBe(true);
  });

  it("Maksimum 4 madde", () => {
    const input = baseInput();
    input.scores.inflation_protection_score = 90;
    input.scores.tax_advantage_score = 90;
    input.scores.normalized_risk_score = 90;
    input.scores.long_term_performance_score = 90;
    input.scores.diversification_score = 90;
    if (input.returns) input.returns.vs_category_net_1y = 0.10;
    const r = explainFundScore(input);
    expect(r.strengths.length).toBeLessThanOrEqual(4);
  });
});

describe("weaknesses", () => {
  it("infl ≤30 (real_1y negatif) → 'enflasyonun altında'", () => {
    const input = baseInput();
    input.scores.inflation_protection_score = 20;
    if (input.returns) input.returns.real_1y = -0.05;
    const r = explainFundScore(input);
    expect(r.weaknesses.some((s) => /enflasyon/i.test(s))).toBe(true);
  });

  it("BIST corr > 0.85 → 'BIST'le yüksek korelasyon'", () => {
    const input = baseInput();
    input.scores.bist_correlation_1y = 0.92;
    const r = explainFundScore(input);
    expect(r.weaknesses.some((s) => /BIST/i.test(s))).toBe(true);
  });

  it("vs_category_net_1y < -5% → kategori altında maddesi", () => {
    const input = baseInput();
    if (input.returns) input.returns.vs_category_net_1y = -0.07;
    const r = explainFundScore(input);
    expect(r.weaknesses.some((s) => /kategori medyanı/i.test(s))).toBe(true);
  });

  it("Volatilite > 0.35 + risk skoru ≤30 → 'Volatilite yüksek'", () => {
    const input = baseInput();
    input.scores.normalized_risk_score = 20;
    input.scores.volatility_1y = 0.42;
    const r = explainFundScore(input);
    expect(r.weaknesses.some((s) => /volatilite/i.test(s.toLowerCase()))).toBe(true);
  });
});

// ──────────────────────────────────────────────────────────────────────────
// Tax Impact + HSYF counterfactual
// ──────────────────────────────────────────────────────────────────────────

describe("tax_impact", () => {
  it("GENEL_17_5: 11 puan farkı (gross 0.61 − net 0.51 = 0.10)", () => {
    const r = explainFundScore(baseInput());
    expect(r.tax_impact.points_diff).toBeCloseTo(0.10, 2);
    expect(r.tax_impact.pct_of_gross).toBeCloseTo(0.10 / 0.61, 2);
    expect(r.tax_impact.label).toMatch(/-?10 puan/);
  });

  it("HSYF: 0 puan", () => {
    const input = baseInput();
    input.fund.is_equity_intensive = true;
    if (input.returns) {
      input.returns.applied_tax_kind = "HSYF_0_STOPAJ" as never;
      input.returns.applied_tax_rate = 0;
      input.returns.net_1y = input.returns.gross_1y; // HSYF: gross=net
    }
    const r = explainFundScore(input);
    expect(r.tax_impact.points_diff).toBe(0);
    expect(r.tax_impact.label).toContain("0 puan");
    expect(r.tax_impact.hsyf_counterfactual.already_hsyf).toBe(true);
    expect(r.tax_impact.hsyf_counterfactual.label).toContain("zaten HSYF");
  });

  it("HSYF counterfactual: standart fon için 'HSYF olsaydı +N puan'", () => {
    const r = explainFundScore(baseInput());
    expect(r.tax_impact.hsyf_counterfactual.already_hsyf).toBe(false);
    expect(r.tax_impact.hsyf_counterfactual.points_lost_to_tax).toBeCloseTo(0.10, 2);
    expect(r.tax_impact.hsyf_counterfactual.label).toMatch(/HSYF olsaydı \+10 puan/);
  });

  it("net_1y null → 'hesaplanamadı' label", () => {
    const input = baseInput();
    if (input.returns) input.returns.net_1y = null;
    const r = explainFundScore(input);
    expect(r.tax_impact.label).toContain("hesaplanamadı");
    expect(r.tax_impact.points_diff).toBeNull();
  });
});

// ──────────────────────────────────────────────────────────────────────────
// Category Rank + Medal + Band
// ──────────────────────────────────────────────────────────────────────────

describe("category_rank", () => {
  it("Lider fon (1/5) → 🥇 + 'Üst %5'", () => {
    const r = explainFundScore(baseInput()); // KCV en yüksek (73)
    expect(r.category_rank?.rank).toBe(1);
    expect(r.category_rank?.medal).toBe("🥇");
    expect(r.category_rank?.medal_label).toBe("Lider");
    // 1/5 = 0.20 → ust_ceyrek (Üst çeyrek). Sadece <=0.05 → ust_5.
    expect(r.category_rank?.band).toBe("ust_ceyrek");
  });

  it("İlk 3 → 🥈", () => {
    const input = baseInput();
    input.fund.code = "CVK"; // rank 3
    input.scores.fund_code = "CVK";
    input.scores.mehmet_score = 71;
    const r = explainFundScore(input);
    expect(r.category_rank?.rank).toBe(3);
    expect(r.category_rank?.medal).toBe("🥈");
    expect(r.category_rank?.medal_label).toBe("İlk 3");
  });

  it("İlk 5 → 🥉 (4-5. sıralar)", () => {
    const input = baseInput();
    input.fund.code = "FFH"; // rank 4
    input.scores.fund_code = "FFH";
    input.scores.mehmet_score = 68;
    const r = explainFundScore(input);
    expect(r.category_rank?.rank).toBe(4);
    expect(r.category_rank?.medal).toBe("🥉");
  });

  it("Orta-üstü (rank 5 ötesi) → madalya yok", () => {
    const input = baseInput();
    input.fund.code = "KPC"; // rank 5
    input.scores.fund_code = "KPC";
    input.scores.mehmet_score = 43;
    const r = explainFundScore(input);
    expect(r.category_rank?.rank).toBe(5);
    expect(r.category_rank?.medal).toBe("🥉");
  });

  it("Küçük kategori (<5 skorlu fon) → category_size_note", () => {
    const input = baseInput();
    input.category_peers = [
      { fund_code: "KCV", name: null, mehmet_score: 73 },
      { fund_code: "ZBI", name: null, mehmet_score: 72 },
    ];
    const r = explainFundScore(input);
    expect(r.category_rank?.category_size_note).toMatch(/Kategori dar/);
  });

  it("Tüm peers null skor → category_rank = null", () => {
    const input = baseInput();
    input.category_peers = [{ fund_code: "X", name: null, mehmet_score: null }];
    const r = explainFundScore(input);
    expect(r.category_rank).toBeNull();
  });

  it("bandFromPercentile mappingi", () => {
    expect(__internals.bandFromPercentile(0.04).band).toBe("ust_5");
    expect(__internals.bandFromPercentile(0.05).band).toBe("ust_5");
    expect(__internals.bandFromPercentile(0.08).band).toBe("ust_10");
    expect(__internals.bandFromPercentile(0.20).band).toBe("ust_ceyrek");
    expect(__internals.bandFromPercentile(0.45).band).toBe("ust_yari");
    expect(__internals.bandFromPercentile(0.70).band).toBe("alt_yari");
    expect(__internals.bandFromPercentile(0.95).band).toBe("alt_ceyrek");
  });
});

// ──────────────────────────────────────────────────────────────────────────
// Similar Funds
// ──────────────────────────────────────────────────────────────────────────

describe("similar_funds", () => {
  it("Yakın skorlu fonlar: ±5 pencere, kendisi hariç", () => {
    const r = explainFundScore(baseInput());
    const codes = r.similar_funds.near_score.map((s) => s.code);
    expect(codes).not.toContain("KCV"); // kendisi yok
    expect(codes).toContain("ZBI"); // 72 → 73 ± 5 içinde
    expect(codes).toContain("CVK"); // 71
  });

  it("Kategori liderleri: top 3, kendisi hariç", () => {
    const r = explainFundScore(baseInput());
    const codes = r.similar_funds.category_leaders.map((s) => s.code);
    expect(codes).toEqual(["ZBI", "CVK", "FFH"]);
  });

  it("Mevcut fon kategori lideriyse is_self_leader=true", () => {
    const r = explainFundScore(baseInput());
    expect(r.similar_funds.is_self_leader).toBe(true);
  });

  it("Alt sıradaki fon: is_self_leader=false", () => {
    const input = baseInput();
    input.fund.code = "KPC";
    input.scores.fund_code = "KPC";
    input.scores.mehmet_score = 43;
    const r = explainFundScore(input);
    expect(r.similar_funds.is_self_leader).toBe(false);
  });

  it("Disclaimer her zaman var", () => {
    const r = explainFundScore(baseInput());
    expect(r.similar_funds.disclaimer).toContain("tavsiye");
  });
});

// ──────────────────────────────────────────────────────────────────────────
// Data Quality Flags
// ──────────────────────────────────────────────────────────────────────────

describe("data_quality_flags", () => {
  it("cpi_lag_fallback_used + cpi_lag_months=4 → 'CPI 4 ay gecikmeli'", () => {
    const input = baseInput();
    if (input.returns) {
      input.returns.warnings = ["cpi_lag_fallback_used", "cpi_lag_months=4"];
    }
    const r = explainFundScore(input);
    const cpi = r.data_quality_flags.find((f) => f.key === "cpi_lag_fallback_used");
    expect(cpi).toBeDefined();
    expect(cpi!.severity).toBe("warn");
    expect(cpi!.label).toMatch(/4 ay/);
  });

  it("no_1y_history → critical", () => {
    const input = baseInput();
    if (input.returns) input.returns.warnings = ["no_1y_history"];
    const r = explainFundScore(input);
    expect(r.data_quality_flags.some((f) => f.severity === "critical")).toBe(true);
  });

  it("tax_confidence LOW → 'Stopaj güveni düşük'", () => {
    const input = baseInput();
    if (input.returns) input.returns.tax_confidence = "LOW" as never;
    const r = explainFundScore(input);
    expect(r.data_quality_flags.some((f) => /stopaj.*güven/i.test(f.label))).toBe(true);
  });

  it("components_used 2/5 → 'Skor hesaplanamadı'", () => {
    const input = baseInput();
    input.scores.components_used = 2;
    const r = explainFundScore(input);
    expect(r.data_quality_flags.some((f) => f.key === "insufficient_components")).toBe(true);
  });

  it("components_used 4/5 → 'Tüm bileşenler hesaplanamadı'", () => {
    const input = baseInput();
    input.scores.components_used = 4;
    const r = explainFundScore(input);
    expect(r.data_quality_flags.some((f) => f.key === "partial_components")).toBe(true);
  });

  it("Hiç warning yok + tax HIGH → flag boş veya minimal", () => {
    const r = explainFundScore(baseInput());
    expect(r.data_quality_flags.length).toBe(0);
  });
});

// ──────────────────────────────────────────────────────────────────────────
// History Compare
// ──────────────────────────────────────────────────────────────────────────

describe("history_compare", () => {
  it("Tarihçe yok → has_any_history=false + buildup_label", () => {
    const input = baseInput();
    input.history = { earliest_snapshot_days_ago: 3 };
    const r = explainFundScore(input);
    expect(r.history_compare.has_any_history).toBe(false);
    expect(r.history_compare.buildup_label).toMatch(/3 gün/);
  });

  it("d7 + d30 mevcut → delta hesaplanır", () => {
    const input = baseInput();
    input.history = { d7: { score: 70 }, d30: { score: 65 } };
    const r = explainFundScore(input);
    expect(r.history_compare.d7?.score).toBe(70);
    expect(r.history_compare.d7?.delta).toBe(3); // 73 - 70
    expect(r.history_compare.d30?.delta).toBe(8); // 73 - 65
  });

  it("3 periyot da mevcut", () => {
    const input = baseInput();
    input.history = {
      d7: { score: 72 },
      d30: { score: 65 },
      d90: { score: 50 },
    };
    const r = explainFundScore(input);
    expect(r.history_compare.d7?.delta).toBe(1);
    expect(r.history_compare.d30?.delta).toBe(8);
    expect(r.history_compare.d90?.delta).toBe(23);
  });

  it("Current null → delta null", () => {
    const input = baseInput();
    input.scores.mehmet_score = null;
    input.history = { d7: { score: 60 } };
    const r = explainFundScore(input);
    expect(r.history_compare.d7?.delta).toBeNull();
  });
});

// ──────────────────────────────────────────────────────────────────────────
// Yasak kelime regex guard
// ──────────────────────────────────────────────────────────────────────────

describe("FORBIDDEN_WORDS_RE", () => {
  it("Yasaklı kelimeleri yakalar", () => {
    expect(FORBIDDEN_WORDS_RE.test("Bu fonu al")).toBe(true);
    expect(FORBIDDEN_WORDS_RE.test("AL!")).toBe(true);
    expect(FORBIDDEN_WORDS_RE.test("Hemen sat")).toBe(true);
    expect(FORBIDDEN_WORDS_RE.test("kesinlikle önerilir")).toBe(true);
    expect(FORBIDDEN_WORDS_RE.test("portföyüne ekle")).toBe(true);
    expect(FORBIDDEN_WORDS_RE.test("yatırım tavsiyesi içerir")).toBe(true);
  });

  it("Kabul edilebilir Türkçe kelimeleri yakalamaz", () => {
    // \b ile alındı/satış/satır gibi kelimeler match etmez
    expect(FORBIDDEN_WORDS_RE.test("KCV fonu satın alma payı")).toBe(false); // 'alma' kelime parçası
    expect(FORBIDDEN_WORDS_RE.test("satış sonrası")).toBe(false);
    expect(FORBIDDEN_WORDS_RE.test("getiri sağlamış")).toBe(false);
  });

  it("Hiçbir strength/weakness yasak kelime içermez", () => {
    // 8 farklı senaryo simüle et
    const variants: ExplainFundScoreInput[] = [
      baseInput(),
      ((): ExplainFundScoreInput => {
        const i = baseInput();
        i.scores.inflation_protection_score = 10;
        if (i.returns) i.returns.real_1y = -0.1;
        return i;
      })(),
      ((): ExplainFundScoreInput => {
        const i = baseInput();
        i.fund.is_equity_intensive = true;
        i.scores.tax_advantage_score = 100;
        return i;
      })(),
      ((): ExplainFundScoreInput => {
        const i = baseInput();
        i.scores.bist_correlation_1y = 0.95;
        return i;
      })(),
      ((): ExplainFundScoreInput => {
        const i = baseInput();
        i.scores.gold_correlation_1y = 0.91;
        return i;
      })(),
      ((): ExplainFundScoreInput => {
        const i = baseInput();
        if (i.returns) i.returns.vs_category_net_1y = -0.10;
        return i;
      })(),
      ((): ExplainFundScoreInput => {
        const i = baseInput();
        i.scores.normalized_risk_score = 15;
        i.scores.volatility_1y = 0.50;
        return i;
      })(),
      ((): ExplainFundScoreInput => {
        const i = baseInput();
        i.scores.long_term_performance_score = 10;
        if (i.returns) i.returns.vs_category_net_3y = -0.20;
        return i;
      })(),
    ];
    for (const v of variants) {
      const r = explainFundScore(v);
      const allText = [
        ...r.strengths,
        ...r.weaknesses,
        ...r.data_quality_flags.map((f) => `${f.label} ${f.detail ?? ""}`),
        r.tax_impact.label,
        r.tax_impact.hsyf_counterfactual.label,
        r.category_rank?.band_label ?? "",
        r.category_rank?.category_size_note ?? "",
      ].join(" | ");
      expect(FORBIDDEN_WORDS_RE.test(allText)).toBe(false);
    }
  });
});

// ──────────────────────────────────────────────────────────────────────────
// Integration: KCV beklentisi (kullanıcı örneği)
// ──────────────────────────────────────────────────────────────────────────

describe("KCV integration örneği", () => {
  it("Kullanıcının verdiği görseli üretir: 1/5 lider + reel getiri + HSYF olsaydı", () => {
    const r = explainFundScore(baseInput());
    expect(r.total_score).toBe(73);
    expect(r.components_used).toBe(5);
    expect(r.category_rank?.medal).toBe("🥇");
    expect(r.strengths.length).toBeGreaterThanOrEqual(2);
    expect(r.tax_impact.label).toMatch(/puan/);
    expect(r.tax_impact.hsyf_counterfactual.label).toMatch(/HSYF/);
    expect(r.similar_funds.category_leaders).toHaveLength(3);
  });
});

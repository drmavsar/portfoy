import { describe, expect, it } from "vitest";

import {
  bistDependencyScore,
  computeMehmetScore,
  diversificationScore,
  goldDependencyScore,
  inflationProtectionScore,
  longTermPerformanceScore,
  riskScoreFromVolatility,
  taxAdvantageScore,
} from "./scoring-logic";
import type { UserPersona } from "./types";

const mehmetPersona: Pick<
  UserPersona,
  "inflation_weight" | "tax_weight" | "risk_weight" | "long_term_weight" | "diversification_weight"
> = {
  inflation_weight: 0.25,
  tax_weight: 0.20,
  risk_weight: 0.20,
  long_term_weight: 0.20,
  diversification_weight: 0.15,
};

describe("inflationProtectionScore", () => {
  it("real_1y = 0 (enflasyona yetişti) → 50", () => {
    expect(inflationProtectionScore(0)).toBe(50);
  });

  it("real_1y = +0.25 (%25 enflasyon üstü) → 100", () => {
    expect(inflationProtectionScore(0.25)).toBe(100);
  });

  it("real_1y = -0.25 → 0", () => {
    expect(inflationProtectionScore(-0.25)).toBe(0);
  });

  it("real_1y çok yüksek → clamp 100", () => {
    expect(inflationProtectionScore(1.0)).toBe(100);
  });

  it("null → null", () => {
    expect(inflationProtectionScore(null)).toBeNull();
  });
});

describe("taxAdvantageScore", () => {
  it("HSYF → 100", () => {
    expect(taxAdvantageScore("HSYF_0_STOPAJ")).toBe(100);
  });

  it("Genel → 30", () => {
    expect(taxAdvantageScore("GENEL_17_5")).toBe(30);
  });

  it("Döviz bazlı → 50", () => {
    expect(taxAdvantageScore("DOVIZ_BAZLI")).toBe(50);
  });

  it("Serbest → 25", () => {
    expect(taxAdvantageScore("SERBEST_FON")).toBe(25);
  });

  it("Belirsiz → 0", () => {
    expect(taxAdvantageScore("BELIRSIZ")).toBe(0);
  });

  it("Bilinmeyen kind → null", () => {
    expect(taxAdvantageScore("FOO_BAR")).toBeNull();
  });

  it("null → null", () => {
    expect(taxAdvantageScore(null)).toBeNull();
  });
});

describe("riskScoreFromVolatility", () => {
  it("vol = 0 → 100", () => {
    expect(riskScoreFromVolatility(0)).toBe(100);
  });

  it("vol = maxVol → 0", () => {
    expect(riskScoreFromVolatility(0.40, 0.40)).toBe(0);
  });

  it("vol = 0.20, maxVol = 0.40 → 50", () => {
    expect(riskScoreFromVolatility(0.20, 0.40)).toBe(50);
  });

  it("Persona max_volatility farklı (0.30) → orta nokta 50 vol 0.15", () => {
    expect(riskScoreFromVolatility(0.15, 0.30)).toBe(50);
  });

  it("null → null", () => {
    expect(riskScoreFromVolatility(null)).toBeNull();
  });
});

describe("longTermPerformanceScore", () => {
  it("vs_category_net_3y = 0 → 50 (medyan)", () => {
    expect(longTermPerformanceScore(0, null)).toBe(50);
  });

  it("vs_category_net_3y = +0.25 → 100", () => {
    expect(longTermPerformanceScore(0.25, null)).toBe(100);
  });

  it("vs_category_net_3y null → vs_category_3y (brüt) fallback", () => {
    expect(longTermPerformanceScore(null, 0.1)).toBe(70);
  });

  it("İkisi de null → null", () => {
    expect(longTermPerformanceScore(null, null)).toBeNull();
  });
});

describe("diversificationScore (investment_universe)", () => {
  it("BIST hisse → 30 (BIST yoğun)", () => {
    expect(diversificationScore("BIST_HISSE_TR")).toBe(30);
  });

  it("Altın → 80", () => {
    expect(diversificationScore("ALTIN")).toBe(80);
  });

  it("Çoklu varlık → 90 (en çeşitli)", () => {
    expect(diversificationScore("COKLU_VARLIK")).toBe(90);
  });

  it("Kira sertifikası FX → 78", () => {
    expect(diversificationScore("KIRA_SERTIFIKASI_FX")).toBe(78);
  });

  it("Bilinmeyen universe → null", () => {
    expect(diversificationScore("FOO")).toBeNull();
  });

  it("null → null", () => {
    expect(diversificationScore(null)).toBeNull();
  });
});

describe("bistDependencyScore", () => {
  it("Hesaplanmış korelasyon 0.8 → 80", () => {
    expect(bistDependencyScore(0.8, "ULUSLARARASI_HISSE")).toBe(80);
  });

  it("Korelasyon yok → universe default (BIST_HISSE_TR=100)", () => {
    expect(bistDependencyScore(null, "BIST_HISSE_TR")).toBe(100);
  });

  it("Korelasyon yok → ALTIN default 5", () => {
    expect(bistDependencyScore(null, "ALTIN")).toBe(5);
  });

  it("Negatif korelasyon clamp 0", () => {
    expect(bistDependencyScore(-0.3, "BIST_HISSE_TR")).toBe(0);
  });

  it("Korelasyon ve universe null → null", () => {
    expect(bistDependencyScore(null, null)).toBeNull();
  });
});

describe("goldDependencyScore", () => {
  it("ALTIN universe default → 100", () => {
    expect(goldDependencyScore(null, "ALTIN")).toBe(100);
  });

  it("KIYMETLI_MADEN_KARMA → 70", () => {
    expect(goldDependencyScore(null, "KIYMETLI_MADEN_KARMA")).toBe(70);
  });

  it("BIST hisse default → 0", () => {
    expect(goldDependencyScore(null, "BIST_HISSE_TR")).toBe(0);
  });

  it("Korelasyon override", () => {
    expect(goldDependencyScore(0.6, "BIST_HISSE_TR")).toBe(60);
  });
});

describe("computeMehmetScore", () => {
  it("Tüm bileşenler 70 olunca skor 70", () => {
    const r = computeMehmetScore(
      {
        inflation_protection_score: 70,
        tax_advantage_score: 70,
        normalized_risk_score: 70,
        long_term_performance_score: 70,
        diversification_score: 70,
      },
      mehmetPersona,
    );
    expect(r.score).toBe(70);
    expect(r.components_used).toBe(5);
    expect(r.warnings).toHaveLength(0);
  });

  it("Mehmet'in tipik HSYF fon senaryosu", () => {
    // HSYF + iyi enflasyon koruması + kabul edilebilir risk
    const r = computeMehmetScore(
      {
        inflation_protection_score: 80, // %15 reel
        tax_advantage_score: 100,       // HSYF
        normalized_risk_score: 55,      // ortalama risk
        long_term_performance_score: 75, // kategori üzeri
        diversification_score: 30,      // BIST yoğun
      },
      mehmetPersona,
    );
    // 0.25*80 + 0.20*100 + 0.20*55 + 0.20*75 + 0.15*30
    // = 20 + 20 + 11 + 15 + 4.5 = 70.5 → 71 (clamp/yuvarla)
    expect(r.score).toBe(71);
    expect(r.components_used).toBe(5);
  });

  it("Tek bileşen eksik → ağırlık normalize edilir + warning", () => {
    const r = computeMehmetScore(
      {
        inflation_protection_score: 80,
        tax_advantage_score: null,      // eksik
        normalized_risk_score: 60,
        long_term_performance_score: 70,
        diversification_score: 50,
      },
      mehmetPersona,
    );
    expect(r.warnings).toContain("missing_tax_advantage");
    expect(r.components_used).toBe(4);
    // weights normalize: 0.25/0.80 + 0.20/0.80 + 0.20/0.80 + 0.15/0.80
    // = 0.3125 + 0.25 + 0.25 + 0.1875 = 1.0
    // weighted: 0.3125*80 + 0.25*60 + 0.25*70 + 0.1875*50
    // = 25 + 15 + 17.5 + 9.375 = 66.875 → 67
    expect(r.score).toBe(67);
  });

  it("2 bileşen dolu (3'ten az) → null + insufficient_components warning", () => {
    const r = computeMehmetScore(
      {
        inflation_protection_score: 80,
        tax_advantage_score: 100,
        normalized_risk_score: null,
        long_term_performance_score: null,
        diversification_score: null,
      },
      mehmetPersona,
    );
    expect(r.score).toBeNull();
    expect(r.components_used).toBe(2);
    expect(r.warnings).toContain("insufficient_components");
  });

  it("3 bileşen dolu (min eşik) → skor üretilir", () => {
    const r = computeMehmetScore(
      {
        inflation_protection_score: 60,
        tax_advantage_score: 100,
        normalized_risk_score: 40,
        long_term_performance_score: null,
        diversification_score: null,
      },
      mehmetPersona,
    );
    expect(r.score).not.toBeNull();
    expect(r.components_used).toBe(3);
    // 0.25*60 + 0.20*100 + 0.20*40 = 15 + 20 + 8 = 43
    // available_weight = 0.65
    // normalized = 43/0.65 = 66.15 → 66
    expect(r.score).toBe(66);
  });

  it("Tüm bileşenler null → null + 5 warning + insufficient", () => {
    const r = computeMehmetScore(
      {
        inflation_protection_score: null,
        tax_advantage_score: null,
        normalized_risk_score: null,
        long_term_performance_score: null,
        diversification_score: null,
      },
      mehmetPersona,
    );
    expect(r.score).toBeNull();
    expect(r.components_used).toBe(0);
    expect(r.warnings).toContain("insufficient_components");
    expect(r.warnings.filter((w) => w.startsWith("missing_"))).toHaveLength(5);
  });

  it("Skor clamp(0,100): tüm bileşenler 100 → 100", () => {
    const r = computeMehmetScore(
      {
        inflation_protection_score: 100,
        tax_advantage_score: 100,
        normalized_risk_score: 100,
        long_term_performance_score: 100,
        diversification_score: 100,
      },
      mehmetPersona,
    );
    expect(r.score).toBe(100);
  });

  it("Tüm bileşenler 0 → skor 0", () => {
    const r = computeMehmetScore(
      {
        inflation_protection_score: 0,
        tax_advantage_score: 0,
        normalized_risk_score: 0,
        long_term_performance_score: 0,
        diversification_score: 0,
      },
      mehmetPersona,
    );
    expect(r.score).toBe(0);
  });
});

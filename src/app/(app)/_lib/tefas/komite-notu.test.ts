import { describe, expect, it } from "vitest";

import { generateKomiteNotu, type KomiteNotuInput } from "./komite-notu";

function base(overrides: Partial<KomiteNotuInput> = {}): KomiteNotuInput {
  return {
    fund_code: "TST",
    gross_3y_cagr: 0.30,
    net_1y: 0.40,
    real_1y: 0.10,
    vs_category_3y: 0.05,
    vs_category_net_3y: 0.04,
    applied_tax_kind: "HSYF_0_STOPAJ",
    applied_tax_rate: 0,
    tax_confidence: "HIGH",
    volatility_1y: 0.18,
    max_drawdown_3y: -0.20,
    normalized_risk_score: 55,
    bist_dependency_score: 100,
    gold_dependency_score: 0,
    investment_universe: "BIST_HISSE_TR",
    persona: { max_volatility_pct: 0.30 },
    ...overrides,
  };
}

describe("generateKomiteNotu", () => {
  it("HSYF + iyi performans + enflasyon koruması + makul risk", () => {
    const r = generateKomiteNotu(base());
    expect(r.is_sufficient).toBe(true);
    expect(r.text).toContain("TST");
    expect(r.text).toContain("HSYF");
    expect(r.text).toContain("reel");
    expect(r.text).toContain("BIST");
    // Disclaimer her zaman
    expect(r.text).toContain("yatırım tavsiyesi değildir");
  });

  it("Pozitif ve negatif clause'lar 'Ancak' ile ayrılır", () => {
    const r = generateKomiteNotu(base());
    expect(r.text).toContain("Ancak");
  });

  it("Yetersiz veri → kısa not + disclaimer", () => {
    const r = generateKomiteNotu(
      base({
        gross_3y_cagr: null,
        vs_category_3y: null,
        vs_category_net_3y: null,
        real_1y: null,
        applied_tax_kind: null,
        volatility_1y: null,
        bist_dependency_score: null,
        gold_dependency_score: null,
        max_drawdown_3y: null,
      }),
    );
    expect(r.is_sufficient).toBe(false);
    expect(r.text).toContain("yeterli geçmiş veri bulunmuyor");
    expect(r.text).toContain("yatırım tavsiyesi değildir");
  });

  it("net vs_category_3y öncelikli, yoksa brüt fallback", () => {
    const r1 = generateKomiteNotu(base({ vs_category_net_3y: 0.10, vs_category_3y: 0.01 }));
    expect(r1.text).toContain("+%10");
    const r2 = generateKomiteNotu(base({ vs_category_net_3y: null, vs_category_3y: 0.07 }));
    expect(r2.text).toContain("+%7");
  });

  it("Vol persona sınırını aşıyor → uyarı clause", () => {
    const r = generateKomiteNotu(
      base({ volatility_1y: 0.45, persona: { max_volatility_pct: 0.30 } }),
    );
    expect(r.text).toContain("persona sınırını");
    expect(r.text).toContain("%30");
  });

  it("Vol kabul edilebilir → pozitif clause", () => {
    const r = generateKomiteNotu(
      base({ volatility_1y: 0.15, persona: { max_volatility_pct: 0.30 } }),
    );
    expect(r.text).toContain("kabul edilebilir");
  });

  it("BIST yüksek, altın düşük → 'BIST bağımlılığı yüksek'", () => {
    const r = generateKomiteNotu(base({ bist_dependency_score: 100, gold_dependency_score: 0 }));
    expect(r.text).toContain("BIST bağımlılığı yüksek");
  });

  it("Altın yüksek, BIST düşük → 'altın bağımlılığı baskın'", () => {
    const r = generateKomiteNotu(base({ bist_dependency_score: 5, gold_dependency_score: 100 }));
    expect(r.text).toContain("altın bağımlılığı baskın");
  });

  it("BIST düşük + altın düşük → 'tek bir piyasaya bağımlı değil'", () => {
    const r = generateKomiteNotu(base({ bist_dependency_score: 10, gold_dependency_score: 10 }));
    expect(r.text).toContain("tek bir piyasaya bağımlı değil");
  });

  it("Enflasyon altında kalmış → uyarı", () => {
    const r = generateKomiteNotu(base({ real_1y: -0.10 }));
    expect(r.text).toContain("enflasyonun altında");
  });

  it("Max drawdown derin → uyarı clause", () => {
    const r = generateKomiteNotu(base({ max_drawdown_3y: -0.40 }));
    expect(r.text).toContain("derin");
  });

  it("Max drawdown küçük (>-10%) → drawdown clause atlanır", () => {
    const r = generateKomiteNotu(base({ max_drawdown_3y: -0.05 }));
    expect(r.text).not.toContain("düşüş");
    expect(r.clauses_used).not.toContain("drawdown");
  });

  it("Belirsiz stopaj → 'belirsiz' kelimesi", () => {
    const r = generateKomiteNotu(base({ applied_tax_kind: "BELIRSIZ" }));
    expect(r.text).toContain("belirsiz");
  });

  it("Asla 'öneri/al/sat/tavsiye' geçmez", () => {
    const r = generateKomiteNotu(base());
    expect(r.text.toLowerCase()).not.toMatch(/\b(öneri|tavsiye|satın al|sat)\b/);
  });
});

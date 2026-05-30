// Persona ağırlık doğrulama testleri — DB bağımsız.

import { describe, expect, it } from "vitest";

import type { UserPersona } from "./types";

function defaultPersona(overrides: Partial<UserPersona> = {}): UserPersona {
  return {
    id: "mehmet-uuid",
    user_id: null,
    name: "Mehmet Default",
    is_default: true,
    inflation_weight: 0.25,
    tax_weight: 0.20,
    risk_weight: 0.20,
    long_term_weight: 0.20,
    diversification_weight: 0.15,
    investment_horizon_years: 7,
    max_volatility_pct: 0.30,
    min_tax_confidence: "MEDIUM",
    notes: null,
    created_at: "2026-05-30T00:00:00Z",
    updated_at: "2026-05-30T00:00:00Z",
    ...overrides,
  };
}

function weightSum(p: UserPersona): number {
  return (
    p.inflation_weight +
    p.tax_weight +
    p.risk_weight +
    p.long_term_weight +
    p.diversification_weight
  );
}

describe("UserPersona ağırlıkları", () => {
  it("Mehmet Default toplamı 1.0", () => {
    const p = defaultPersona();
    expect(weightSum(p)).toBeCloseTo(1.0, 10);
  });

  it("Mehmet Default ağırlıkları kullanıcı kararlarıyla eşleşir", () => {
    const p = defaultPersona();
    expect(p.inflation_weight).toBe(0.25);
    expect(p.tax_weight).toBe(0.20);
    expect(p.risk_weight).toBe(0.20);
    expect(p.long_term_weight).toBe(0.20);
    expect(p.diversification_weight).toBe(0.15);
  });

  it("Mehmet profili: 47 yaş yatırımcı için 5-10 yıl vade", () => {
    const p = defaultPersona();
    expect(p.investment_horizon_years).toBe(7);
    expect(p.investment_horizon_years).toBeGreaterThanOrEqual(5);
    expect(p.investment_horizon_years).toBeLessThanOrEqual(10);
  });

  it("max_volatility yıllık %30 (Mehmet aşırı risk istemiyor)", () => {
    const p = defaultPersona();
    expect(p.max_volatility_pct).toBe(0.30);
  });

  it("min_tax_confidence MEDIUM (BELIRSIZ stopajlı fonlar filtrelenir)", () => {
    const p = defaultPersona();
    expect(p.min_tax_confidence).toBe("MEDIUM");
  });

  it("Sistem default: user_id null", () => {
    const p = defaultPersona();
    expect(p.user_id).toBeNull();
    expect(p.is_default).toBe(true);
  });

  it("Override edilebilir — örn. agresif Mehmet", () => {
    const agresif = defaultPersona({
      name: "Mehmet Agresif",
      risk_weight: 0.10,
      long_term_weight: 0.30,
      max_volatility_pct: 0.50,
    });
    expect(weightSum(agresif)).toBeCloseTo(1.0, 10);
    expect(agresif.max_volatility_pct).toBe(0.50);
  });
});

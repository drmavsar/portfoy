import { describe, expect, it } from "vitest";

import { validateFundTrade } from "./trade-validation";

const NOW = new Date("2026-05-31T12:00:00Z");

function ctx(overrides?: Partial<{ fundIsActive: boolean; currentHoldingQuantity: number }>) {
  return {
    now: NOW,
    fundIsActive: true,
    currentHoldingQuantity: 0,
    ...overrides,
  };
}

function input(overrides?: Partial<Parameters<typeof validateFundTrade>[0]>) {
  return {
    side: "buy" as const,
    quantity: 100,
    price: 2.345,
    fees: 0,
    taxes: 0,
    executed_at: "2026-05-30T10:00:00Z",
    ...overrides,
  };
}

describe("validateFundTrade — buy", () => {
  it("Geçerli buy → ok", () => {
    expect(validateFundTrade(input(), ctx())).toEqual({ ok: true });
  });

  it("Adet 0 → red", () => {
    const r = validateFundTrade(input({ quantity: 0 }), ctx());
    expect(r.ok).toBe(false);
  });

  it("Adet negatif → red", () => {
    const r = validateFundTrade(input({ quantity: -10 }), ctx());
    expect(r.ok).toBe(false);
  });

  it("Adet NaN → red", () => {
    const r = validateFundTrade(input({ quantity: Number.NaN }), ctx());
    expect(r.ok).toBe(false);
  });

  it("Fiyat 0 → red", () => {
    const r = validateFundTrade(input({ price: 0 }), ctx());
    expect(r.ok).toBe(false);
  });

  it("Fiyat negatif → red", () => {
    const r = validateFundTrade(input({ price: -1 }), ctx());
    expect(r.ok).toBe(false);
  });

  it("Fees negatif → red", () => {
    const r = validateFundTrade(input({ fees: -1 }), ctx());
    expect(r.ok).toBe(false);
  });

  it("Taxes negatif → red", () => {
    const r = validateFundTrade(input({ taxes: -1 }), ctx());
    expect(r.ok).toBe(false);
  });

  it("Fees 0 izinli", () => {
    expect(validateFundTrade(input({ fees: 0 }), ctx())).toEqual({ ok: true });
  });

  it("Gelecek tarih → red", () => {
    const r = validateFundTrade(
      input({ executed_at: "2026-06-15T10:00:00Z" }),
      ctx(),
    );
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.error).toMatch(/gelecek/i);
  });

  it("Bugün geçerli", () => {
    expect(
      validateFundTrade(input({ executed_at: NOW.toISOString() }), ctx()),
    ).toEqual({ ok: true });
  });

  it("Geçersiz tarih string → red", () => {
    const r = validateFundTrade(input({ executed_at: "not-a-date" }), ctx());
    expect(r.ok).toBe(false);
  });

  it("Inactive fund → red", () => {
    const r = validateFundTrade(input(), ctx({ fundIsActive: false }));
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.error).toMatch(/aktif değil/i);
  });
});

describe("validateFundTrade — sell", () => {
  it("Sufficient position → ok", () => {
    const r = validateFundTrade(
      input({ side: "sell", quantity: 50 }),
      ctx({ currentHoldingQuantity: 100 }),
    );
    expect(r).toEqual({ ok: true });
  });

  it("Tüm pozisyonu sat → ok", () => {
    const r = validateFundTrade(
      input({ side: "sell", quantity: 100 }),
      ctx({ currentHoldingQuantity: 100 }),
    );
    expect(r).toEqual({ ok: true });
  });

  it("Pozisyon yok → red", () => {
    const r = validateFundTrade(
      input({ side: "sell", quantity: 10 }),
      ctx({ currentHoldingQuantity: 0 }),
    );
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.error).toMatch(/pozisyon yok/i);
  });

  it("Pozisyon yetersiz → red", () => {
    const r = validateFundTrade(
      input({ side: "sell", quantity: 150 }),
      ctx({ currentHoldingQuantity: 100 }),
    );
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.error).toMatch(/mevcut pozisyondan büyük/i);
  });

  it("Epsilon toleransı: 100.000000001 ≈ 100 → ok", () => {
    const r = validateFundTrade(
      input({ side: "sell", quantity: 100.000000001 }),
      ctx({ currentHoldingQuantity: 100 }),
    );
    expect(r).toEqual({ ok: true });
  });
});

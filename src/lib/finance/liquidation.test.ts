import { describe, expect, it } from "vitest";

import { BILEZIK_ISCILIK, bidRatiosFromQuotes, liquidationSummary } from "./liquidation";

describe("bidRatiosFromQuotes", () => {
  it("alış/satış oranı; bilezikte işçilik düşülür, ons gramı izler", () => {
    const r = bidRatiosFromQuotes({
      XAU: { buying: 6840, selling: 6908 },
      CEYREK: { buying: 11_050, selling: 11_368 },
      USD: { buying: 49.1, selling: 49.2 },
    });
    expect(r.XAU).toBeCloseTo(6840 / 6908, 9);
    expect(r.CEYREK).toBeCloseTo(11_050 / 11_368, 9);
    expect(r.XAU_OZ).toBe(r.XAU);
    expect(r.BILEZIK22).toBeCloseTo(6840 / 6908 / BILEZIK_ISCILIK, 9);
  });

  it("alışı olmayan, ters (alış > satış) ya da uçuk oranlar atlanır", () => {
    const r = bidRatiosFromQuotes({
      XAU: { buying: null, selling: 6908 },
      USD: { buying: 50, selling: 49 },
      EUR: { buying: 20, selling: 55 },
    });
    expect(r).toEqual({});
  });
});

describe("liquidationSummary", () => {
  it("para birimine göre toplar, bozdurma farkını hesaplar", () => {
    const s = liquidationSummary(
      [
        { currency: "CEYREK", native: 6 },
        { currency: "CEYREK", native: 2 },
        { currency: "USD", native: 10_000 },
        { currency: "XAG", native: 100 }, // oranı yok
      ],
      { CEYREK: 11_368, USD: 49.2, XAG: 80 },
      { CEYREK: 11_050 / 11_368, USD: 49.1 / 49.2 },
    );
    expect(s.lines.map((l) => l.currency)).toEqual(["USD", "CEYREK", "XAG"]);
    const ceyrek = s.lines.find((l) => l.currency === "CEYREK")!;
    expect(ceyrek.native).toBe(8);
    expect(ceyrek.bidValueTry).toBeCloseTo(8 * 11_050, 6);
    expect(s.haircutTry).toBeCloseTo(8 * (11_050 - 11_368) + 10_000 * (49.1 - 49.2), 6);
    expect(s.unknown).toBe(1);
    // Oranı bilinmeyen satır bozdurma toplamına değeriyle girer
    expect(s.bidValueTry).toBeCloseTo(8 * 11_050 + 10_000 * 49.1 + 100 * 80, 6);
  });
});

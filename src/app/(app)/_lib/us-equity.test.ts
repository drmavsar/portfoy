import { afterEach, describe, expect, it, vi } from "vitest";

import { fetchTradingViewUsQuotes, usTickerCandidates } from "./tradingview-quotes";
import { formatNative, isEquity, nativeCostByHolding, toTryQuote, type QuoteLike } from "./us-equity";

describe("toTryQuote", () => {
  const usd: QuoteLike = { symbol: "NVDA", price: 170, previous_close: 160, change_pct: 6.25, currency: "USD" };

  it("fiyat güncel kurla, önceki kapanış dünkü kurla çevrilir", () => {
    // USD/TRY bugün %1 yükselmiş: dünkü kur = 50,5 / 1,01 = 50
    const q = toTryQuote(usd, 50.5, 1);
    expect(q.price).toBeCloseTo(170 * 50.5, 6);
    expect(q.previous_close).toBeCloseTo(160 * 50, 6);
    expect(q.currency).toBe("TRY");
    // TL değişim = (1 + hisse) × (1 + kur) − 1 = 1,0625 × 1,01 − 1
    expect(q.change_pct).toBeCloseTo((1.0625 * 1.01 - 1) * 100, 6);
    expect(q.native).toEqual({
      currency: "USD",
      price: 170,
      previous_close: 160,
      change_pct: 6.25,
      fx: 50.5,
      prev_fx: 50,
    });
  });

  it("kur değişimi bilinmiyorsa kur sabit sayılır; önceki kapanış yoksa değişim yok", () => {
    const q = toTryQuote(usd, 50, null);
    expect(q.previous_close).toBeCloseTo(160 * 50, 6);
    expect(q.change_pct).toBeCloseTo(6.25, 6);
    const noPrev = toTryQuote({ ...usd, previous_close: null }, 50, 0.2);
    expect(noPrev.previous_close).toBeNull();
    expect(noPrev.change_pct).toBeNull();
  });
});

describe("nativeCostByHolding", () => {
  const base = { portfolio_id: "p", asset_id: "a", currency: "USD" };

  it("ortalama maliyet: alışlar toplanır, satış ortalamadan düşülür, komisyon maliyete eklenir", () => {
    const m = nativeCostByHolding([
      { ...base, side: "buy", executed_at: "2026-11-16", quantity: "4.777", price: "162", fees: "0" },
      { ...base, side: "buy", executed_at: "2026-11-20", quantity: 2, price: 150, fees: 1 },
      { ...base, side: "sell", executed_at: "2026-11-25", quantity: 1, price: 200 },
    ]);
    const cost = 4.777 * 162 + 2 * 150 + 1;
    const qty = 6.777;
    expect(m.get("p|a")?.quantity).toBeCloseTo(qty - 1, 9);
    expect(m.get("p|a")?.cost).toBeCloseTo(cost - cost / qty, 6);
    expect(m.get("p|a")?.currency).toBe("USD");
  });

  it("TL işlemler, karışık para birimi ve kapanmış pozisyon atlanır", () => {
    const m = nativeCostByHolding([
      { ...base, asset_id: "tl", currency: "TRY", side: "buy", executed_at: "2026-01-01", quantity: 1, price: 10 },
      { ...base, asset_id: "mix", side: "buy", executed_at: "2026-01-01", quantity: 1, price: 10 },
      { ...base, asset_id: "mix", currency: "TRY", side: "buy", executed_at: "2026-01-02", quantity: 1, price: 10 },
      { ...base, asset_id: "closed", side: "buy", executed_at: "2026-01-01", quantity: 2, price: 10 },
      { ...base, asset_id: "closed", side: "sell", executed_at: "2026-01-02", quantity: 2, price: 12 },
    ]);
    expect([...m.keys()]).toEqual([]);
  });
});

describe("yardımcılar", () => {
  it("isEquity", () => {
    expect(isEquity("equity_tr")).toBe(true);
    expect(isEquity("equity_us")).toBe(true);
    expect(isEquity("fund")).toBe(false);
    expect(isEquity(undefined)).toBe(false);
  });
  it("formatNative", () => {
    expect(formatNative(773.874, "USD")).toBe("$773,87");
    expect(formatNative(-1234.5, "USD")).toBe("−$1.234,50");
    expect(formatNative(10, "CHF")).toBe("CHF 10,00");
  });
  it("usTickerCandidates: tercih edilen borsa önce, bilinmiyorsa NASDAQ/NYSE/AMEX", () => {
    expect(usTickerCandidates("nvda", "NASDAQ")).toEqual(["NASDAQ:NVDA", "NYSE:NVDA", "AMEX:NVDA"]);
    expect(usTickerCandidates("KO", "nyse")).toEqual(["NYSE:KO", "NASDAQ:KO", "AMEX:KO"]);
    expect(usTickerCandidates("XYZ", null)).toEqual(["NASDAQ:XYZ", "NYSE:XYZ", "AMEX:XYZ"]);
  });
});

describe("fetchTradingViewUsQuotes", () => {
  afterEach(() => vi.unstubAllGlobals());

  it("america taramasına tüm aday ticker'ları sorar; sembol başına ilk bulunanı alır", async () => {
    const fetchMock = vi.fn(async (_url: string, init: { body: string }) => {
      const body = JSON.parse(init.body) as { symbols: { tickers: string[] } };
      expect(body.symbols.tickers).toEqual(
        expect.arrayContaining(["NASDAQ:NVDA", "NYSE:NVDA", "AMEX:NVDA", "NYSE:KO"]),
      );
      return new Response(
        JSON.stringify({
          data: [
            { s: "NASDAQ:NVDA", d: [170.5, 1.2, 2.02, 168] },
            { s: "NYSE:KO", d: [62.1, -0.5, -0.31, 62.4] },
          ],
        }),
        { status: 200 },
      );
    });
    vi.stubGlobal("fetch", fetchMock);
    const q = await fetchTradingViewUsQuotes([
      { symbol: "NVDA", exchange: "NASDAQ" },
      { symbol: "KO", exchange: null },
    ]);
    expect(fetchMock.mock.calls[0][0]).toBe("https://scanner.tradingview.com/america/scan");
    expect(q.NVDA).toMatchObject({ close: 170.5, changePct: 1.2, changeAbs: 2.02 });
    expect(q.KO).toMatchObject({ close: 62.1 });
  });

  it("erişilemezse boş harita", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => new Response("", { status: 503 })));
    expect(await fetchTradingViewUsQuotes([{ symbol: "NVDA" }])).toEqual({});
  });
});

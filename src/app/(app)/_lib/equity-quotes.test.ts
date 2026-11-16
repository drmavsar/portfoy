import { afterEach, describe, expect, it, vi } from "vitest";

// getEquityQuotes kur için asset-rates'e gider (Supabase/Truncgil); burada sabitlenir.
vi.mock("./asset-rates", () => ({
  getAssetRates: vi.fn(async () => ({ USD: 50.5 })),
  getAssetChanges: vi.fn(async () => ({ USD: 1 })),
}));

import { getEquityQuotes } from "./stock-prices";

describe("getEquityQuotes", () => {
  afterEach(() => vi.unstubAllGlobals());

  it("BIST TL kalır, ABD fiyatı canlı kurla TL'ye çevrilir ve dolar değerleri native'de taşınır", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async (url: string) => {
        if (url.endsWith("/turkey/scan")) {
          return new Response(JSON.stringify({ data: [{ s: "BIST:THYAO", d: [300, 2, 5.88, 295] }] }), { status: 200 });
        }
        if (url.endsWith("/america/scan")) {
          return new Response(JSON.stringify({ data: [{ s: "NASDAQ:NVDA", d: [170, 6.25, 10, 165] }] }), { status: 200 });
        }
        return new Response("", { status: 404 });
      }),
    );
    const q = await getEquityQuotes([
      { symbol: "THYAO", asset_class: "equity_tr" },
      { symbol: "NVDA", asset_class: "equity_us", exchange: "NASDAQ" },
      { symbol: "TTE", asset_class: "fund" },
    ]);
    expect(Object.keys(q).sort()).toEqual(["NVDA", "THYAO"]);
    expect(q.THYAO).toMatchObject({ price: 300, currency: "TRY" });
    expect(q.THYAO.native).toBeUndefined();
    expect(q.NVDA.price).toBeCloseTo(170 * 50.5, 6);
    expect(q.NVDA.previous_close).toBeCloseTo(160 * 50, 6);
    expect(q.NVDA.currency).toBe("TRY");
    expect(q.NVDA.native).toMatchObject({ currency: "USD", price: 170, previous_close: 160, fx: 50.5 });
  });

  it("ABD fiyatı TradingView'de yoksa Yahoo'ya düz ticker ile sorulur", async () => {
    const urls: string[] = [];
    vi.stubGlobal(
      "fetch",
      vi.fn(async (url: string) => {
        urls.push(url);
        if (url.includes("scanner.tradingview.com")) return new Response(JSON.stringify({ data: [] }), { status: 200 });
        return new Response(
          JSON.stringify({
            chart: {
              result: [
                {
                  meta: { regularMarketPrice: 171, previousClose: 170, currency: "USD", regularMarketTime: 1_794_700_000 },
                  timestamp: [],
                  indicators: { quote: [{ close: [] }] },
                },
              ],
            },
          }),
          { status: 200 },
        );
      }),
    );
    const q = await getEquityQuotes([{ symbol: "NVDA", asset_class: "equity_us", exchange: "NASDAQ" }]);
    expect(urls.some((u) => u.includes("/v8/finance/chart/NVDA?"))).toBe(true);
    expect(q.NVDA.native).toMatchObject({ currency: "USD", price: 171, previous_close: 170 });
    expect(q.NVDA.price).toBeCloseTo(171 * 50.5, 6);
  });
});

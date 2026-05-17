"use server";

// BIST hisse fiyatları — Yahoo Finance public endpoint
// URL: https://query1.finance.yahoo.com/v8/finance/chart/<TICKER>.IS
// Cache 5 dk (revalidate). Yahoo halka açık ama nazikçe kullanılmalı.

export interface StockQuote {
  symbol: string;
  price: number;
  previous_close: number | null;
  change_pct: number | null;
  currency: string;
  source: "yahoo" | "fallback";
  market_time: number | null; // unix epoch (saniye)
}

interface YahooChartResponse {
  chart?: {
    result?: Array<{
      meta?: {
        symbol?: string;
        regularMarketPrice?: number;
        chartPreviousClose?: number;
        previousClose?: number;
        currency?: string;
        regularMarketTime?: number;
      };
    }>;
    error?: { code: string; description: string } | null;
  };
}

function asYahooSymbol(symbol: string): string {
  // BIST tickers Yahoo'da SYMBOL.IS biçiminde
  return `${symbol}.IS`;
}

async function fetchOne(symbol: string): Promise<StockQuote | null> {
  // range=2d → sadece dün + bugün. previousClose alanı T-1 kapanışı verir.
  const url = `https://query1.finance.yahoo.com/v8/finance/chart/${asYahooSymbol(symbol)}?interval=1d&range=2d`;
  try {
    const res = await fetch(url, {
      next: { revalidate: 300 },
      headers: { "User-Agent": "Mozilla/5.0 (compatible; MehmetsAssets/1.0)" },
    });
    if (!res.ok) return null;
    const json = (await res.json()) as YahooChartResponse;
    const meta = json.chart?.result?.[0]?.meta;
    if (!meta?.regularMarketPrice) return null;
    const price = meta.regularMarketPrice;
    // previousClose = T-1 günün kapanışı (doğru günlük baz)
    // chartPreviousClose = range başlangıcındaki kapanış (range=2d için yine T-1 ama tek başına previousClose öncelikli)
    const prevClose = meta.previousClose ?? meta.chartPreviousClose ?? null;
    const changePct = prevClose ? ((price - prevClose) / prevClose) * 100 : null;
    return {
      symbol,
      price,
      previous_close: prevClose,
      change_pct: changePct,
      currency: meta.currency ?? "TRY",
      source: "yahoo",
      market_time: meta.regularMarketTime ?? null,
    };
  } catch (err) {
    console.error("fetchOne", symbol, err);
    return null;
  }
}

/** Birden çok BIST sembolü için anlık fiyatları paralel çek. */
export async function getStockPrices(symbols: string[]): Promise<Record<string, StockQuote>> {
  if (symbols.length === 0) return {};
  const unique = Array.from(new Set(symbols));
  const results = await Promise.all(unique.map(fetchOne));
  const out: Record<string, StockQuote> = {};
  for (const r of results) {
    if (r) out[r.symbol] = r;
  }
  return out;
}

export interface StockQuoteExt extends StockQuote {
  week_change_pct: number | null;
  month_change_pct: number | null;
}

async function fetchOneExt(symbol: string): Promise<StockQuoteExt | null> {
  const url = `https://query1.finance.yahoo.com/v8/finance/chart/${asYahooSymbol(symbol)}?interval=1d&range=3mo`;
  try {
    const res = await fetch(url, {
      next: { revalidate: 600 },
      headers: { "User-Agent": "Mozilla/5.0 (compatible; MehmetsAssets/1.0)" },
    });
    if (!res.ok) return null;
    const json = (await res.json()) as {
      chart?: {
        result?: Array<{
          meta?: {
            regularMarketPrice?: number;
            chartPreviousClose?: number;
            previousClose?: number;
            currency?: string;
            regularMarketTime?: number;
          };
          indicators?: { quote?: Array<{ close?: Array<number | null> }> };
        }>;
      };
    };
    const r = json.chart?.result?.[0];
    const meta = r?.meta;
    if (!meta?.regularMarketPrice) return null;
    const price = meta.regularMarketPrice;
    // T-1 günü kapanışı için previousClose öncelik (range=3mo'da chartPreviousClose 3 ay öncesi olur)
    const prevClose = meta.previousClose ?? meta.chartPreviousClose ?? null;
    const changePct = prevClose ? ((price - prevClose) / prevClose) * 100 : null;

    const closes = (r?.indicators?.quote?.[0]?.close ?? [])
      .filter((x): x is number => typeof x === "number" && Number.isFinite(x));
    const closeAtBack = (n: number) => (closes.length > n ? closes[closes.length - 1 - n] : null);
    const week5 = closeAtBack(5); // 5 trading days ≈ 1 week
    const month22 = closeAtBack(22); // 22 trading days ≈ 1 month
    const weekChg = week5 && week5 > 0 ? ((price - week5) / week5) * 100 : null;
    const monthChg = month22 && month22 > 0 ? ((price - month22) / month22) * 100 : null;

    return {
      symbol,
      price,
      previous_close: prevClose,
      change_pct: changePct,
      currency: meta.currency ?? "TRY",
      source: "yahoo",
      market_time: meta.regularMarketTime ?? null,
      week_change_pct: weekChg,
      month_change_pct: monthChg,
    };
  } catch {
    return null;
  }
}

export async function getStockPricesExtended(
  symbols: string[],
): Promise<Record<string, StockQuoteExt>> {
  if (symbols.length === 0) return {};
  const unique = Array.from(new Set(symbols));
  const results = await Promise.all(unique.map(fetchOneExt));
  const out: Record<string, StockQuoteExt> = {};
  for (const r of results) if (r) out[r.symbol] = r;
  return out;
}

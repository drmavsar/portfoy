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
      indicators?: { quote?: Array<{ close?: Array<number | null> }> };
    }>;
    error?: { code: string; description: string } | null;
  };
}

function asYahooSymbol(symbol: string): string {
  // BIST tickers Yahoo'da SYMBOL.IS biçiminde
  return `${symbol}.IS`;
}

/**
 * `previousClose` Yahoo'da bedelli/split sonrası bazen DÜZELTILMEMIŞ döner;
 * `closes` array ise düzeltilmiş seridir. Tutarlılık için günlük baz olarak
 * düzeltilmiş kapanış serisini kullan: piyasa açıksa son close = dün; kapalıysa
 * son close = bugün ⇒ bir öncesi dün.
 */
function priorCloseFromSeries(price: number, closes: number[]): number | null {
  if (closes.length === 0) return null;
  const last = closes[closes.length - 1];
  // last ≈ price → piyasa kapalı, "last" bugünün kapanışıdır; T-1 = closes[-2]
  if (last > 0 && Math.abs(last - price) / price < 0.005) {
    return closes.length >= 2 ? closes[closes.length - 2] : null;
  }
  // aksi halde "last" dünün kapanışıdır (piyasa açık)
  return last;
}

async function fetchOne(symbol: string): Promise<StockQuote | null> {
  // range=5d → son birkaç işlem günü kapanışları (düzeltilmiş seri için)
  const url = `https://query1.finance.yahoo.com/v8/finance/chart/${asYahooSymbol(symbol)}?interval=1d&range=5d`;
  try {
    const res = await fetch(url, {
      next: { revalidate: 300, tags: ["stock-prices"] },
      headers: { "User-Agent": "Mozilla/5.0 (compatible; MehmetsAssets/1.0)" },
    });
    if (!res.ok) return null;
    const json = (await res.json()) as YahooChartResponse;
    const r = json.chart?.result?.[0];
    const meta = r?.meta;
    if (!meta?.regularMarketPrice) return null;
    const price = meta.regularMarketPrice;
    const closes = (r?.indicators?.quote?.[0]?.close ?? [])
      .filter((x): x is number => typeof x === "number" && Number.isFinite(x));
    // düzeltilmiş seriden hesap: split/bedelli sonrası previousClose alanı yanlış olabilir
    const prevClose = priorCloseFromSeries(price, closes)
      ?? meta.previousClose
      ?? meta.chartPreviousClose
      ?? null;
    const changePct = prevClose && prevClose > 0 ? ((price - prevClose) / prevClose) * 100 : null;
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
      next: { revalidate: 600, tags: ["stock-prices"] },
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
    const closes = (r?.indicators?.quote?.[0]?.close ?? [])
      .filter((x): x is number => typeof x === "number" && Number.isFinite(x));

    // Tüm period'lar aynı düzeltilmiş seriden hesaplanır — split/bedelli sonrası
    // Yahoo'nun previousClose alanı yanlış olabildiği için (günlük >> haftalık
    // çelişkilerini engellemek üzere) closes array tek hakikat.
    const prevClose = priorCloseFromSeries(price, closes)
      ?? meta.previousClose
      ?? meta.chartPreviousClose
      ?? null;
    const changePct = prevClose && prevClose > 0 ? ((price - prevClose) / prevClose) * 100 : null;

    // closes son elemanı bugünün kapanışı mı yoksa dünün mü?
    const lastIsToday = closes.length > 0 && Math.abs(closes[closes.length - 1] - price) / price < 0.005;
    const offset = lastIsToday ? 0 : 1; // piyasa açıksa "1 gün önce" closes[length-1]
    const closeAtBack = (n: number) => {
      const idx = closes.length - 1 - n + offset;
      return idx >= 0 && idx < closes.length ? closes[idx] : null;
    };
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

// ============================================================
// Teknik göstergeler — pozisyon planı için ATR14, 52W high, MA20/50
// ============================================================

export interface StockTechnicals {
  symbol: string;
  price: number;
  atr14: number | null;
  high_52w: number | null;
  low_52w: number | null;
  ma20: number | null;
  ma50: number | null;
}

function computeATR14(highs: number[], lows: number[], closes: number[]): number | null {
  if (highs.length < 15 || lows.length < 15 || closes.length < 15) return null;
  const trs: number[] = [];
  for (let i = 1; i < closes.length; i++) {
    const h = highs[i];
    const l = lows[i];
    const prevC = closes[i - 1];
    const tr = Math.max(h - l, Math.abs(h - prevC), Math.abs(l - prevC));
    trs.push(tr);
  }
  if (trs.length < 14) return null;
  // Wilder smoothing: ATR_t = (ATR_{t-1} * 13 + TR_t) / 14
  let atr = trs.slice(0, 14).reduce((s, v) => s + v, 0) / 14;
  for (let i = 14; i < trs.length; i++) {
    atr = (atr * 13 + trs[i]) / 14;
  }
  return Number.isFinite(atr) && atr > 0 ? atr : null;
}

function lastSMA(values: number[], period: number): number | null {
  if (values.length < period) return null;
  const slice = values.slice(-period);
  const sum = slice.reduce((s, v) => s + v, 0);
  return sum / period;
}

async function fetchTechnicals(symbol: string): Promise<StockTechnicals | null> {
  // range=1y → 52W high + ATR + MA hesabı için yeterli
  const url = `https://query1.finance.yahoo.com/v8/finance/chart/${asYahooSymbol(symbol)}?interval=1d&range=1y`;
  try {
    const res = await fetch(url, {
      next: { revalidate: 900, tags: ["stock-prices"] },
      headers: { "User-Agent": "Mozilla/5.0 (compatible; MehmetsAssets/1.0)" },
    });
    if (!res.ok) return null;
    const json = (await res.json()) as {
      chart?: {
        result?: Array<{
          meta?: { regularMarketPrice?: number };
          indicators?: {
            quote?: Array<{
              high?: Array<number | null>;
              low?: Array<number | null>;
              close?: Array<number | null>;
            }>;
          };
        }>;
      };
    };
    const r = json.chart?.result?.[0];
    const price = r?.meta?.regularMarketPrice;
    if (!price) return null;
    const q = r?.indicators?.quote?.[0];
    if (!q) return null;
    const filter = (a: Array<number | null> | undefined) =>
      (a ?? []).filter((x): x is number => typeof x === "number" && Number.isFinite(x));
    const highs = filter(q.high);
    const lows = filter(q.low);
    const closes = filter(q.close);
    const atr14 = computeATR14(highs, lows, closes);
    const high_52w = highs.length > 0 ? Math.max(...highs) : null;
    const low_52w = lows.length > 0 ? Math.min(...lows) : null;
    const ma20 = lastSMA(closes, 20);
    const ma50 = lastSMA(closes, 50);
    return { symbol, price, atr14, high_52w, low_52w, ma20, ma50 };
  } catch {
    return null;
  }
}

export async function getStockTechnicals(
  symbols: string[],
): Promise<Record<string, StockTechnicals>> {
  if (symbols.length === 0) return {};
  const unique = Array.from(new Set(symbols));
  const results = await Promise.all(unique.map(fetchTechnicals));
  const out: Record<string, StockTechnicals> = {};
  for (const r of results) if (r) out[r.symbol] = r;
  return out;
}

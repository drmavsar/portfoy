"use server";

// BIST hisse fiyatları — Yahoo Finance public endpoint
// URL: https://query1.finance.yahoo.com/v8/finance/chart/<TICKER>.IS
// Cache 5 dk (revalidate). Yahoo halka açık ama nazikçe kullanılmalı.

import { buildBars, priorCloseFromBars, utcDate } from "./stock-prices-util";
import { fetchTradingViewQuotes, fetchTradingViewQuotesExtended } from "./tradingview-quotes";

export interface StockQuote {
  symbol: string;
  price: number;
  previous_close: number | null;
  change_pct: number | null;
  currency: string;
  source: "yahoo" | "fallback" | "tefas" | "tradingview";
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
      timestamp?: number[];
      indicators?: { quote?: Array<{ close?: Array<number | null> }> };
    }>;
    error?: { code: string; description: string } | null;
  };
}

function asYahooSymbol(symbol: string): string {
  // BIST tickers Yahoo'da SYMBOL.IS biçiminde
  return `${symbol}.IS`;
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
    // Düzeltilmiş kapanış serisinden tarih bazlı önceki kapanış (split/bedelli
    // sonrası previousClose alanı yanlış olabilir; array tek hakikat).
    const bars = buildBars(r?.timestamp ?? [], r?.indicators?.quote?.[0]?.close ?? []);
    const prevClose = priorCloseFromBars(bars, meta.regularMarketTime ?? null)
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

/**
 * Birden çok BIST sembolü için anlık fiyat.
 *
 * Birincil kaynak TradingView scanner (tek toplu istek, günlük değişimi doğru
 * hesaplar). Yahoo yalnızca TradingView'in döndürmediği semboller için yedek —
 * Yahoo'nun BIST serisi seans içinde eksik mum + HTTP 429 sorunları yüzünden
 * günlük %'yi bozuyordu.
 */
export async function getStockPrices(symbols: string[]): Promise<Record<string, StockQuote>> {
  if (symbols.length === 0) return {};
  const unique = Array.from(new Set(symbols));
  const out: Record<string, StockQuote> = {};

  const tv = await fetchTradingViewQuotes(unique);
  const missing: string[] = [];
  for (const sym of unique) {
    const q = tv[sym.toUpperCase()];
    if (q) {
      const prev = q.changeAbs != null ? q.close - q.changeAbs : null;
      out[sym] = {
        symbol: sym,
        price: q.close,
        previous_close: prev != null && prev > 0 ? prev : null,
        change_pct: q.changePct,
        currency: "TRY",
        source: "tradingview",
        market_time: null,
      };
    } else {
      missing.push(sym);
    }
  }

  // Yedek: TradingView'de bulunmayan semboller için Yahoo.
  if (missing.length > 0) {
    const results = await Promise.all(missing.map(fetchOne));
    for (const r of results) {
      if (r) out[r.symbol] = r;
    }
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
          timestamp?: number[];
          indicators?: { quote?: Array<{ close?: Array<number | null> }> };
        }>;
      };
    };
    const r = json.chart?.result?.[0];
    const meta = r?.meta;
    if (!meta?.regularMarketPrice) return null;
    const price = meta.regularMarketPrice;

    // Tüm period'lar aynı düzeltilmiş seriden hesaplanır — split/bedelli sonrası
    // Yahoo'nun previousClose alanı yanlış olabildiği için closes array tek hakikat.
    const bars = buildBars(r?.timestamp ?? [], r?.indicators?.quote?.[0]?.close ?? []);
    const prevClose = priorCloseFromBars(bars, meta.regularMarketTime ?? null)
      ?? meta.previousClose
      ?? meta.chartPreviousClose
      ?? null;
    const changePct = prevClose && prevClose > 0 ? ((price - prevClose) / prevClose) * 100 : null;

    // Bugünün (canlı) mumu tarih bazında var mı? Hafta/ay bazını buna göre kaydır.
    const curDate = meta.regularMarketTime != null ? utcDate(meta.regularMarketTime) : bars[bars.length - 1]?.date;
    const hasToday = bars.length > 0 && bars[bars.length - 1].date === curDate;
    const todayIdx = hasToday ? bars.length - 1 : bars.length; // bugün yoksa sanal indeks
    const baseAt = (n: number) => {
      const idx = todayIdx - n;
      return idx >= 0 && idx < bars.length ? bars[idx].close : null;
    };
    const week5 = baseAt(5); // 5 trading days ≈ 1 week
    const month22 = baseAt(22); // 22 trading days ≈ 1 month
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
  const out: Record<string, StockQuoteExt> = {};

  // Birincil: TradingView scanner — tüm semboller tek istekte (Radar ~100 sembol
  // çekebiliyor; Yahoo'da bu 10'arlı batch + rate limit demekti). Günlük değişim
  // ve haftalık/aylık performans doğrudan gelir.
  const tv = await fetchTradingViewQuotesExtended(unique);
  const missing: string[] = [];
  for (const sym of unique) {
    const q = tv[sym.toUpperCase()];
    if (q) {
      const prev = q.changeAbs != null ? q.close - q.changeAbs : null;
      out[sym] = {
        symbol: sym,
        price: q.close,
        previous_close: prev != null && prev > 0 ? prev : null,
        change_pct: q.changePct,
        currency: "TRY",
        source: "tradingview",
        market_time: null,
        week_change_pct: q.weekPct,
        month_change_pct: q.monthPct,
      };
    } else {
      missing.push(sym);
    }
  }

  // Yedek: TradingView'de bulunmayan semboller için Yahoo (10'arlı batch).
  for (let i = 0; i < missing.length; i += 10) {
    const batch = missing.slice(i, i + 10);
    const results = await Promise.all(batch.map(fetchOneExt));
    for (const r of results) if (r) out[r.symbol] = r;
  }
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

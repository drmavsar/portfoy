"use server";

// Hisse fiyatları — BIST (TRY) ve ABD (USD → canlı kurla TRY).
// Birincil kaynak TradingView scanner; yedek Yahoo Finance public endpoint
// (BIST: <TICKER>.IS, ABD: <TICKER>). Cache 5 dk (revalidate).

import { getAssetChanges, getAssetRates } from "./asset-rates";
import { buildBars, priorCloseFromBars, utcDate } from "./stock-prices-util";
import { fetchTradingViewQuotes, fetchTradingViewQuotesExtended, fetchTradingViewUsQuotes } from "./tradingview-quotes";
import { toTryQuote, type NativeQuote } from "./us-equity";

export interface StockQuote {
  symbol: string;
  price: number;
  previous_close: number | null;
  change_pct: number | null;
  currency: string;
  source: "yahoo" | "fallback" | "tefas" | "tradingview";
  market_time: number | null; // unix epoch (saniye)
  /** ABD hissesi: kendi para birimindeki (USD) fiyat ve çevrim kurları. Fiyat alanları TL'dir. */
  native?: NativeQuote;
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

async function fetchOne(symbol: string, yahooSymbol: string = asYahooSymbol(symbol)): Promise<StockQuote | null> {
  // range=5d → son birkaç işlem günü kapanışları (düzeltilmiş seri için)
  const url = `https://query1.finance.yahoo.com/v8/finance/chart/${encodeURIComponent(yahooSymbol)}?interval=1d&range=5d`;
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
    const results = await Promise.all(missing.map((sym) => fetchOne(sym)));
    for (const r of results) {
      if (r) out[r.symbol] = r;
    }
  }

  return out;
}

export interface EquityRef {
  symbol: string;
  asset_class: string;
  exchange?: string | null;
}

/**
 * ABD hisseleri için anlık fiyat — USD. TradingView "america" taraması
 * (NASDAQ/NYSE/AMEX), bulunamayanlar için Yahoo (ticker olduğu gibi).
 */
export async function getUsStockPrices(items: Array<{ symbol: string; exchange?: string | null }>): Promise<Record<string, StockQuote>> {
  if (items.length === 0) return {};
  const out: Record<string, StockQuote> = {};
  const tv = await fetchTradingViewUsQuotes(items);
  const missing: string[] = [];
  for (const it of items) {
    const sym = it.symbol.toUpperCase();
    const q = tv[sym];
    if (q) {
      const prev = q.changeAbs != null ? q.close - q.changeAbs : null;
      out[it.symbol] = {
        symbol: it.symbol,
        price: q.close,
        previous_close: prev != null && prev > 0 ? prev : null,
        change_pct: q.changePct,
        currency: "USD",
        source: "tradingview",
        market_time: null,
      };
    } else if (!missing.includes(it.symbol)) {
      missing.push(it.symbol);
    }
  }
  if (missing.length > 0) {
    const results = await Promise.all(missing.map((s) => fetchOne(s, s.toUpperCase())));
    for (const r of results) if (r) out[r.symbol] = { ...r, currency: r.currency || "USD" };
  }
  return out;
}

/**
 * Hisse kotasyonları — BIST ve ABD birlikte, hepsi TL. ABD fiyatı canlı
 * USD/TRY ile çevrilir; önceki kapanış dünkü kurla çevrildiği için TL günlük
 * değişim hisse + kur etkisini birlikte gösterir. Dolar değerleri `native`
 * alanında. Kur yoksa ABD kotasyonu dönmez (çağıran maliyete düşer).
 */
export async function getEquityQuotes(assets: EquityRef[]): Promise<Record<string, StockQuote>> {
  const bist = Array.from(new Set(assets.filter((a) => a.asset_class === "equity_tr").map((a) => a.symbol)));
  const usMap = new Map<string, EquityRef>();
  for (const a of assets) if (a.asset_class === "equity_us") usMap.set(a.symbol, a);
  const us = [...usMap.values()];

  const [bistQuotes, usQuotes, rates, changes] = await Promise.all([
    bist.length > 0 ? getStockPrices(bist) : Promise.resolve({} as Record<string, StockQuote>),
    us.length > 0 ? getUsStockPrices(us) : Promise.resolve({} as Record<string, StockQuote>),
    us.length > 0 ? getAssetRates() : Promise.resolve({} as Record<string, number>),
    us.length > 0 ? getAssetChanges() : Promise.resolve({} as Record<string, number>),
  ]);

  const out: Record<string, StockQuote> = { ...bistQuotes };
  for (const [sym, q] of Object.entries(usQuotes)) {
    const fx = q.currency === "TRY" ? 1 : rates[q.currency];
    if (!(typeof fx === "number" && fx > 0)) continue;
    out[sym] = q.currency === "TRY" ? q : toTryQuote(q, fx, changes[q.currency] ?? null);
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

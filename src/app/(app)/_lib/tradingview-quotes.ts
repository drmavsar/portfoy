// BIST ve ABD anlık fiyatları — TradingView scanner REST (tek istekte toplu).
//
// Neden Yahoo yerine: Yahoo'nun BIST (.IS) 5g/1g serisi seans sırasında
// güncel mumları eksik/gecikmeli veriyor ve Vercel IP'sinden sık sık HTTP 429
// (rate-limit) dönüyordu; bu da günlük değişim %'sini bozuyordu. TradingView
// scanner günlük değişimi (change, change_abs) sunucu tarafında doğru hesaplayıp
// tek çağrıda tüm semboller için döndürür.

const UA =
  "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36";

const SCAN_URL = (market: "turkey" | "america") => `https://scanner.tradingview.com/${market}/scan`;

/** ABD borsaları — varlıkta borsa bilinmiyorsa sırayla denenir (ilk bulunan kazanır). */
export const US_EXCHANGES = ["NASDAQ", "NYSE", "AMEX"] as const;

export interface TVQuote {
  symbol: string;
  close: number;
  /** Günlük değişim yüzdesi (TradingView hesaplar). */
  changePct: number | null;
  /** Günlük değişim (mutlak, TRY). previous_close = close − changeAbs. */
  changeAbs: number | null;
  open: number | null;
  /** Haftalık performans % (Perf.W) — yalnızca extended istekte dolu. */
  weekPct: number | null;
  /** Aylık performans % (Perf.1M) — yalnızca extended istekte dolu. */
  monthPct: number | null;
}

const num = (x: number | null | undefined): number | null =>
  typeof x === "number" && Number.isFinite(x) ? x : null;

/** Tam ticker ("BIST:THYAO", "NASDAQ:NVDA") → sütun değerleri. */
async function scan(
  market: "turkey" | "america",
  tickers: string[],
  columns: string[],
): Promise<Record<string, Array<number | null>> | null> {
  const body = {
    symbols: { tickers, query: { types: [] } },
    columns,
  };
  try {
    const res = await fetch(SCAN_URL(market), {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "User-Agent": UA,
        Origin: "https://www.tradingview.com",
        Referer: "https://www.tradingview.com/",
      },
      body: JSON.stringify(body),
      next: { revalidate: 300, tags: ["stock-prices"] },
    });
    if (!res.ok) return null;
    const json = (await res.json()) as { data?: Array<{ s: string; d: Array<number | null> }> };
    const out: Record<string, Array<number | null>> = {};
    for (const row of json.data ?? []) {
      out[String(row.s)] = row.d;
    }
    return out;
  } catch {
    return null;
  }
}

function toQuote(sym: string, d: Array<number | null>, withPerf: boolean): TVQuote | null {
  const [close, changePct, changeAbs, open, weekPct, monthPct] = d;
  if (typeof close !== "number" || !Number.isFinite(close) || close <= 0) return null;
  return {
    symbol: sym,
    close,
    changePct: num(changePct),
    changeAbs: num(changeAbs),
    open: num(open),
    weekPct: withPerf ? num(weekPct) : null,
    monthPct: withPerf ? num(monthPct) : null,
  };
}

/**
 * BIST sembolleri için toplu anlık veri (günlük değişim). Tek POST; 5 dk cache.
 * Erişilemezse boş harita (çağıran taraf Yahoo'ya düşebilir).
 */
export async function fetchTradingViewQuotes(symbols: string[]): Promise<Record<string, TVQuote>> {
  const unique = Array.from(new Set(symbols.map((s) => s.toUpperCase())));
  if (unique.length === 0) return {};
  const data = await scan("turkey", unique.map((s) => `BIST:${s}`), ["close", "change", "change_abs", "open"]);
  if (!data) return {};
  const out: Record<string, TVQuote> = {};
  for (const [ticker, d] of Object.entries(data)) {
    const sym = ticker.replace(/^BIST:/, "");
    const q = toQuote(sym, d, false);
    if (q) out[sym] = q;
  }
  return out;
}

/** "NVDA" + tercih edilen borsa → denenecek tam ticker'lar (tercih önce). */
export function usTickerCandidates(symbol: string, exchange?: string | null): string[] {
  const sym = symbol.toUpperCase();
  const pref = (exchange ?? "").toUpperCase();
  const order = (US_EXCHANGES as readonly string[]).includes(pref)
    ? [pref, ...US_EXCHANGES.filter((e) => e !== pref)]
    : [...US_EXCHANGES];
  return order.map((e) => `${e}:${sym}`);
}

/**
 * ABD hisseleri (USD) — TradingView "america" taraması. Borsa bilinmiyorsa
 * NASDAQ / NYSE / AMEX birlikte sorulur; sembol başına ilk bulunan ticker
 * kullanılır. Fiyatlar ve değişim USD'dir. Erişilemezse boş harita.
 */
export async function fetchTradingViewUsQuotes(
  items: Array<{ symbol: string; exchange?: string | null }>,
): Promise<Record<string, TVQuote>> {
  const bySymbol = new Map<string, string[]>();
  for (const it of items) bySymbol.set(it.symbol.toUpperCase(), usTickerCandidates(it.symbol, it.exchange));
  if (bySymbol.size === 0) return {};
  const tickers = Array.from(new Set([...bySymbol.values()].flat()));
  const data = await scan("america", tickers, ["close", "change", "change_abs", "open"]);
  if (!data) return {};
  const out: Record<string, TVQuote> = {};
  for (const [sym, candidates] of bySymbol) {
    for (const t of candidates) {
      const q = data[t] ? toQuote(sym, data[t], false) : null;
      if (q) {
        out[sym] = q;
        break;
      }
    }
  }
  return out;
}

/**
 * fetchTradingViewQuotes + haftalık/aylık performans (Perf.W / Perf.1M).
 * Perf sütunları herhangi bir nedenle isteği bozarsa minimal sütunlara düşer
 * (böylece günlük değişim yine TradingView'den doğru gelir, hafta/ay null olur).
 */
export async function fetchTradingViewQuotesExtended(symbols: string[]): Promise<Record<string, TVQuote>> {
  const unique = Array.from(new Set(symbols.map((s) => s.toUpperCase())));
  if (unique.length === 0) return {};
  const tickers = unique.map((s) => `BIST:${s}`);
  let withPerf = true;
  let data = await scan("turkey", tickers, ["close", "change", "change_abs", "open", "Perf.W", "Perf.1M"]);
  if (!data) {
    withPerf = false;
    data = await scan("turkey", tickers, ["close", "change", "change_abs", "open"]);
  }
  if (!data) return {};
  const out: Record<string, TVQuote> = {};
  for (const [ticker, d] of Object.entries(data)) {
    const sym = ticker.replace(/^BIST:/, "");
    const q = toQuote(sym, d, withPerf);
    if (q) out[sym] = q;
  }
  return out;
}

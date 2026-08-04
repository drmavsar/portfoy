// BIST anlık fiyatları — TradingView scanner REST (tek istekte toplu).
//
// Neden Yahoo yerine: Yahoo'nun BIST (.IS) 5g/1g serisi seans sırasında
// güncel mumları eksik/gecikmeli veriyor ve Vercel IP'sinden sık sık HTTP 429
// (rate-limit) dönüyordu; bu da günlük değişim %'sini bozuyordu. TradingView
// scanner günlük değişimi (change, change_abs) sunucu tarafında doğru hesaplayıp
// tek çağrıda tüm semboller için döndürür.

const UA =
  "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36";

const SCAN_URL = "https://scanner.tradingview.com/turkey/scan";

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

async function scan(symbols: string[], columns: string[]): Promise<Record<string, Array<number | null>> | null> {
  const body = {
    symbols: { tickers: symbols.map((s) => `BIST:${s}`), query: { types: [] } },
    columns,
  };
  try {
    const res = await fetch(SCAN_URL, {
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
      out[String(row.s).replace(/^BIST:/, "")] = row.d;
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
  const data = await scan(unique, ["close", "change", "change_abs", "open"]);
  if (!data) return {};
  const out: Record<string, TVQuote> = {};
  for (const [sym, d] of Object.entries(data)) {
    const q = toQuote(sym, d, false);
    if (q) out[sym] = q;
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
  let withPerf = true;
  let data = await scan(unique, ["close", "change", "change_abs", "open", "Perf.W", "Perf.1M"]);
  if (!data) {
    withPerf = false;
    data = await scan(unique, ["close", "change", "change_abs", "open"]);
  }
  if (!data) return {};
  const out: Record<string, TVQuote> = {};
  for (const [sym, d] of Object.entries(data)) {
    const q = toQuote(sym, d, withPerf);
    if (q) out[sym] = q;
  }
  return out;
}

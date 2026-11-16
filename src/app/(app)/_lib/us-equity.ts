// ABD hisseleri — saf yardımcılar (sunucu eylemi değil; test edilebilir).
//
// Uygulamanın bütün değerleme hesapları TL'dir: mv = adet × quote.price,
// günlük değişim = adet × (price − previous_close). ABD hissesi fiyatı USD
// geldiği için kotasyon canlı USD/TRY ile TL'ye çevrilir; böylece sayfaların
// mevcut TL hesapları değişmeden çalışır. Dolar değerleri `native` alanında
// taşınır (dolar portföyü kartı ve fiyat sütunu için).

/** Kotasyonun kendi para birimindeki değerleri (USD). */
export interface NativeQuote {
  currency: string;
  price: number;
  previous_close: number | null;
  /** Hissenin kendi günlük değişimi (%), kur etkisi hariç */
  change_pct: number | null;
  /** Fiyatın çevrildiği kur (USD/TRY, güncel) */
  fx: number;
  /** Önceki kapanışın çevrildiği kur (dünkü USD/TRY) */
  prev_fx: number;
}

/** TL'ye çevrilebilir asgari kotasyon şekli (StockQuote ile uyumlu). */
export interface QuoteLike {
  symbol: string;
  price: number;
  previous_close: number | null;
  change_pct: number | null;
  currency: string;
  native?: NativeQuote;
}

export const isEquity = (assetClass: string | null | undefined): boolean =>
  assetClass === "equity_tr" || assetClass === "equity_us";

/**
 * USD kotasyonu TL'ye çevir. Önceki kapanış dünkü kurla çevrilir, böylece
 * TL günlük değişim = hisse hareketi + kur hareketi olur (dolar varlığın
 * gerçek TL değişimi). usdChangePct yoksa kur sabit sayılır.
 */
export function toTryQuote<Q extends QuoteLike>(q: Q, usdTry: number, usdChangePct: number | null): Q {
  const prevFx = usdChangePct != null && usdChangePct > -100 ? usdTry / (1 + usdChangePct / 100) : usdTry;
  const price = q.price * usdTry;
  const previous_close = q.previous_close != null ? q.previous_close * prevFx : null;
  return {
    ...q,
    price,
    previous_close,
    change_pct: previous_close && previous_close > 0 ? ((price - previous_close) / previous_close) * 100 : null,
    currency: "TRY",
    native: {
      currency: q.currency,
      price: q.price,
      previous_close: q.previous_close,
      change_pct: q.change_pct,
      fx: usdTry,
      prev_fx: prevFx,
    },
  };
}

export interface NativeCostTrade {
  portfolio_id: string;
  asset_id: string;
  side: "buy" | "sell";
  executed_at: string;
  quantity: number | string;
  price: number | string;
  currency: string;
  fees?: number | string | null;
}

export interface NativePosition {
  currency: string;
  quantity: number;
  /** Açık pozisyonun kendi para birimindeki maliyeti (ortalama maliyet) */
  cost: number;
}

/**
 * (portföy, varlık) başına kendi para birimindeki maliyet — yalnız tüm
 * işlemleri aynı TL-dışı para biriminde olan pozisyonlar için (ör. USD).
 * Ortalama maliyet: satış adedi o anki ortalamadan düşülür; komisyon
 * alışta maliyete eklenir.
 */
export function nativeCostByHolding(trades: NativeCostTrade[]): Map<string, NativePosition> {
  const groups = new Map<string, NativeCostTrade[]>();
  for (const t of trades) {
    const key = `${t.portfolio_id}|${t.asset_id}`;
    const arr = groups.get(key) ?? [];
    arr.push(t);
    groups.set(key, arr);
  }
  const out = new Map<string, NativePosition>();
  for (const [key, ts] of groups) {
    const ccy = ts[0].currency;
    if (ccy === "TRY" || ts.some((t) => t.currency !== ccy)) continue;
    let qty = 0;
    let cost = 0;
    for (const t of [...ts].sort((a, b) => a.executed_at.localeCompare(b.executed_at))) {
      const q = Number(t.quantity);
      if (t.side === "buy") {
        cost += q * Number(t.price) + Number(t.fees ?? 0);
        qty += q;
      } else {
        const avg = qty > 0 ? cost / qty : 0;
        cost -= q * avg;
        qty -= q;
        if (qty <= 1e-9) {
          qty = 0;
          cost = 0;
        }
      }
    }
    if (qty > 1e-9) out.set(key, { currency: ccy, quantity: qty, cost });
  }
  return out;
}

const CCY_SYMBOL: Record<string, string> = { USD: "$", EUR: "€", GBP: "£" };

/** "$1.234,56" — TR sayı biçimi, para birimi simgesi önde. */
export function formatNative(v: number, currency: string, decimals = 2): string {
  const sym = CCY_SYMBOL[currency] ?? `${currency} `;
  const s = Math.abs(v).toLocaleString("tr-TR", { minimumFractionDigits: decimals, maximumFractionDigits: decimals });
  return `${v < 0 ? "−" : ""}${sym}${s}`;
}

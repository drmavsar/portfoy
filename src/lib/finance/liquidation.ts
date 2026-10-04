/* ============================================================
   Bozdurma (likidasyon) değeri — saf hesap.

   Uygulama altın ve dövizi SATIŞ fiyatıyla (alırken ödenen) değerler.
   Elindekini bozdurursan karşı taraf ALIŞ fiyatından öder; aradaki makas
   çeyrek/cumhuriyette %2-3'e çıkabilir. Bilezikte işçilik bozdururken geri
   alınmaz: bozdurma = has gram alış × ayar/24 (hurda değeri).
   ============================================================ */

/** canlidoviz "22 ayar bilezik / gram altın" oranından kalibre işçilik primi. */
export const BILEZIK_ISCILIK = 1.0258;

const BILEZIK_CODES = ["BILEZIK22", "BILEZIK18", "BILEZIK14"] as const;

export interface BidAskQuote {
  buying: number | null;
  selling: number;
}

/** Alış/satış oranı makul aralıkta değilse (veri hatası) kullanılmaz. */
const MIN_RATIO = 0.8;

/**
 * Kod başına bozdurma oranı (alış / satış). Uygulamadaki değer × oran =
 * bozdurma değeri. Bilezik: gram altın oranı ÷ işçilik primi (işçilik
 * bozdurmada kaybolur). Ons altın gramın oranını kullanır.
 */
export function bidRatiosFromQuotes(quotes: Record<string, BidAskQuote>): Record<string, number> {
  const out: Record<string, number> = {};
  for (const [code, q] of Object.entries(quotes)) {
    if (q.buying == null || !(q.selling > 0)) continue;
    const r = q.buying / q.selling;
    if (r >= MIN_RATIO && r <= 1) out[code] = r;
  }
  const xau = out.XAU;
  if (xau != null) {
    out.XAU_OZ = xau;
    for (const c of BILEZIK_CODES) out[c] = xau / BILEZIK_ISCILIK;
  } else {
    for (const c of BILEZIK_CODES) delete out[c];
  }
  return out;
}

export interface LiquidationInput {
  currency: string;
  /** Adet / gram / döviz miktarı */
  native: number;
}

export interface LiquidationLine {
  currency: string;
  native: number;
  /** Uygulamadaki değer (satış fiyatıyla) */
  valueTry: number;
  /** Bozdurma değeri (alış fiyatıyla); oran yoksa null */
  bidValueTry: number | null;
  ratio: number | null;
}

export interface LiquidationSummary {
  lines: LiquidationLine[];
  valueTry: number;
  /** Oranı bilinen satırların bozdurma değeri + bilinmeyenlerin değeri */
  bidValueTry: number;
  /** Bozdurma farkı (≤ 0) — yalnız oranı bilinen satırlar */
  haircutTry: number;
  /** Oranı bilinmeyen (makas verisi yok) satır sayısı */
  unknown: number;
}

/** Para birimine göre toplayıp bozdurma değerini hesapla. */
export function liquidationSummary(
  items: LiquidationInput[],
  rates: Record<string, number | undefined>,
  ratios: Record<string, number>,
): LiquidationSummary {
  const byCcy = new Map<string, number>();
  for (const it of items) {
    if (!(it.native > 0)) continue;
    byCcy.set(it.currency, (byCcy.get(it.currency) ?? 0) + it.native);
  }
  const lines: LiquidationLine[] = [];
  for (const [currency, native] of byCcy) {
    const rate = rates[currency];
    if (rate == null || !(rate > 0)) continue;
    const valueTry = native * rate;
    const ratio = ratios[currency] ?? null;
    lines.push({ currency, native, valueTry, bidValueTry: ratio == null ? null : valueTry * ratio, ratio });
  }
  lines.sort((a, b) => b.valueTry - a.valueTry);
  const valueTry = lines.reduce((s, l) => s + l.valueTry, 0);
  const bidValueTry = lines.reduce((s, l) => s + (l.bidValueTry ?? l.valueTry), 0);
  return {
    lines,
    valueTry,
    bidValueTry,
    haircutTry: bidValueTry - valueTry,
    unknown: lines.filter((l) => l.ratio == null).length,
  };
}

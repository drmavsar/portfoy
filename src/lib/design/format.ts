/* ============================================================
   Biçim kuralları (Türkiye) — tasarım sistemi bileşenleri için.
   Para:    ₺1.234.567,89 · $12.345,00 · €9.870,50 · 125,40 gr
   Negatif: gerçek eksi işareti (U+2212): −₺1.234,56
   Yüzde:   %12,4; değişimde +%3,2 / −%1,8 (yüzde işareti sayının önünde)
   KPI:     ₺5,21 Mn · ₺70,7 B (tam değer ipucunda)
   ============================================================ */

export const MINUS = "−";

export type Currency = "TRY" | "USD" | "EUR" | "XAU";

const PREFIX: Record<Currency, string> = { TRY: "₺", USD: "$", EUR: "€", XAU: "" };

function num(n: number, decimals: number, minDecimals = decimals): string {
  return Math.abs(n).toLocaleString("tr-TR", {
    minimumFractionDigits: minDecimals,
    maximumFractionDigits: decimals,
  });
}

function signOf(n: number, showPlus: boolean): string {
  if (n < 0) return MINUS;
  if (n > 0 && showPlus) return "+";
  return "";
}

/** Altın gram cinsinden gelir ("805 gr"); diğerleri önek simgeli. */
function withUnit(body: string, cur: Currency): string {
  return cur === "XAU" ? `${body} gr` : `${PREFIX[cur]}${body}`;
}

export interface MoneyOpts {
  cur?: Currency;
  /** Ondalık hane. KPI'da 0, liste ve tabloda 2 (varsayılan). */
  decimals?: number;
  /** Pozitif değerde "+" yaz (değişim tutarları için). */
  sign?: boolean;
}

export function money(n: number | null | undefined, opts: MoneyOpts = {}): string {
  if (n == null || Number.isNaN(n)) return "—";
  const { cur = "TRY", decimals = 2, sign = false } = opts;
  const rounded = Number(n.toFixed(decimals));
  return signOf(rounded, sign) + withUnit(num(rounded, decimals), cur);
}

/** Kısaltılmış tutar: ≥1 milyar "Mr", ≥1 milyon "Mn" (2 hane), ≥1 bin "B" (en çok 1 hane). */
export function moneyShort(n: number | null | undefined, opts: Omit<MoneyOpts, "decimals"> = {}): string {
  if (n == null || Number.isNaN(n)) return "—";
  const { cur = "TRY", sign = false } = opts;
  const abs = Math.abs(n);
  let body: string;
  if (abs >= 1e9) body = `${num(n / 1e9, 2)} Mr`;
  else if (abs >= 1e6) body = `${num(n / 1e6, 2)} Mn`;
  else if (abs >= 1e3) body = `${num(n / 1e3, 1, 0)} B`;
  else body = num(n, 0);
  return signOf(n, sign) + withUnit(body, cur);
}

export interface PctOpts {
  decimals?: number;
  /** Pozitif değerde "+" yaz (değişim yüzdeleri için). */
  sign?: boolean;
}

export function pct(n: number | null | undefined, opts: PctOpts = {}): string {
  if (n == null || Number.isNaN(n)) return "—";
  const { decimals = 1, sign = false } = opts;
  const rounded = Number(n.toFixed(decimals));
  return `${signOf(rounded, sign)}%${num(rounded, decimals)}`;
}

export type Direction = "up" | "down" | "flat";

export function direction(n: number | null | undefined): Direction {
  if (n == null || Number.isNaN(n) || n === 0) return "flat";
  return n > 0 ? "up" : "down";
}

export const ARROW: Record<Direction, string> = { up: "▲", down: "▼", flat: "•" };

const MONTHS_SHORT = ["Oca", "Şub", "Mar", "Nis", "May", "Haz", "Tem", "Ağu", "Eyl", "Eki", "Kas", "Ara"];
const MONTHS_LONG = ["Ocak", "Şubat", "Mart", "Nisan", "Mayıs", "Haziran", "Temmuz", "Ağustos", "Eylül", "Ekim", "Kasım", "Aralık"];

function parts(d: string | Date): [number, number, number] {
  if (typeof d === "string") {
    const [y, m, day] = d.slice(0, 10).split("-").map(Number);
    return [y, m, day];
  }
  return [d.getFullYear(), d.getMonth() + 1, d.getDate()];
}

/** 04.10.2026 */
export function dateTR(d: string | Date): string {
  const [y, m, day] = parts(d);
  return `${String(day).padStart(2, "0")}.${String(m).padStart(2, "0")}.${y}`;
}

/** 4 Eki */
export function dateShort(d: string | Date): string {
  const [, m, day] = parts(d);
  return `${day} ${MONTHS_SHORT[m - 1]}`;
}

/** Ekim 2026 */
export function monthLong(d: string | Date): string {
  const [y, m] = parts(d);
  return `${MONTHS_LONG[m - 1]} ${y}`;
}

export { MONTHS_SHORT };

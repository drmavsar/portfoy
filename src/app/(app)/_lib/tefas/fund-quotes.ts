import { readAll } from "@/lib/supabase/read-all";
import type { StockQuote } from "@/app/(app)/_lib/stock-prices";

export interface FundQuote {
  fund_code: string;
  as_of: string;
  nav: number;
  previous_nav: number | null;
  change_pct: number | null;
}

interface NavRow {
  fund_code: string;
  as_of: string;
  nav: number | string;
}

/** Son iki NAV yeter; 45 gün bayram tatillerini de kapsar. */
const LOOKBACK_DAYS = 45;

/** NAV satırlarından fon başına son fiyat ve bir önceki fiyat (sıra bağımsız). */
export function buildFundQuotes(rows: NavRow[]): FundQuote[] {
  const byCode = new Map<string, Array<{ as_of: string; nav: number }>>();
  for (const r of rows) {
    const nav = Number(r.nav);
    if (!Number.isFinite(nav) || nav <= 0) continue;
    const arr = byCode.get(r.fund_code) ?? [];
    arr.push({ as_of: r.as_of, nav });
    byCode.set(r.fund_code, arr);
  }
  const out: FundQuote[] = [];
  for (const [fund_code, navs] of byCode) {
    navs.sort((a, b) => (a.as_of < b.as_of ? 1 : a.as_of > b.as_of ? -1 : 0));
    const latest = navs[0];
    const previous_nav = navs[1]?.nav ?? null;
    const change_pct =
      previous_nav != null && previous_nav !== 0
        ? ((latest.nav - previous_nav) / previous_nav) * 100
        : null;
    out.push({ fund_code, as_of: latest.as_of, nav: latest.nav, previous_nav, change_pct });
  }
  return out;
}

/**
 * Fonların son TEFAS NAV'ını fund_prices'tan okur. Hem kullanıcı oturumlu
 * istemciyle (sayfalar) hem service-role istemciyle (cron) çalışsın diye
 * istemciyi parametre alır. Okuma eksik kalırsa hata fırlatır — çağıran
 * maliyet değerlemesine düşer.
 */
export async function loadFundQuotes(
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  supabase: any,
  codes: string[],
  today: Date = new Date(),
): Promise<FundQuote[]> {
  const unique = Array.from(new Set(codes.filter(Boolean)));
  if (unique.length === 0) return [];
  const cutoff = new Date(today);
  cutoff.setDate(cutoff.getDate() - LOOKBACK_DAYS);
  // Sayfalı oku: 1000 satır sınırında alfabetik ilk fon tüm satırları
  // doldurup diğer fonları NAV'sız bırakmasın.
  const rows = await readAll<NavRow>(
    (from, to) =>
      supabase
        .from("fund_prices")
        .select("fund_code, as_of, nav", { count: "exact" })
        .in("fund_code", unique)
        .gte("as_of", cutoff.toISOString().slice(0, 10))
        .order("fund_code", { ascending: true })
        .order("as_of", { ascending: false })
        .range(from, to),
    (r) => `${r.fund_code}|${r.as_of}`,
  );
  return buildFundQuotes(rows);
}

/** Fon NAV'larını hisse fiyatı şekline sokar; değerleme/render kodu ikisini aynı işler. */
export function fundQuotesAsStockQuotes(quotes: FundQuote[]): Record<string, StockQuote> {
  const out: Record<string, StockQuote> = {};
  for (const fq of quotes) {
    out[fq.fund_code] = {
      symbol: fq.fund_code,
      price: fq.nav,
      previous_close: fq.previous_nav,
      change_pct: fq.change_pct,
      currency: "TRY",
      source: "tefas",
      market_time: null,
    };
  }
  return out;
}

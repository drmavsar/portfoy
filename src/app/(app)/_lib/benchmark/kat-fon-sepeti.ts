// Sprint-5.6 PR-A — Katılım Fon Sepeti synthetic benchmark.
//
// "Tüm aktif katılım fonlarının equal-weight basket'inin NAV trajesi" —
// Mehmet Score Top 10'un sektör peer'i olarak karşılaştırılır.
//
// Algoritma (static universe v1):
//   1. universe = startDate'te aktif olan ve is_participation=true fonlar
//   2. her fonun başlangıç NAV'ı = fund_prices[code].at(startDate)
//   3. her gün d için:
//      - sepeti[d] = mean(fund_nav[d] / fund_nav[startDate]) × 100
//      - delisted fonlar o günden sonra exclude
//      - hafta sonu / NAV eksik → last available kullan
//
// Saf fonksiyon — DB bağımsız. Caller pre-fetched verileri sağlar.

import { isActiveAtDate } from "./active-funds";
import type { BenchmarkPoint, FundStatusEntry } from "./types";

export interface NavSeriesByFund {
  /** fund_code → ASC sıralı NavPoint[] */
  [code: string]: Array<{ as_of: string; nav: number }>;
}

export interface FundUniverseEntry {
  fund_code: string;
  is_participation: boolean;
}

export interface KatFonSepetiOptions {
  startDate: string;                 // YYYY-MM-DD
  endDate: string;
  fundPrices: NavSeriesByFund;
  funds: FundUniverseEntry[];        // is_participation filter için
  statusHistory: FundStatusEntry[];
  /** Default true: yalnız katılım fonları. False ise tüm fonlar. */
  filterParticipation?: boolean;
}

/** ISO YYYY-MM-DD tarih + N gün. */
function addDays(iso: string, days: number): string {
  const ts = Date.parse(`${iso}T00:00:00Z`);
  const dt = new Date(ts + days * 86_400_000);
  return dt.toISOString().slice(0, 10);
}

/** Series'de date'ten önce veya eşit son NAV (last-available). */
function lastNavOnOrBefore(
  series: Array<{ as_of: string; nav: number }>,
  date: string,
): number | null {
  // series ASC sıralı varsayıyoruz
  let lo = 0;
  let hi = series.length - 1;
  let candidateIdx = -1;
  while (lo <= hi) {
    const mid = (lo + hi) >> 1;
    if (series[mid].as_of <= date) {
      candidateIdx = mid;
      lo = mid + 1;
    } else {
      hi = mid - 1;
    }
  }
  return candidateIdx >= 0 ? series[candidateIdx].nav : null;
}

/**
 * Katılım Fon Sepeti — static universe equal-weight basket.
 *
 * `startDate`'te aktif + (filterParticipation ise is_participation=true)
 * fonların listesi sabit. Bir fon `delisted` olursa o günden sonra
 * exclude edilir (denominator azalır).
 */
export function computeKatFonSepetiSeries(
  opts: KatFonSepetiOptions,
): BenchmarkPoint[] {
  const filterPart = opts.filterParticipation ?? true;
  const participationByCode = new Map(
    opts.funds.map((f) => [f.fund_code, f.is_participation]),
  );

  // 1. Universe: startDate'te aktif + (katılım filtresi)
  const universe: string[] = [];
  for (const code of Object.keys(opts.fundPrices)) {
    if (filterPart) {
      const isPart = participationByCode.get(code);
      if (!isPart) continue;
    }
    // statusHistory'den startDate'te aktif mi?
    const entries = opts.statusHistory.filter((e) => e.fund_code === code);
    const activeAtStart = entries.some((e) => isActiveAtDate(e, opts.startDate));
    if (!activeAtStart) continue;
    // startDate'te NAV var mı?
    const baseNav = lastNavOnOrBefore(opts.fundPrices[code], opts.startDate);
    if (baseNav == null || baseNav <= 0) continue;
    universe.push(code);
  }

  if (universe.length === 0) return [];

  // 2. Base NAVs
  const baseNavs: Record<string, number> = {};
  for (const code of universe) {
    baseNavs[code] = lastNavOnOrBefore(opts.fundPrices[code], opts.startDate)!;
  }

  // 3. Günlük seri — startDate'ten endDate'e
  const points: BenchmarkPoint[] = [];
  let cursor = opts.startDate;
  while (cursor <= opts.endDate) {
    const ratios: number[] = [];
    for (const code of universe) {
      // O gün aktif mi?
      const entries = opts.statusHistory.filter((e) => e.fund_code === code);
      const activeNow = entries.some((e) => isActiveAtDate(e, cursor));
      if (!activeNow) continue;
      const nav = lastNavOnOrBefore(opts.fundPrices[code], cursor);
      if (nav == null || nav <= 0) continue;
      ratios.push(nav / baseNavs[code]);
    }
    if (ratios.length > 0) {
      const avg = ratios.reduce((a, b) => a + b, 0) / ratios.length;
      points.push({ as_of: cursor, value: avg * 100 });
    }
    cursor = addDays(cursor, 1);
  }
  return points;
}

export const __internals = { lastNavOnOrBefore, addDays };

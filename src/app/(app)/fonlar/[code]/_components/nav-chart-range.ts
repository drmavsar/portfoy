// Pure NAV chart range filter — UI komponentinden ayrılmış, test edilebilir.

export type NavRange = "1M" | "3M" | "6M" | "1Y" | "3Y" | "5Y" | "ALL";

export const NAV_RANGE_DAYS: Record<NavRange, number | null> = {
  "1M": 30,
  "3M": 90,
  "6M": 180,
  "1Y": 365,
  "3Y": 365 * 3,
  "5Y": 365 * 5,
  ALL: null,
};

export const NAV_RANGES: NavRange[] = ["1M", "3M", "6M", "1Y", "3Y", "5Y", "ALL"];

export interface NavPointLite {
  /** "YYYY-MM-DD" */
  as_of: string;
  nav: number;
}

/**
 * Cutoff date'i hesapla.
 *
 * Önemli: `anchorIsoDate` parametresi NAV'ın **son tarihine** demir atılır,
 * gerçek wall-clock'a değil. Eski mevcut bug: `Date.now()` kullanılıyordu →
 * test/dev env'de gerçek saat NAV tarihinden farklıysa cutoff window NAV
 * aralığının dışına düşüyor → 1M/3M/6M chart boş.
 *
 * @returns ISO YYYY-MM-DD; range=ALL ise serideki ilk tarih.
 */
export function computeCutoff(
  anchorIsoDate: string,
  range: NavRange,
  fallbackEarliest?: string,
): string {
  const days = NAV_RANGE_DAYS[range];
  if (days === null) return fallbackEarliest ?? anchorIsoDate;
  const ts = Date.parse(`${anchorIsoDate}T00:00:00Z`);
  if (!Number.isFinite(ts)) return anchorIsoDate;
  return new Date(ts - days * 86_400_000).toISOString().slice(0, 10);
}

/**
 * Seri içinden range'e göre filtreler. Series **ASC sıralı** olmalı.
 * Anchor = son NAV'ın tarihi.
 */
export function filterSeriesByRange<T extends NavPointLite>(
  series: T[],
  range: NavRange,
): T[] {
  if (series.length === 0) return [];
  const anchor = series[series.length - 1].as_of;
  const cutoff = computeCutoff(anchor, range, series[0].as_of);
  return series.filter((p) => p.as_of >= cutoff);
}

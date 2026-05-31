// Sprint-5.6 PR-B — Tarih helper'ları (pure).

/** YYYY-MM-DD'ye N gün ekle. */
export function addDays(iso: string, days: number): string {
  const ts = Date.parse(`${iso}T00:00:00Z`);
  if (!Number.isFinite(ts)) return iso;
  const dt = new Date(ts + days * 86_400_000);
  return dt.toISOString().slice(0, 10);
}

/** İki ISO tarih arasındaki gün farkı (b - a). */
export function daysBetween(a: string, b: string): number {
  const da = Date.parse(`${a}T00:00:00Z`);
  const db = Date.parse(`${b}T00:00:00Z`);
  return Math.round((db - da) / 86_400_000);
}

/**
 * Rebalance tarihleri — start_date dahil, end_date dahil değil son
 * rebalance'tan sonra bir günlük portfolio hesabı yapılır.
 *
 * Örnek: start=2022-01-03, end=2026-05-26, days=90 →
 *   [2022-01-03, 2022-04-03, 2022-07-02, ...] her 90 günde bir
 */
export function computeRebalanceDates(
  start: string,
  end: string,
  rebalanceDays: number,
): string[] {
  if (rebalanceDays <= 0) return [start];
  const dates: string[] = [];
  let cursor = start;
  while (cursor < end) {
    dates.push(cursor);
    cursor = addDays(cursor, rebalanceDays);
  }
  return dates;
}

/** Bir tarih için CPI period (cpiPeriodForNavDate gibi) — bir önceki ay. */
export function cpiPeriodFor(iso: string): string {
  const [y, m] = iso.slice(0, 7).split("-").map(Number);
  let year = y;
  let month = m - 1;
  if (month === 0) {
    month = 12;
    year -= 1;
  }
  return `${String(year).padStart(4, "0")}-${String(month).padStart(2, "0")}`;
}

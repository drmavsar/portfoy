// Sprint-6 PR-C — Manuel trade form için NAV default fiyat lookup.
//
// "Verilen tarihe en yakın geçmiş NAV" — fund_prices sorgusu için saf
// in-memory picker. Sorgu sırası `as_of DESC LIMIT 1` SQL ile aynı; bu
// helper formdan tarih değişince UI'da hızlı default önerebilir.

export type NavPriceRow = { as_of: string; nav: number };

/**
 * Bir tarihe (YYYY-MM-DD veya ISO) ait NAV: o tarihte veya öncesinde en
 * yakın as_of'lı satırın nav değeri. Yoksa null.
 */
export function pickNavOnOrBefore(rows: NavPriceRow[], asOf: string): number | null {
  const cutoff = isoToDateString(asOf);
  if (!cutoff) return null;
  let bestDate = "";
  let bestNav: number | null = null;
  for (const row of rows) {
    if (!row || typeof row.nav !== "number" || !Number.isFinite(row.nav)) continue;
    const d = isoToDateString(row.as_of);
    if (!d) continue;
    if (d > cutoff) continue;
    if (d > bestDate) {
      bestDate = d;
      bestNav = row.nav;
    }
  }
  return bestNav;
}

function isoToDateString(value: string): string {
  if (typeof value !== "string") return "";
  // Both 'YYYY-MM-DD' and full ISO timestamps work; take the first 10 chars.
  const trimmed = value.trim();
  if (trimmed.length < 10) return "";
  const head = trimmed.slice(0, 10);
  // Hızlı format kontrolü; geçersizse boş döner.
  if (!/^\d{4}-\d{2}-\d{2}$/.test(head)) return "";
  return head;
}

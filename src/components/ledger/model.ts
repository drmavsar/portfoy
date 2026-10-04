/* ============================================================
   Defter listesi — saf model (filtre, sıralama, gruplama, sayfa).
   Bileşen: ledger.tsx. Sütun tablosu yerine satır başına tek kart;
   gruplar ara toplam ve pay çubuğu taşır.
   ============================================================ */

export type LedgerSort = "date-desc" | "date-asc" | "amount-desc" | "amount-asc";

export interface LedgerAccessors<T> {
  /** "YYYY-MM-DD" */
  date: (row: T) => string;
  /** Sıralama ve pay için büyüklük */
  amount: (row: T) => number;
}

export interface FacetField<T> {
  id: string;
  value: (row: T) => string;
}

/** Türkçe büyük/küçük harf ve aksan farkını yok say: "MIGROS" = "Migros" = "mİgros". */
export function foldTr(s: string): string {
  return s
    .toLocaleLowerCase("tr")
    .replace(/ı/g, "i")
    .replace(/ş/g, "s")
    .replace(/ğ/g, "g")
    .replace(/ü/g, "u")
    .replace(/ö/g, "o")
    .replace(/ç/g, "c")
    .normalize("NFD")
    .replace(/\p{M}/gu, "");
}

/** Sorgu kelimelerinin hepsi geçmeli (sıra fark etmez). */
export function matchesQuery(text: string, query: string): boolean {
  const words = foldTr(query).split(/\s+/).filter(Boolean);
  if (words.length === 0) return true;
  const hay = foldTr(text);
  return words.every((w) => hay.includes(w));
}

export function filterLedger<T>(
  rows: T[],
  search: (row: T) => string,
  query: string,
  facets: FacetField<T>[],
  selected: Record<string, string>,
): T[] {
  const active = facets.filter((f) => selected[f.id]);
  return rows.filter(
    (r) => active.every((f) => f.value(r) === selected[f.id]) && matchesQuery(search(r), query),
  );
}

/** Kaynağı değiştirmez; eşitlikte tarih yeni → eski. */
export function sortLedger<T>(rows: T[], acc: LedgerAccessors<T>, sort: LedgerSort): T[] {
  const byDate = (a: T, b: T) => {
    const x = acc.date(a);
    const y = acc.date(b);
    return x < y ? -1 : x > y ? 1 : 0;
  };
  return rows
    .map((r, i) => ({ r, i }))
    .sort((a, b) => {
      let c = 0;
      if (sort === "date-asc") c = byDate(a.r, b.r);
      else if (sort === "date-desc") c = -byDate(a.r, b.r);
      else {
        const d = Math.abs(acc.amount(a.r)) - Math.abs(acc.amount(b.r));
        c = sort === "amount-asc" ? d : -d;
        if (c === 0) c = -byDate(a.r, b.r);
      }
      return c || a.i - b.i;
    })
    .map((x) => x.r);
}

export interface LedgerGroup<T> {
  key: string;
  label: string;
  rows: T[];
  /** Σ ağırlık (varsayılan |tutar|) */
  weight: number;
}

const MONTHS = ["Ocak", "Şubat", "Mart", "Nisan", "Mayıs", "Haziran", "Temmuz", "Ağustos", "Eylül", "Ekim", "Kasım", "Aralık"];
const WEEKDAYS = ["Pazar", "Pazartesi", "Salı", "Çarşamba", "Perşembe", "Cuma", "Cumartesi"];
export const MONTHS_SHORT = ["Oca", "Şub", "Mar", "Nis", "May", "Haz", "Tem", "Ağu", "Eyl", "Eki", "Kas", "Ara"];

export function monthLabel(ym: string): string {
  return `${MONTHS[Number(ym.slice(5, 7)) - 1] ?? ym} ${ym.slice(0, 4)}`;
}

export function dayLabel(iso: string): string {
  const wd = new Date(`${iso}T00:00:00Z`).getUTCDay();
  return `${Number(iso.slice(8, 10))} ${MONTHS[Number(iso.slice(5, 7)) - 1]} ${iso.slice(0, 4)}, ${WEEKDAYS[wd]}`;
}

/**
 * Gruplar: "day" / "month" tarih sırasını izler (tutara göre sıralıyken yeni → eski);
 * alan grupları büyüklüğe göre (en çok harcanan üstte). Satırlar gelen sırayı korur.
 */
export function groupLedger<T>(
  rows: T[],
  acc: LedgerAccessors<T>,
  by: string,
  facets: FacetField<T>[],
  sort: LedgerSort,
  /** Pay ve sıralama ağırlığı; varsayılan |tutar| */
  weight: (row: T) => number = (r) => Math.abs(acc.amount(r)),
): LedgerGroup<T>[] {
  let keyOf: ((r: T) => string) | null = null;
  let labelOf: (key: string) => string = (k) => k;
  if (by === "day") {
    keyOf = (r) => acc.date(r);
    labelOf = dayLabel;
  } else if (by === "month") {
    keyOf = (r) => acc.date(r).slice(0, 7);
    labelOf = monthLabel;
  } else {
    const f = facets.find((x) => x.id === by);
    if (f) keyOf = (r) => f.value(r);
  }
  if (!keyOf) return [];
  const m = new Map<string, LedgerGroup<T>>();
  for (const r of rows) {
    const k = keyOf(r);
    let g = m.get(k);
    if (!g) {
      g = { key: k, label: labelOf(k), rows: [], weight: 0 };
      m.set(k, g);
    }
    g.rows.push(r);
    g.weight += weight(r);
  }
  const groups = [...m.values()];
  if (by === "day" || by === "month") {
    const asc = sort === "date-asc";
    return groups.sort((a, b) => (a.key < b.key ? (asc ? -1 : 1) : a.key > b.key ? (asc ? 1 : -1) : 0));
  }
  return groups.sort((a, b) => b.weight - a.weight || a.label.localeCompare(b.label, "tr"));
}

export interface WindowedGroup<T> {
  group: LedgerGroup<T>;
  rows: T[];
  /** Bütçe dolduğu için gösterilmeyen satır sayısı */
  hidden: number;
}

/**
 * En fazla `budget` satır çiz. Grup başlıkları ve ara toplamları her zaman
 * görünür (toplamlar tüm grup üzerinden); kapalı gruplar bütçe harcamaz.
 */
export function windowGroups<T>(groups: LedgerGroup<T>[], closed: Set<string>, budget: number): {
  items: WindowedGroup<T>[];
  hidden: number;
} {
  let left = budget;
  let hidden = 0;
  const items = groups.map((group) => {
    if (closed.has(group.key)) return { group, rows: [], hidden: 0 };
    const take = Math.max(0, Math.min(left, group.rows.length));
    left -= take;
    const h = group.rows.length - take;
    hidden += h;
    return { group, rows: group.rows.slice(0, take), hidden: h };
  });
  return { items, hidden };
}

/** Filtre seçenekleri: kayıt sayısına göre, eşitlikte alfabetik. */
export function facetOptions<T>(rows: T[], value: (row: T) => string): Array<{ value: string; count: number }> {
  const m = new Map<string, number>();
  for (const r of rows) {
    const v = value(r);
    m.set(v, (m.get(v) ?? 0) + 1);
  }
  return [...m.entries()]
    .map(([v, count]) => ({ value: v, count }))
    .sort((a, b) => b.count - a.count || a.value.localeCompare(b.value, "tr"));
}

/** En sık geçen para birimi (pay çubukları yalnız bu birimdeki tutarlarla çizilir). */
export function primaryCurrency<T>(rows: T[], currency: (row: T) => string): string | null {
  const m = new Map<string, number>();
  for (const r of rows) m.set(currency(r), (m.get(currency(r)) ?? 0) + 1);
  let best: string | null = null;
  let n = 0;
  for (const [c, k] of m) if (k > n) [best, n] = [c, k];
  return best;
}

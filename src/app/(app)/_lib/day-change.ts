/**
 * Özet kartlarının "bugün" değişimi.
 *
 * Kartlar ve manşet aynı tabana göre hesaplanır: son gece kaydı (bugünden
 * önceki en yeni daily_snapshot). Değişim = şu anki değer − o kayıttaki değer;
 * böylece Portföy + Altın + Döviz + Nakit kartlarının toplamı manşetteki servet
 * değişimine eşit olur. Kayıt yoksa piyasa kaynaklı (önceki kapanışa göre)
 * değişime düşülür.
 */

export interface ClassAmounts {
  equity: number;
  metal: number;
  fx: number;
  cash: number;
}

export interface SnapshotClassBase {
  equity_mv: number | string | null;
  metal_try: number | string | null;
  fx_try: number | string | null;
  cash_try: number | string | null;
}

const num = (v: number | string | null | undefined) => {
  const n = Number(v ?? 0);
  return Number.isFinite(n) ? n : 0;
};

export function classDayChanges(
  now: ClassAmounts,
  snapshot: SnapshotClassBase | null,
  marketFallback: ClassAmounts,
): ClassAmounts {
  if (!snapshot) return marketFallback;
  return {
    equity: now.equity - num(snapshot.equity_mv),
    metal: now.metal - num(snapshot.metal_try),
    fx: now.fx - num(snapshot.fx_try),
    cash: now.cash - num(snapshot.cash_try),
  };
}

/**
 * Nakit dışındaki değişimden bugünkü net alım-satım tutarı düşülür: bankadan
 * hisseye/fona aktarılan para "piyasa etkisi" sayılmasın. Manşet =
 * piyasa etkisi + nakit değişimi + bugünkü net alım.
 */
export function marketEffect(changes: ClassAmounts, netBuyToday: number): number {
  return changes.equity - netBuyToday + changes.metal + changes.fx;
}

/** Sınıf değişimini kişilere değer payıyla dağıtır (altın/döviz: aynı fiyat hareketi). */
export function allocateByValue<T extends { value: number }>(
  rows: T[],
  classChange: number,
): Array<T & { dayChange: number }> {
  const total = rows.reduce((s, r) => s + r.value, 0);
  return rows.map((r) => ({ ...r, dayChange: total > 0 ? classChange * (r.value / total) : 0 }));
}

// Yahoo günlük seri yardımcıları — saf (server olmayan) fonksiyonlar.
// stock-prices.ts "use server" olduğundan yalnızca async export edebilir;
// bu saf fonksiyonlar test edilebilsin diye burada tutulur.

/**
 * BIST seansı UTC gün sınırını (00:00) hiçbir zaman aşmaz (yaklaşık 07:00–15:00
 * UTC), dolayısıyla bir günlük mumun UTC tarihi = işlem günüdür.
 */
export function utcDate(epochSec: number): string {
  return new Date(epochSec * 1000).toISOString().slice(0, 10);
}

export interface DailyBar {
  date: string; // YYYY-MM-DD (UTC)
  close: number;
}

/** Hizalı timestamp + close dizilerini null'sız günlük mumlara çevir. */
export function buildBars(timestamps: number[], closesRaw: Array<number | null>): DailyBar[] {
  const n = Math.min(timestamps.length, closesRaw.length);
  const bars: DailyBar[] = [];
  for (let i = 0; i < n; i++) {
    const c = closesRaw[i];
    const t = timestamps[i];
    if (typeof c === "number" && Number.isFinite(c) && typeof t === "number") {
      bars.push({ date: utcDate(t), close: c });
    }
  }
  return bars;
}

/**
 * Günlük değişim için "önceki kapanış": bugünün (canlı seans) mumunu TARİH
 * bazında dışlayıp bir önceki işlem gününün kapanışını döndürür.
 *
 * Eski yöntem `|son − fiyat| / fiyat < 0.5%` heuristiğiyle "son mum bugünün mü"
 * diye tahmin ediyordu; Yahoo'nun 5g/1g serisi seans sırasında BIST için
 * bugünün oluşan mumunu içermediğinden (son mum = dün), bu heuristik canlı
 * fiyat düne yakınken yanlış tetikleniyor ve baz olarak yanlışlıkla 2 gün
 * önceki kapanışı alıp günlük % değerini bozuyordu. Tarih karşılaştırması bu
 * off-by-one'ı tümüyle ortadan kaldırır:
 *   - Son mum bugünse  → curDate'ten önceki son mum = dün ✔
 *   - Bugünün mumu yoksa (son mum = dün) → yine dün ✔
 * `marketTimeSec` yoksa referans olarak serinin son mumunun tarihi kullanılır.
 *
 * closes serisi düzeltilmiş (split/bedelli) olduğundan bedelli sonrası
 * Yahoo'nun ham `previousClose` alanının yanlışlığından da etkilenmez.
 */
export function priorCloseFromBars(bars: DailyBar[], marketTimeSec: number | null): number | null {
  if (bars.length === 0) return null;
  const curDate = marketTimeSec != null ? utcDate(marketTimeSec) : bars[bars.length - 1].date;
  for (let i = bars.length - 1; i >= 0; i--) {
    if (bars[i].date < curDate) return bars[i].close;
  }
  return null;
}

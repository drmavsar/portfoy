// Saf logic — DB bağımsız. CPI ile reel getiri hesabı.
// Sprint-3 PR-2+ getiri motorunda batch hesap için reuse edilir.

/**
 * Fisher denklemi — reel getiri.
 *
 *   real = ((1 + nominal_ratio) / (1 + inflation_ratio)) - 1
 *
 * Türkiye enflasyonu yüksek olduğu için kaba çıkarma (`nominal - inflation`)
 * önemli hata verir. Bu yüzden Fisher zorunlu.
 *
 * @param nominalReturn Ondalık form: 0.45 = %45 (TRY bazında brüt veya net)
 * @param inflationReturn Ondalık form: 0.30 = %30 CPI değişimi (aynı dönem)
 * @returns Reel getiri ondalık (0.115 = %11.5)
 */
export function realReturnFisher(
  nominalReturn: number,
  inflationReturn: number,
): number {
  return ((1 + nominalReturn) / (1 + inflationReturn)) - 1;
}

/**
 * İki endeks değerinden oran (büyüme): (end / start) - 1.
 * Reel getiri hesabında nominal_ratio ve inflation_ratio için kullanılır.
 */
export function ratioBetween(start: number, end: number): number {
  if (!Number.isFinite(start) || !Number.isFinite(end) || start <= 0) {
    return Number.NaN;
  }
  return (end / start) - 1;
}

/**
 * Bir NAV tarihini CPI periyodu olarak yuvarla.
 *
 * TÜFE aylık veridir ve TÜİK genelde bir ay gecikmeli yayınlar. NAV tarihinin
 * o ayı için endeks henüz yayımlanmamış olabilir. En güvenli yaklaşım:
 *   NAV as_of → CPI period = (as_of'un BİR ÖNCEKİ ayı)
 *
 * Örnek: NAV as_of='2026-05-15' → CPI period='2026-04'
 *
 * @param navIsoDate "YYYY-MM-DD" formatında NAV tarihi
 * @returns "YYYY-MM" formatında CPI period
 */
export function cpiPeriodForNavDate(navIsoDate: string): string {
  const [yearStr, monthStr] = navIsoDate.slice(0, 7).split("-");
  let year = Number(yearStr);
  let month = Number(monthStr) - 1; // bir önceki ay
  if (month === 0) {
    month = 12;
    year -= 1;
  }
  return `${year.toString().padStart(4, "0")}-${month.toString().padStart(2, "0")}`;
}

/**
 * NAV başlangıcı + bitiş tarihleri için reel getiri.
 *
 * @param nominalReturn Bu pencere için TRY nominal getiri
 * @param startCpi Pencere başlangıcına denk gelen endeks (cpiPeriodForNavDate ile)
 * @param endCpi Pencere bitişine denk gelen endeks
 * @returns Reel getiri veya endeks eksikse null
 */
export function realReturnFromCpiPair(
  nominalReturn: number,
  startCpi: number | null | undefined,
  endCpi: number | null | undefined,
): number | null {
  if (startCpi == null || endCpi == null) return null;
  if (!Number.isFinite(startCpi) || !Number.isFinite(endCpi)) return null;
  if (startCpi <= 0) return null;
  const inflation = (endCpi / startCpi) - 1;
  return realReturnFisher(nominalReturn, inflation);
}

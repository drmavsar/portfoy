/* ============================================================
   Türkiye bireysel vergi parametreleri (gelir yılına göre).
   Kaynak: GİB yıllık had ve tutarlar; GVK md. 21, 86, 103,
   geçici 67 Cumhurbaşkanı kararları. Yeni yıl açıklanınca buraya
   eklenir — tanımsız yılda hesaplar "parametre yok" döner.
   ============================================================ */

export interface TrTaxYearParams {
  year: number;
  /** GVK 103 ücret dışı tarife: üst sınırlar (son dilim sınırsız) */
  brackets: number[];
  /** Dilim oranları (brackets.length + 1 adet) */
  rates: number[];
  /** Konut kira geliri istisnası (GVK 21) */
  konutKiraIstisna: number;
  /** Ücret + MSİ + GMSİ + diğer gelirler toplamı bunu aşarsa konut
   *  istisnası uygulanmaz (ücret tarifesi 3. dilim) */
  konutIstisnaUstSinir: number;
  /** Tevkifata tabi MSİ/GMSİ beyan sınırı (GVK 86/1-c; tarifenin 2. dilimi).
   *  Kâr payında istisna sonrası (brütün yarısı) tutar bununla karşılaştırılır. */
  tevkifatliIratBeyanSiniri: number;
}

const RATES = [0.15, 0.2, 0.27, 0.35, 0.4];

export const TR_TAX_PARAMS: Record<number, TrTaxYearParams> = {
  2024: {
    year: 2024,
    brackets: [110_000, 230_000, 580_000, 3_000_000],
    rates: RATES,
    konutKiraIstisna: 33_000,
    konutIstisnaUstSinir: 870_000,
    tevkifatliIratBeyanSiniri: 230_000,
  },
  2025: {
    year: 2025,
    brackets: [158_000, 330_000, 800_000, 4_300_000],
    rates: RATES,
    konutKiraIstisna: 47_000,
    konutIstisnaUstSinir: 1_200_000,
    tevkifatliIratBeyanSiniri: 330_000,
  },
  2026: {
    year: 2026,
    brackets: [190_000, 400_000, 1_000_000, 5_300_000],
    rates: RATES,
    konutKiraIstisna: 58_000,
    konutIstisnaUstSinir: 1_500_000,
    tevkifatliIratBeyanSiniri: 400_000,
  },
};

export function taxParamsFor(year: number): TrTaxYearParams | null {
  return TR_TAX_PARAMS[year] ?? null;
}

/** Artan oranlı gelir vergisi (GVK 103). */
export function progressiveIncomeTax(matrah: number, p: Pick<TrTaxYearParams, "brackets" | "rates">): number {
  if (!(matrah > 0)) return 0;
  let tax = 0;
  let lower = 0;
  for (let i = 0; i < p.rates.length; i++) {
    const upper = i < p.brackets.length ? p.brackets[i] : Infinity;
    if (matrah <= lower) break;
    tax += (Math.min(matrah, upper) - lower) * p.rates[i];
    lower = upper;
  }
  return tax;
}

/** Kâr payı stopajı: 22.12.2024'ten itibaren %15 (Karar 9286), öncesi %10. */
export function dividendWithholdingRate(isoDate: string): number {
  return isoDate >= "2024-12-22" ? 0.15 : 0.1;
}

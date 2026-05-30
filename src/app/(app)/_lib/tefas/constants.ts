import type {
  FundInvestmentUniverse,
  FundTaxConfidence,
  FundTaxKind,
} from "@/lib/types/database";

export const TAX_KIND_LABELS: Record<FundTaxKind, string> = {
  HSYF_0_STOPAJ: "HSYF · %0 stopaj",
  GENEL_17_5: "Genel · %17.5 stopaj",
  DOVIZ_BAZLI: "Döviz bazlı · belirsiz",
  SERBEST_FON: "Serbest fon · belirsiz",
  BELIRSIZ: "Belirsiz",
};

export const TAX_CONFIDENCE_LABELS: Record<FundTaxConfidence, string> = {
  HIGH: "Yüksek güven",
  MEDIUM: "Orta güven",
  LOW: "Düşük güven",
  NONE: "Bilinmiyor",
};

export const INVESTMENT_UNIVERSE_LABELS: Record<FundInvestmentUniverse, string> = {
  BIST_HISSE_TR: "BIST hisse (TR)",
  BIST_KATILIM_30: "BIST Katılım 30 endeksi",
  KIRA_SERTIFIKASI_TRY: "Kira sertifikası (TL)",
  KIRA_SERTIFIKASI_FX: "Kira sertifikası (döviz)",
  ALTIN: "Altın",
  GUMUS: "Gümüş",
  KIYMETLI_MADEN_KARMA: "Kıymetli maden (karma)",
  TEKNOLOJI_HISSE: "Teknoloji hissesi",
  SEKTOREL_BIST: "Sektörel BIST",
  KATILIM_PARA_PIYASASI: "Katılım para piyasası",
  COKLU_VARLIK: "Çoklu varlık",
  ULUSLARARASI_HISSE: "Uluslararası hisse",
  DOVIZ_SERBEST_USD: "Döviz serbest (USD)",
  DOVIZ_SERBEST_EUR: "Döviz serbest (EUR)",
  ARBITRAJ: "Arbitraj",
  FON_SEPETI: "Fon sepeti",
  DIGER: "Diğer",
};

/**
 * `funds.tax_confidence` ve `ResolvedTaxRule.effective_rate` etkileşimi:
 * effective_rate null ise gerçek güven LOW'dan yukarı çıkamaz — fon master
 * HIGH dese bile.
 */
export function clampConfidenceForRate(
  baseConfidence: FundTaxConfidence,
  effectiveRate: number | null,
): FundTaxConfidence {
  if (effectiveRate !== null) return baseConfidence;
  if (baseConfidence === "HIGH" || baseConfidence === "MEDIUM") return "LOW";
  return baseConfidence;
}

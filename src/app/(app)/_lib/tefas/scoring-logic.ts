// Saf logic — DB bağımsız. Bileşen skorları + Mehmet Score.
//
// Tüm bileşen skorları 0-100 ölçeğindedir. Mehmet Score persona
// ağırlıklarıyla ağırlıklı toplamdır.

import type {
  FundInvestmentUniverse,
  FundTaxKind,
  UserPersona,
} from "./types";

/** clamp(x, 0, 100) ve yuvarla. */
function clamp100(x: number | null): number | null {
  if (x == null || !Number.isFinite(x)) return null;
  return Math.max(0, Math.min(100, Math.round(x)));
}

/**
 * Enflasyon koruması skoru. real_1y'den türetilir.
 *   real_1y = 0   → 50 (enflasyona yetişti)
 *   real_1y = +0.25 → 100
 *   real_1y = -0.25 → 0
 */
export function inflationProtectionScore(real_1y: number | null): number | null {
  if (real_1y == null) return null;
  return clamp100(50 + real_1y * 200);
}

/**
 * Stopaj avantajı skoru. applied_tax_kind'tan türetilir.
 *   HSYF_0_STOPAJ → 100
 *   GENEL_17_5    → 30
 *   DOVIZ_BAZLI   → 50
 *   SERBEST_FON   → 25
 *   BELIRSIZ      → 0
 */
const TAX_ADVANTAGE_SCORES: Record<FundTaxKind, number> = {
  HSYF_0_STOPAJ: 100,
  GENEL_17_5: 30,
  DOVIZ_BAZLI: 50,
  SERBEST_FON: 25,
  BELIRSIZ: 0,
};

export function taxAdvantageScore(kind: FundTaxKind | string | null): number | null {
  if (kind == null) return null;
  const score = TAX_ADVANTAGE_SCORES[kind as FundTaxKind];
  return score ?? null;
}

/**
 * Risk skoru — risk-logic.normalizedRiskScore zaten 0-100 döndürüyor.
 * Burası yalnız persona max_volatility_pct'i öğrenip risk-logic'e iletir.
 *
 * Bu fonksiyon doğrudan kullanılmıyor; refresh akışında risk-logic'in
 * `normalizedRiskScore(volatility, persona.max_volatility_pct)` çağrısı
 * sonucu cache'e yazılır. Burada test edilebilir wrapper olarak duruyor.
 */
export function riskScoreFromVolatility(
  volatility: number | null,
  maxVolatility: number = 0.40,
): number | null {
  if (volatility == null || !Number.isFinite(volatility)) return null;
  if (volatility < 0) return null;
  if (maxVolatility <= 0) return null;
  return clamp100(100 * (1 - volatility / maxVolatility));
}

/**
 * Uzun vadeli performans skoru.
 *
 * Önce `vs_category_net_3y`'a bakılır (kategori medyanına göre konum,
 * stopaj sonrası). Yoksa `vs_category_3y` (brüt) fallback.
 *
 *   vs = 0      → 50 (medyan)
 *   vs = +0.25  → 100 (kategori liderine yakın)
 *   vs = -0.25  → 0
 */
export function longTermPerformanceScore(
  vs_category_net_3y: number | null,
  vs_category_3y: number | null = null,
): number | null {
  const v = vs_category_net_3y ?? vs_category_3y;
  if (v == null) return null;
  return clamp100(50 + v * 200);
}

/**
 * Çeşitlendirme katkısı skoru — investment_universe tablosu.
 *
 * Mevcut portföye bakmadan, fonun "BIST'ten ne kadar uzak" olduğunu kabaca
 * ölçer. Kovaryans-tabanlı tam versiyon Sprint-6'ya bırakıldı.
 */
const DIVERSIFICATION_SCORES: Record<FundInvestmentUniverse, number> = {
  BIST_HISSE_TR: 30,
  BIST_KATILIM_30: 30,
  SEKTOREL_BIST: 35,
  TEKNOLOJI_HISSE: 35,
  ULUSLARARASI_HISSE: 60,
  KIRA_SERTIFIKASI_TRY: 75,
  KIRA_SERTIFIKASI_FX: 78,
  ALTIN: 80,
  GUMUS: 78,
  KIYMETLI_MADEN_KARMA: 82,
  KATILIM_PARA_PIYASASI: 60,
  COKLU_VARLIK: 90,
  FON_SEPETI: 90,
  DOVIZ_SERBEST_USD: 70,
  DOVIZ_SERBEST_EUR: 70,
  ARBITRAJ: 65,
  DIGER: 50,
};

export function diversificationScore(
  universe: FundInvestmentUniverse | string | null,
): number | null {
  if (universe == null) return null;
  return DIVERSIFICATION_SCORES[universe as FundInvestmentUniverse] ?? null;
}

/**
 * BIST bağımlılık skoru.
 *
 * Sprint-4 PR-3 sade versiyonu: hesaplanmış korelasyon (Sprint-5+) yoksa
 * `investment_universe`'a göre default. Sprint-5'te price_snapshots'tan
 * Pearson korelasyon hesabı eklenecek.
 */
const BIST_DEFAULT_BY_UNIVERSE: Record<FundInvestmentUniverse, number> = {
  BIST_HISSE_TR: 100,
  BIST_KATILIM_30: 100,
  SEKTOREL_BIST: 95,
  TEKNOLOJI_HISSE: 85,
  ULUSLARARASI_HISSE: 30,
  KIRA_SERTIFIKASI_TRY: 10,
  KIRA_SERTIFIKASI_FX: 5,
  ALTIN: 5,
  GUMUS: 5,
  KIYMETLI_MADEN_KARMA: 5,
  KATILIM_PARA_PIYASASI: 5,
  COKLU_VARLIK: 50,
  FON_SEPETI: 40,
  DOVIZ_SERBEST_USD: 10,
  DOVIZ_SERBEST_EUR: 10,
  ARBITRAJ: 30,
  DIGER: 30,
};

export function bistDependencyScore(
  correlation_1y: number | null,
  universeFallback: FundInvestmentUniverse | string | null,
): number | null {
  if (correlation_1y != null && Number.isFinite(correlation_1y)) {
    return clamp100(correlation_1y * 100);
  }
  if (universeFallback == null) return null;
  const def = BIST_DEFAULT_BY_UNIVERSE[universeFallback as FundInvestmentUniverse];
  return def ?? null;
}

/**
 * Altın bağımlılık skoru. Sprint-4 PR-3 sade versiyonu: universe default.
 * XAU ingest Sprint-5'e ertelendi.
 */
const GOLD_DEFAULT_BY_UNIVERSE: Record<FundInvestmentUniverse, number> = {
  ALTIN: 100,
  KIYMETLI_MADEN_KARMA: 70,
  GUMUS: 40,
  BIST_HISSE_TR: 0,
  BIST_KATILIM_30: 0,
  SEKTOREL_BIST: 0,
  TEKNOLOJI_HISSE: 0,
  ULUSLARARASI_HISSE: 0,
  KIRA_SERTIFIKASI_TRY: 0,
  KIRA_SERTIFIKASI_FX: 0,
  KATILIM_PARA_PIYASASI: 0,
  COKLU_VARLIK: 15,
  FON_SEPETI: 15,
  DOVIZ_SERBEST_USD: 5,
  DOVIZ_SERBEST_EUR: 5,
  ARBITRAJ: 0,
  DIGER: 5,
};

export function goldDependencyScore(
  correlation_1y: number | null,
  universeFallback: FundInvestmentUniverse | string | null,
): number | null {
  if (correlation_1y != null && Number.isFinite(correlation_1y)) {
    return clamp100(correlation_1y * 100);
  }
  if (universeFallback == null) return null;
  const def = GOLD_DEFAULT_BY_UNIVERSE[universeFallback as FundInvestmentUniverse];
  return def ?? null;
}

/**
 * Mehmet Score = persona ağırlıkları × bileşen skorları.
 *
 * Eksik bileşen davranışı: **esnek**. Mevcut bileşenlerin ağırlıkları
 * normalize edilir, eksik olanlar warning'e eklenir.
 *
 * Minimum 3/5 bileşen dolu olmalı; yoksa null + warning
 * `"insufficient_components"`.
 */
export interface MehmetScoreComponents {
  inflation_protection_score: number | null;
  tax_advantage_score: number | null;
  normalized_risk_score: number | null;
  long_term_performance_score: number | null;
  diversification_score: number | null;
}

export interface MehmetScoreResult {
  score: number | null;
  components_used: number;
  warnings: string[];
}

const MIN_COMPONENTS_REQUIRED = 3;

export function computeMehmetScore(
  components: MehmetScoreComponents,
  persona: Pick<
    UserPersona,
    | "inflation_weight"
    | "tax_weight"
    | "risk_weight"
    | "long_term_weight"
    | "diversification_weight"
  >,
): MehmetScoreResult {
  const items: Array<{ key: string; value: number | null; weight: number }> = [
    { key: "inflation_protection", value: components.inflation_protection_score, weight: persona.inflation_weight },
    { key: "tax_advantage", value: components.tax_advantage_score, weight: persona.tax_weight },
    { key: "risk", value: components.normalized_risk_score, weight: persona.risk_weight },
    { key: "long_term_performance", value: components.long_term_performance_score, weight: persona.long_term_weight },
    { key: "diversification", value: components.diversification_score, weight: persona.diversification_weight },
  ];

  const warnings: string[] = [];
  let weightedSum = 0;
  let availableWeight = 0;
  let components_used = 0;

  for (const it of items) {
    if (it.value == null) {
      warnings.push(`missing_${it.key}`);
      continue;
    }
    weightedSum += it.value * it.weight;
    availableWeight += it.weight;
    components_used++;
  }

  if (components_used < MIN_COMPONENTS_REQUIRED) {
    return {
      score: null,
      components_used,
      warnings: [...warnings, "insufficient_components"],
    };
  }

  if (availableWeight <= 0) {
    return {
      score: null,
      components_used,
      warnings: [...warnings, "zero_available_weight"],
    };
  }

  // Esnek normalize: eksik bileşenlerin ağırlığını kalan bileşenlere dağıt
  const normalized = weightedSum / availableWeight;
  return {
    score: clamp100(normalized),
    components_used,
    warnings,
  };
}

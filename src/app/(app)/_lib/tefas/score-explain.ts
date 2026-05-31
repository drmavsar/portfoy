// Sprint-5.5 PR-1 — Skor açıklanabilirlik motoru.
//
// Pure (DB/Next.js/UI bağımsız). Bir fonun Mehmet Score'unu görsel kart için
// gerekli tüm yapılandırılmış parçalara dönüştürür:
//   - breakdown: 5 component (raw_score / weight / contribution / status)
//   - strengths/weaknesses: deterministik kurallarla maddeler
//   - tax_impact: brüt-net farkı + HSYF olsaydı karşı-olgu
//   - category_rank: sıra + percentile band + medalya
//   - similar_funds: yakın skorlu + kategori liderleri
//   - data_quality_flags: warnings'lerden türetilmiş kullanıcı dostu uyarılar
//   - history_compare: 7g/30g/90g (caller history'yi ayrı fetch eder)
//
// LLM yok, ham metin sabit kalıp + sayısal doldurmadan oluşur. Yasak kelime
// regex'i ile garanti.

import type {
  Fund,
  FundCategory,
  FundReturns,
  FundScores,
  FundTaxKind,
  UserPersona,
} from "./types";

// ──────────────────────────────────────────────────────────────────────────
// Types
// ──────────────────────────────────────────────────────────────────────────

export type ComponentKey =
  | "inflation_protection"
  | "tax_advantage"
  | "risk"
  | "long_term_performance"
  | "diversification";

export type LabelStatus = "strong" | "ok" | "weak" | "missing";

export interface ScoreBreakdownItem {
  key: ComponentKey;
  label_tr: string;
  raw_score: number | null;
  weight_pct: number;
  /** raw_score * weight_pct / 100; null ise contribution null. */
  contribution: number | null;
  label_status: LabelStatus;
}

export type FlagSeverity = "info" | "warn" | "critical";
export interface ExplanationFlag {
  key: string;
  severity: FlagSeverity;
  label: string;
  detail?: string;
}

export interface TaxImpact {
  applied_tax_kind: FundTaxKind | null;
  applied_tax_rate: number | null;
  gross_1y: number | null;
  net_1y: number | null;
  /** gross - net (decimal, 0.11 = 11 puan). */
  points_diff: number | null;
  /** points_diff / gross (decimal). */
  pct_of_gross: number | null;
  /** Görsel için tek satır özet. */
  label: string;
  hsyf_counterfactual: {
    already_hsyf: boolean;
    /** Eğer HSYF olsaydı net 1Y ne olurdu (=gross_1y). */
    hypothetical_net_1y: number | null;
    /** points_diff (HSYF değilse), 0 (HSYF ise). */
    points_lost_to_tax: number | null;
    label: string;
  };
}

export type PercentileBand =
  | "ust_5"
  | "ust_10"
  | "ust_ceyrek"
  | "ust_yari"
  | "alt_yari"
  | "alt_ceyrek";

export interface CategoryRank {
  rank: number;
  total: number;
  /** 0-1; rank/total. */
  percentile: number;
  band: PercentileBand;
  band_label: string;
  medal: "🥇" | "🥈" | "🥉" | null;
  medal_label: string | null;
  /** Kategoride <5 fon varsa kullanıcıya uyarı. */
  category_size_note: string | null;
}

export interface SimilarFund {
  code: string;
  name: string | null;
  score: number;
  /** "Skor 72" gibi kısa açıklama. */
  reason: string;
}

export interface SimilarFundsResult {
  /** Mevcut fonun skoruna yakın (±NEAR_SCORE_DELTA), kategori içi, kendisi hariç. */
  near_score: SimilarFund[];
  /** Kategori top 3, kendisi hariç. */
  category_leaders: SimilarFund[];
  /** Mevcut fon kategori 1'incisi mi? */
  is_self_leader: boolean;
  disclaimer: string;
}

export interface ScoreHistoryPeriod {
  score: number | null;
  delta: number | null;
}

export interface ScoreHistoryCompare {
  current: number | null;
  d7: ScoreHistoryPeriod | null;
  d30: ScoreHistoryPeriod | null;
  d90: ScoreHistoryPeriod | null;
  has_any_history: boolean;
  /** "Tarihçe oluşuyor (N gün biriktirildi)" gibi UI mesajı için. */
  buildup_label: string | null;
}

export interface FundExplanation {
  total_score: number | null;
  components_used: number | null;
  breakdown: ScoreBreakdownItem[];
  strengths: string[];
  weaknesses: string[];
  data_quality_flags: ExplanationFlag[];
  tax_impact: TaxImpact;
  category_rank: CategoryRank | null;
  similar_funds: SimilarFundsResult;
  history_compare: ScoreHistoryCompare;
}

export interface CategoryPeerInput {
  fund_code: string;
  name: string | null;
  mehmet_score: number | null;
}

export interface ExplainFundScoreInput {
  fund: Pick<Fund, "code" | "name" | "category_id" | "investment_universe" | "is_equity_intensive">;
  category: FundCategory | null;
  scores: FundScores;
  returns: FundReturns | null;
  persona: Pick<
    UserPersona,
    | "inflation_weight"
    | "tax_weight"
    | "risk_weight"
    | "long_term_weight"
    | "diversification_weight"
  >;
  category_peers: CategoryPeerInput[];
  history?: {
    d7?: { score: number | null } | null;
    d30?: { score: number | null } | null;
    d90?: { score: number | null } | null;
    /** Tablodaki en eski snapshot — "tarihçe oluşuyor" mesajı için. */
    earliest_snapshot_days_ago?: number | null;
  };
}

// ──────────────────────────────────────────────────────────────────────────
// Sabitler
// ──────────────────────────────────────────────────────────────────────────

const STRONG_THRESHOLD = 75;
const WEAK_THRESHOLD = 30;
/** Yakın skorlu fonlar penceresi (±). */
const NEAR_SCORE_DELTA = 5;
/** Kategori liderleri için top N. */
const CATEGORY_LEADERS_TOP = 3;
/** Strengths/weaknesses başına maksimum madde. */
const MAX_POINTS = 4;
/** Korelasyon yüksek eşiği. */
const HIGH_CORRELATION = 0.85;
/** vs_category_net belirgin eşiği. */
const VS_CATEGORY_MEANINGFUL = 0.05;

const COMPONENT_LABELS: Record<ComponentKey, string> = {
  inflation_protection: "Enflasyon koruması",
  tax_advantage: "Stopaj avantajı",
  risk: "Risk dengesi",
  long_term_performance: "Uzun vadeli performans",
  diversification: "Çeşitlendirme katkısı",
};

/**
 * Yatırım tavsiyesi içerebilecek yasak kelimeler. Test ile zorunlu.
 * Unicode-aware lookaround — Türkçe "satın"/"alma"/"satış" gibi türevleri
 * filtreden geçirir; sadece tam "al"/"sat" standalone kelime yakalanır.
 */
export const FORBIDDEN_WORDS_RE =
  /(?<![\p{L}\d])(?:al|sat|kesinlikle|tavsiye|portföyüne ekle|yatırım tavsiyesi)(?![\p{L}\d])/iu;

const DISCLAIMER = "Bu yatırım tavsiyesi değildir; veri tabanlı karar destek görünümüdür.";

// ──────────────────────────────────────────────────────────────────────────
// Yardımcılar
// ──────────────────────────────────────────────────────────────────────────

function pctStr(v: number | null | undefined, digits = 1): string {
  if (v == null || !Number.isFinite(v)) return "—";
  const sign = v > 0 ? "+" : "";
  return `${sign}%${(v * 100).toFixed(digits)}`;
}

function statusFor(raw: number | null): LabelStatus {
  if (raw == null) return "missing";
  if (raw >= STRONG_THRESHOLD) return "strong";
  if (raw <= WEAK_THRESHOLD) return "weak";
  return "ok";
}

// ──────────────────────────────────────────────────────────────────────────
// Breakdown
// ──────────────────────────────────────────────────────────────────────────

function buildBreakdown(input: ExplainFundScoreInput): ScoreBreakdownItem[] {
  const s = input.scores;
  const p = input.persona;
  const items: Array<[ComponentKey, number | null, number]> = [
    ["inflation_protection", s.inflation_protection_score, p.inflation_weight],
    ["tax_advantage", s.tax_advantage_score, p.tax_weight],
    ["risk", s.normalized_risk_score, p.risk_weight],
    ["long_term_performance", s.long_term_performance_score, p.long_term_weight],
    ["diversification", s.diversification_score, p.diversification_weight],
  ];
  return items.map(([key, raw, weight]) => ({
    key,
    label_tr: COMPONENT_LABELS[key],
    raw_score: raw,
    weight_pct: weight,
    contribution: raw == null ? null : (raw * weight) / 100,
    label_status: statusFor(raw),
  }));
}

// ──────────────────────────────────────────────────────────────────────────
// Strengths / Weaknesses
// ──────────────────────────────────────────────────────────────────────────

function buildStrengths(input: ExplainFundScoreInput): string[] {
  const s = input.scores;
  const r = input.returns;
  const out: string[] = [];

  if ((s.inflation_protection_score ?? -1) >= STRONG_THRESHOLD) {
    const real = r?.real_1y;
    if (real != null && real > 0) {
      out.push(`Enflasyon üstünde reel getiri (${pctStr(real)})`);
    } else {
      out.push("Enflasyon koruması yüksek");
    }
  }
  if ((s.tax_advantage_score ?? -1) >= STRONG_THRESHOLD) {
    if (input.fund.is_equity_intensive) {
      out.push("HSYF — stopaj %0 avantajı");
    } else {
      out.push("Stopaj yükü düşük");
    }
  }
  if ((s.normalized_risk_score ?? -1) >= STRONG_THRESHOLD) {
    const vol = s.volatility_1y;
    if (vol != null && vol < 0.20) {
      out.push(`Risk dengesi kontrollü (volatilite ${pctStr(vol)})`);
    } else {
      out.push("Risk dengesi kontrollü");
    }
  }
  if ((s.long_term_performance_score ?? -1) >= STRONG_THRESHOLD) {
    const vs = r?.vs_category_net_3y ?? r?.vs_category_3y;
    if (vs != null && vs > 0) {
      out.push(`3Y performans kategori medyanı üstünde (${pctStr(vs)})`);
    } else {
      out.push("Uzun vadeli performans güçlü");
    }
  }
  if ((s.diversification_score ?? -1) >= STRONG_THRESHOLD) {
    out.push("Çeşitlendirme katkısı yüksek (çoklu varlık)");
  }

  // Cross-component: vs kategori 1Y belirgin pozitif
  const vs1y = r?.vs_category_net_1y ?? null;
  if (vs1y != null && vs1y > VS_CATEGORY_MEANINGFUL) {
    out.push(`Kategori medyanının belirgin üzerinde (${pctStr(vs1y)} net 1Y)`);
  }

  return out.slice(0, MAX_POINTS);
}

function buildWeaknesses(input: ExplainFundScoreInput): string[] {
  const s = input.scores;
  const r = input.returns;
  const out: string[] = [];

  if ((s.inflation_protection_score ?? 101) <= WEAK_THRESHOLD) {
    const real = r?.real_1y;
    if (real != null && real < 0) {
      out.push(`Enflasyonun altında kalmış (${pctStr(real)} reel)`);
    } else {
      out.push("Reel getiri zayıf");
    }
  }
  if ((s.tax_advantage_score ?? 101) <= WEAK_THRESHOLD) {
    out.push("Stopaj yükü standart oranlarda");
  }
  if ((s.normalized_risk_score ?? 101) <= WEAK_THRESHOLD) {
    const vol = s.volatility_1y;
    const mdd = s.max_drawdown_3y;
    if (vol != null && vol > 0.35) {
      out.push(`Volatilite yüksek (${pctStr(vol)})`);
    } else if (mdd != null && mdd < -0.30) {
      out.push(`Max drawdown belirgin (${pctStr(mdd)})`);
    } else {
      out.push("Risk profili yüksek");
    }
  }
  if ((s.long_term_performance_score ?? 101) <= WEAK_THRESHOLD) {
    const vs = r?.vs_category_net_3y ?? r?.vs_category_3y;
    if (vs != null && vs < 0) {
      out.push(`3Y performans kategori medyanı altında (${pctStr(vs)})`);
    } else {
      out.push("Uzun vadeli performans zayıf");
    }
  }
  if ((s.diversification_score ?? 101) <= WEAK_THRESHOLD) {
    out.push("Tek varlık türü — çeşitlendirme dar");
  }

  // Cross-component: yüksek BIST korelasyonu
  const bistCorr = s.bist_correlation_1y;
  if (bistCorr != null && bistCorr > HIGH_CORRELATION) {
    out.push(`BIST'le yüksek korelasyon (${bistCorr.toFixed(2)}) — diversifier değil`);
  }
  const goldCorr = s.gold_correlation_1y;
  if (goldCorr != null && goldCorr > HIGH_CORRELATION) {
    out.push(`Altınla yüksek korelasyon (${goldCorr.toFixed(2)})`);
  }
  // Kategori medyanı altı
  const vs1y = r?.vs_category_net_1y ?? null;
  if (vs1y != null && vs1y < -VS_CATEGORY_MEANINGFUL) {
    out.push(`Kategori medyanı altında (${pctStr(vs1y)} net 1Y)`);
  }

  return out.slice(0, MAX_POINTS);
}

// ──────────────────────────────────────────────────────────────────────────
// Tax Impact + HSYF counterfactual
// ──────────────────────────────────────────────────────────────────────────

function buildTaxImpact(input: ExplainFundScoreInput): TaxImpact {
  const r = input.returns;
  const taxKind = (r?.applied_tax_kind as FundTaxKind | null | undefined) ?? null;
  const taxRate = r?.applied_tax_rate ?? null;
  const gross = r?.gross_1y ?? null;
  const net = r?.net_1y ?? null;

  const pointsDiff = gross != null && net != null ? gross - net : null;
  const pctOfGross =
    pointsDiff != null && gross != null && gross > 0 ? pointsDiff / gross : null;

  const alreadyHsyf = taxKind === "HSYF_0_STOPAJ" || taxRate === 0;

  // Label
  let label: string;
  if (gross == null) {
    label = "Stopaj etkisi hesaplanamadı (brüt 1Y eksik)";
  } else if (net == null) {
    label = "Stopaj etkisi hesaplanamadı (net 1Y eksik)";
  } else if (alreadyHsyf || pointsDiff === 0) {
    label = "0 puan (HSYF avantajı)";
  } else if (pointsDiff != null) {
    const pctPart = pctOfGross != null ? ` (brütün ${pctStr(pctOfGross, 0)})` : "";
    label = `-${(pointsDiff * 100).toFixed(0)} puan${pctPart}`;
  } else {
    label = "—";
  }

  // Counterfactual: HSYF olsaydı (= net 1Y == gross 1Y)
  const hypotheticalNet = alreadyHsyf ? net : gross;
  const pointsLost = alreadyHsyf ? 0 : pointsDiff;
  let cfLabel: string;
  if (alreadyHsyf) {
    cfLabel = "Bu fon zaten HSYF (%0 stopaj)";
  } else if (pointsLost != null) {
    cfLabel = `HSYF olsaydı +${(pointsLost * 100).toFixed(0)} puan kazanım`;
  } else {
    cfLabel = "HSYF karşılaştırması hesaplanamadı";
  }

  return {
    applied_tax_kind: taxKind,
    applied_tax_rate: taxRate,
    gross_1y: gross,
    net_1y: net,
    points_diff: pointsDiff,
    pct_of_gross: pctOfGross,
    label,
    hsyf_counterfactual: {
      already_hsyf: alreadyHsyf,
      hypothetical_net_1y: hypotheticalNet,
      points_lost_to_tax: pointsLost,
      label: cfLabel,
    },
  };
}

// ──────────────────────────────────────────────────────────────────────────
// Category Rank + Medal + Percentile Band
// ──────────────────────────────────────────────────────────────────────────

function bandFromPercentile(p: number): { band: PercentileBand; label: string } {
  if (p <= 0.05) return { band: "ust_5", label: "Üst %5'lik dilim" };
  if (p <= 0.10) return { band: "ust_10", label: "Üst %10'luk dilim" };
  if (p <= 0.25) return { band: "ust_ceyrek", label: "Üst çeyrek" };
  if (p <= 0.50) return { band: "ust_yari", label: "Üst yarı" };
  if (p <= 0.75) return { band: "alt_yari", label: "Alt yarı" };
  return { band: "alt_ceyrek", label: "Alt çeyrek" };
}

function medalFromRank(rank: number): {
  medal: "🥇" | "🥈" | "🥉" | null;
  label: string | null;
} {
  if (rank === 1) return { medal: "🥇", label: "Lider" };
  if (rank <= 3) return { medal: "🥈", label: "İlk 3" };
  if (rank <= 5) return { medal: "🥉", label: "İlk 5" };
  return { medal: null, label: null };
}

function buildCategoryRank(input: ExplainFundScoreInput): CategoryRank | null {
  const self = input.fund.code;
  const peers = input.category_peers.filter((p) => p.mehmet_score != null);
  if (peers.length === 0) return null;
  // DESC sıralama; eşit skorda code'a göre stabilize et.
  const sorted = [...peers].sort((a, b) => {
    const sb = b.mehmet_score ?? -1;
    const sa = a.mehmet_score ?? -1;
    if (sb !== sa) return sb - sa;
    return a.fund_code.localeCompare(b.fund_code);
  });
  const rank = sorted.findIndex((p) => p.fund_code === self) + 1;
  if (rank === 0) return null; // fon kategoride değil (skor null olabilir)
  const total = sorted.length;
  const percentile = rank / total;
  const { band, label: band_label } = bandFromPercentile(percentile);
  const { medal, label: medal_label } = medalFromRank(rank);
  const category_size_note =
    total < 5 ? `Kategori dar (${total} skorlu fon)` : null;
  return {
    rank,
    total,
    percentile,
    band,
    band_label,
    medal,
    medal_label,
    category_size_note,
  };
}

// ──────────────────────────────────────────────────────────────────────────
// Similar Funds
// ──────────────────────────────────────────────────────────────────────────

function buildSimilarFunds(input: ExplainFundScoreInput): SimilarFundsResult {
  const self = input.fund.code;
  const selfScore = input.scores.mehmet_score;
  const peers = input.category_peers.filter(
    (p) => p.fund_code !== self && p.mehmet_score != null,
  );
  // Sıralama: skor DESC, kod ASC stabilizasyon
  const sorted = [...peers].sort((a, b) => {
    const diff = (b.mehmet_score ?? -1) - (a.mehmet_score ?? -1);
    if (diff !== 0) return diff;
    return a.fund_code.localeCompare(b.fund_code);
  });

  // Yakın skorlu: ±NEAR_SCORE_DELTA pencere
  const near_score: SimilarFund[] =
    selfScore == null
      ? []
      : sorted
          .filter(
            (p) =>
              p.mehmet_score != null &&
              Math.abs(p.mehmet_score - selfScore) <= NEAR_SCORE_DELTA,
          )
          .slice(0, CATEGORY_LEADERS_TOP)
          .map((p) => ({
            code: p.fund_code,
            name: p.name,
            score: p.mehmet_score as number,
            reason: `Skor ${p.mehmet_score}`,
          }));

  // Kategori liderleri: top 3
  const category_leaders: SimilarFund[] = sorted
    .slice(0, CATEGORY_LEADERS_TOP)
    .map((p) => ({
      code: p.fund_code,
      name: p.name,
      score: p.mehmet_score as number,
      reason: `Kategori lideri · Skor ${p.mehmet_score}`,
    }));

  // is_self_leader: kendi skoru kategori en yükseğine eşit/üstündeyse
  const topPeerScore = sorted[0]?.mehmet_score ?? null;
  const is_self_leader =
    selfScore != null && topPeerScore != null && selfScore >= topPeerScore;

  return {
    near_score,
    category_leaders,
    is_self_leader,
    disclaimer: DISCLAIMER,
  };
}

// ──────────────────────────────────────────────────────────────────────────
// Data Quality Flags
// ──────────────────────────────────────────────────────────────────────────

function buildFlags(input: ExplainFundScoreInput): ExplanationFlag[] {
  const flags: ExplanationFlag[] = [];
  const sWarnings = input.scores.warnings ?? [];
  const rWarnings = input.returns?.warnings ?? [];
  const allWarnings = [...sWarnings, ...rWarnings];

  // CPI fallback
  if (allWarnings.includes("cpi_lag_fallback_used")) {
    const lagW = allWarnings.find((w) => /^cpi_lag_months=\d+$/.test(w));
    const lag = lagW ? lagW.split("=")[1] : "?";
    flags.push({
      key: "cpi_lag_fallback_used",
      severity: "warn",
      label: `CPI ${lag} ay gecikmeli kullanıldı`,
      detail: "Reel getiri hesabı en son available CPI dönemiyle yapıldı.",
    });
  }

  if (allWarnings.includes("no_1y_history")) {
    flags.push({
      key: "no_1y_history",
      severity: "critical",
      label: "1Y NAV geçmişi yok",
    });
  }
  if (allWarnings.includes("no_3y_history")) {
    flags.push({
      key: "no_3y_history",
      severity: "info",
      label: "3Y geçmişi henüz oluşmadı",
    });
  }
  if (allWarnings.includes("no_5y_history")) {
    flags.push({
      key: "no_5y_history",
      severity: "info",
      label: "5Y geçmişi henüz oluşmadı",
    });
  }

  // Tax confidence
  const taxConf = input.returns?.tax_confidence;
  if (taxConf === "LOW" || taxConf === "NONE") {
    flags.push({
      key: "tax_confidence_low",
      severity: "warn",
      label: "Stopaj güveni düşük",
      detail: taxConf === "NONE" ? "Stopaj kuralı eşleşmedi" : "Düşük güvenle eşleşti",
    });
  }

  // Components used
  const cu = input.scores.components_used ?? 0;
  if (cu > 0 && cu < 3) {
    flags.push({
      key: "insufficient_components",
      severity: "critical",
      label: `Skor hesaplanamadı (${cu}/5 component)`,
    });
  } else if (cu > 0 && cu < 5) {
    flags.push({
      key: "partial_components",
      severity: "info",
      label: `Tüm bileşenler hesaplanamadı (${cu}/5)`,
    });
  }

  // Korelasyon yüksek (diversifier değil)
  const bistCorr = input.scores.bist_correlation_1y;
  if (bistCorr != null && bistCorr > HIGH_CORRELATION) {
    flags.push({
      key: "high_bist_correlation",
      severity: "info",
      label: `BIST'le yüksek korelasyon (${bistCorr.toFixed(2)})`,
    });
  }

  return flags;
}

// ──────────────────────────────────────────────────────────────────────────
// History Compare
// ──────────────────────────────────────────────────────────────────────────

function buildHistoryCompare(input: ExplainFundScoreInput): ScoreHistoryCompare {
  const current = input.scores.mehmet_score;
  const h = input.history ?? {};
  const periodCompare = (
    snap: { score: number | null } | null | undefined,
  ): ScoreHistoryPeriod | null => {
    if (snap == null) return null;
    const score = snap.score;
    const delta = score != null && current != null ? current - score : null;
    return { score, delta };
  };
  const d7 = periodCompare(h.d7 ?? null);
  const d30 = periodCompare(h.d30 ?? null);
  const d90 = periodCompare(h.d90 ?? null);
  const has_any_history = d7 != null || d30 != null || d90 != null;
  const buildup =
    h.earliest_snapshot_days_ago != null && !has_any_history
      ? `Tarihçe oluşuyor (${h.earliest_snapshot_days_ago} gün biriktirildi)`
      : null;
  return {
    current,
    d7,
    d30,
    d90,
    has_any_history,
    buildup_label: buildup,
  };
}

// ──────────────────────────────────────────────────────────────────────────
// Public API
// ──────────────────────────────────────────────────────────────────────────

export function explainFundScore(input: ExplainFundScoreInput): FundExplanation {
  return {
    total_score: input.scores.mehmet_score,
    components_used: input.scores.components_used,
    breakdown: buildBreakdown(input),
    strengths: buildStrengths(input),
    weaknesses: buildWeaknesses(input),
    data_quality_flags: buildFlags(input),
    tax_impact: buildTaxImpact(input),
    category_rank: buildCategoryRank(input),
    similar_funds: buildSimilarFunds(input),
    history_compare: buildHistoryCompare(input),
  };
}

/** Test ve dış doğrulama için ortak yardımcılar dışa açık. */
export const __internals = {
  bandFromPercentile,
  medalFromRank,
  statusFor,
  STRONG_THRESHOLD,
  WEAK_THRESHOLD,
  NEAR_SCORE_DELTA,
};

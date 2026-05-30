// Algoritmik Komite Notu — pure logic, DB bağımsız.
// Sprint-5 PR-3. Sprint-7'de LLM güzelleştirme bu metni input olarak alacak.
//
// Şablon:
//   {FUND_CODE} {PERFORMANCE}, {TAX} ve {INFLATION}.
//   Ancak {RISK}, {DEPENDENCY}. {VOLATILITY}.
//
// Eksik clause'lar atlanır (null cümle yazılmaz). Tamamen yetersiz veri →
// "yeterli geçmiş veri yok" notu döner.
//
// Asla "öneri/al/sat/tavsiye" gibi kelimeler kullanılmaz; bu kullanıcı
// kararının değil, veri özetinin sunumudur.

import type {
  FundInvestmentUniverse,
  FundTaxKind,
  UserPersona,
} from "./types";

export interface KomiteNotuInput {
  fund_code: string;
  // Getiri & kategori karşılaştırma
  gross_3y_cagr: number | null;
  net_1y: number | null;
  real_1y: number | null;
  vs_category_3y: number | null; // brüt veya net — fallback brüt
  vs_category_net_3y: number | null;
  // Stopaj
  applied_tax_kind: FundTaxKind | string | null;
  applied_tax_rate: number | null;
  tax_confidence: string | null;
  // Risk & korelasyon
  volatility_1y: number | null;
  max_drawdown_3y: number | null;
  normalized_risk_score: number | null;
  bist_dependency_score: number | null;
  gold_dependency_score: number | null;
  investment_universe: FundInvestmentUniverse | string | null;
  // Persona profili (eşik karşılaştırma için)
  persona: Pick<UserPersona, "max_volatility_pct">;
}

export interface KomiteNotuOutput {
  text: string;
  clauses_used: string[]; // hangi clause'lar üretildi (debug/audit)
  is_sufficient: boolean; // en az 2 clause varsa true
}

const DISCLAIMER = "Bu yorum yatırım tavsiyesi değildir; veri tabanlı karar destek notudur.";

/** ondalık → %, +/- işaretli */
function pct(v: number, digits = 0): string {
  const sign = v > 0 ? "+" : "";
  return `${sign}%${(v * 100).toFixed(digits)}`;
}

function performanceClause(input: KomiteNotuInput): string | null {
  const vs = input.vs_category_net_3y ?? input.vs_category_3y;
  if (vs == null || !Number.isFinite(vs)) return null;
  if (input.gross_3y_cagr == null) return null;
  const cagrStr = pct(input.gross_3y_cagr, 0);
  if (vs > 0.02) {
    return `son 3 yılda kategorisini (${cagrStr} CAGR ile, medyan ${pct(vs)} üstü) yenmiş`;
  }
  if (vs < -0.02) {
    return `son 3 yılda kategorisinin altında kalmış (${cagrStr} CAGR, medyan ${pct(vs)})`;
  }
  return `son 3 yılda kategori medyanına yakın bir performans göstermiş (${cagrStr} CAGR)`;
}

function taxClause(input: KomiteNotuInput): string | null {
  if (!input.applied_tax_kind) return null;
  const conf = input.tax_confidence ?? "NONE";
  const confSuffix = conf === "HIGH" ? "" :
    conf === "MEDIUM" ? " (orta güvenle)" : " (belirsizlik var)";
  switch (input.applied_tax_kind) {
    case "HSYF_0_STOPAJ":
      return `stopaj avantajı (%0 HSYF) taşıyor`;
    case "GENEL_17_5":
      return `standart %17.5 stopaja tabi${confSuffix}`;
    case "DOVIZ_BAZLI":
      return `döviz bazlı stopaj uygulamasına tabi${confSuffix}`;
    case "SERBEST_FON":
      return `serbest fon olarak stopaj prospektusa bağlı${confSuffix}`;
    case "BELIRSIZ":
      return `stopaj durumu belirsiz`;
    default:
      return null;
  }
}

function inflationClause(input: KomiteNotuInput): string | null {
  if (input.real_1y == null) return null;
  if (input.real_1y > 0.02) {
    return `enflasyon üstünde ${pct(input.real_1y)} reel getiri sağlamış`;
  }
  if (input.real_1y < -0.02) {
    return `enflasyonun altında kalmış (${pct(input.real_1y)} reel)`;
  }
  return `enflasyonu yaklaşık karşılamış (${pct(input.real_1y, 1)} reel)`;
}

function riskClause(input: KomiteNotuInput): string | null {
  if (input.volatility_1y == null) return null;
  const maxVol = input.persona.max_volatility_pct ?? 0.40;
  const volPct = input.volatility_1y;
  if (volPct > maxVol) {
    return `volatilite (${pct(volPct, 0)}) persona sınırını (${pct(maxVol, 0)}) aşıyor`;
  }
  if (volPct > maxVol * 0.75) {
    return `volatilite (${pct(volPct, 0)}) persona sınırına yakın`;
  }
  return `volatilite (${pct(volPct, 0)}) Mehmet profili için kabul edilebilir`;
}

function dependencyClause(input: KomiteNotuInput): string | null {
  const bist = input.bist_dependency_score;
  const gold = input.gold_dependency_score;
  if (bist == null && gold == null) return null;
  const parts: string[] = [];
  if (bist != null && bist >= 70) parts.push("BIST bağımlılığı yüksek");
  if (gold != null && gold >= 70) parts.push("altın bağımlılığı baskın");
  if (parts.length > 0) return parts.join(", ");
  if (bist != null && bist <= 20 && gold != null && gold <= 20) {
    return `tek bir piyasaya bağımlı değil`;
  }
  return null;
}

function drawdownClause(input: KomiteNotuInput): string | null {
  if (input.max_drawdown_3y == null) return null;
  const dd = input.max_drawdown_3y;
  if (dd > -0.10) return null; // önemsiz
  if (dd < -0.30) {
    return `3 yıllık en kötü düşüş ${pct(dd, 0)} ile derin`;
  }
  return `3 yıllık en kötü düşüş ${pct(dd, 0)}`;
}

export function generateKomiteNotu(input: KomiteNotuInput): KomiteNotuOutput {
  const perf = performanceClause(input);
  const tax = taxClause(input);
  const infl = inflationClause(input);
  const risk = riskClause(input);
  const dep = dependencyClause(input);
  const dd = drawdownClause(input);

  const clauses_used: string[] = [];
  const positiveParts: string[] = [];
  const cautionParts: string[] = [];

  if (perf) {
    positiveParts.push(perf);
    clauses_used.push("performance");
  }
  if (tax) {
    positiveParts.push(tax);
    clauses_used.push("tax");
  }
  if (infl) {
    positiveParts.push(infl);
    clauses_used.push("inflation");
  }
  if (risk) {
    cautionParts.push(risk);
    clauses_used.push("risk");
  }
  if (dep) {
    cautionParts.push(dep);
    clauses_used.push("dependency");
  }
  if (dd) {
    cautionParts.push(dd);
    clauses_used.push("drawdown");
  }

  const is_sufficient = clauses_used.length >= 2;

  if (!is_sufficient) {
    return {
      text:
        `${input.fund_code} için yeterli geçmiş veri bulunmuyor; karar destek notu kısa.\n\n${DISCLAIMER}`,
      clauses_used,
      is_sufficient,
    };
  }

  // Cümle birleşimi
  const sentences: string[] = [];

  if (positiveParts.length > 0) {
    sentences.push(`${input.fund_code} ${joinClauses(positiveParts)}.`);
  } else {
    sentences.push(`${input.fund_code} hakkında pozitif gözlem üretilemedi.`);
  }

  if (cautionParts.length > 0) {
    const prefix = positiveParts.length > 0 ? "Ancak " : `${input.fund_code} için `;
    sentences.push(`${prefix}${joinClauses(cautionParts)}.`);
  }

  return {
    text: `${sentences.join(" ")}\n\n${DISCLAIMER}`,
    clauses_used,
    is_sufficient,
  };
}

/** Türkçe doğal birleşim: A · A ve B · A, B ve C */
function joinClauses(parts: string[]): string {
  if (parts.length === 0) return "";
  if (parts.length === 1) return parts[0];
  if (parts.length === 2) return `${parts[0]} ve ${parts[1]}`;
  return `${parts.slice(0, -1).join(", ")} ve ${parts[parts.length - 1]}`;
}

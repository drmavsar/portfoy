// Sprint-5.5 PR-1 — Skor kalibrasyonu simülatörü.
//
// Pure. Persona ağırlıklarını override ederek tüm fonlar için yeni
// mehmet_score'u in-memory hesaplar. DB'ye yazmaz. /fonlar/kalibrasyon
// sayfası için.
//
// computeMehmetScore mevcut formülü ile 1:1 aynı (parametrik persona) —
// simülasyon "gerçek" skor mantığıyla uyumlu.

import {
  computeMehmetScore,
  type MehmetScoreComponents,
} from "./scoring-logic";

export interface PersonaWeights {
  inflation_weight: number;
  tax_weight: number;
  risk_weight: number;
  long_term_weight: number;
  diversification_weight: number;
}

export const MEHMET_DEFAULT_WEIGHTS: PersonaWeights = {
  inflation_weight: 25,
  tax_weight: 20,
  risk_weight: 20,
  long_term_weight: 20,
  diversification_weight: 15,
};

export type PresetKey =
  | "mehmet_default"
  | "defensive"
  | "growth"
  | "tax_efficient"
  | "inflation_hedge";

export interface Preset {
  key: PresetKey;
  label_tr: string;
  description: string;
  weights: PersonaWeights;
}

export const PRESETS: Preset[] = [
  {
    key: "mehmet_default",
    label_tr: "Mehmet Default",
    description: "Mevcut persona ağırlıkları (25/20/20/20/15)",
    weights: MEHMET_DEFAULT_WEIGHTS,
  },
  {
    key: "defensive",
    label_tr: "Defansif",
    description: "Sermaye koruma + stopaj avantajı",
    weights: {
      inflation_weight: 30,
      tax_weight: 25,
      risk_weight: 25,
      long_term_weight: 10,
      diversification_weight: 10,
    },
  },
  {
    key: "growth",
    label_tr: "Büyüme",
    description: "Uzun vade getiri + çeşitlendirme",
    weights: {
      inflation_weight: 15,
      tax_weight: 10,
      risk_weight: 15,
      long_term_weight: 35,
      diversification_weight: 25,
    },
  },
  {
    key: "tax_efficient",
    label_tr: "Stopaj Verimli",
    description: "HSYF / döviz bazlı bias",
    weights: {
      inflation_weight: 20,
      tax_weight: 35,
      risk_weight: 20,
      long_term_weight: 15,
      diversification_weight: 10,
    },
  },
  {
    key: "inflation_hedge",
    label_tr: "Enflasyon Hedge",
    description: "Reel koruma ağırlık",
    weights: {
      inflation_weight: 40,
      tax_weight: 15,
      risk_weight: 20,
      long_term_weight: 15,
      diversification_weight: 10,
    },
  },
];

export interface SimulationInputFund {
  fund_code: string;
  name: string | null;
  category_id: number | null;
  components: MehmetScoreComponents;
}

export interface RankedFund {
  fund_code: string;
  name: string | null;
  score: number | null;
  rank: number; // 1-based; null skor ise rank = sorted.length + 1
  components_used: number;
}

export interface ScoreMover {
  fund_code: string;
  name: string | null;
  rank_old: number;
  rank_new: number;
  delta: number; // rank_old - rank_new (pozitif = yukarı çıktı)
  score_old: number | null;
  score_new: number | null;
}

export interface SimulationResult {
  baseline_weights: PersonaWeights;
  override_weights: PersonaWeights;
  top_n: number;
  rankings_baseline: RankedFund[];
  rankings_simulated: RankedFund[];
  movers_up: ScoreMover[];
  movers_down: ScoreMover[];
  added_to_topn: string[];
  removed_from_topn: string[];
}

function rankFunds(
  funds: SimulationInputFund[],
  weights: PersonaWeights,
): RankedFund[] {
  const scored = funds.map((f) => {
    const result = computeMehmetScore(f.components, weights);
    return {
      fund_code: f.fund_code,
      name: f.name,
      score: result.score,
      components_used: result.components_used,
    };
  });
  // DESC skor, null'lar sonda; eşitlik tie-breaker fund_code ASC
  scored.sort((a, b) => {
    if (a.score == null && b.score == null) return a.fund_code.localeCompare(b.fund_code);
    if (a.score == null) return 1;
    if (b.score == null) return -1;
    if (b.score !== a.score) return b.score - a.score;
    return a.fund_code.localeCompare(b.fund_code);
  });
  return scored.map((s, i) => ({ ...s, rank: i + 1 }));
}

function buildMovers(
  baseline: RankedFund[],
  simulated: RankedFund[],
  topN: number,
): {
  movers_up: ScoreMover[];
  movers_down: ScoreMover[];
  added_to_topn: string[];
  removed_from_topn: string[];
} {
  const baseRankByCode = new Map(baseline.map((f) => [f.fund_code, f]));
  const simRankByCode = new Map(simulated.map((f) => [f.fund_code, f]));

  const allCodes = new Set([
    ...baseRankByCode.keys(),
    ...simRankByCode.keys(),
  ]);

  const movers: ScoreMover[] = [];
  for (const code of allCodes) {
    const b = baseRankByCode.get(code);
    const s = simRankByCode.get(code);
    if (!b || !s) continue;
    const delta = b.rank - s.rank;
    if (delta === 0) continue;
    movers.push({
      fund_code: code,
      name: s.name,
      rank_old: b.rank,
      rank_new: s.rank,
      delta,
      score_old: b.score,
      score_new: s.score,
    });
  }

  const movers_up = movers
    .filter((m) => m.delta > 0)
    .sort((a, b) => b.delta - a.delta || a.rank_new - b.rank_new)
    .slice(0, 5);
  const movers_down = movers
    .filter((m) => m.delta < 0)
    .sort((a, b) => a.delta - b.delta || a.rank_new - b.rank_new)
    .slice(0, 5);

  const baseTopN = new Set(baseline.slice(0, topN).map((f) => f.fund_code));
  const simTopN = new Set(simulated.slice(0, topN).map((f) => f.fund_code));
  const added_to_topn = [...simTopN].filter((c) => !baseTopN.has(c));
  const removed_from_topn = [...baseTopN].filter((c) => !simTopN.has(c));

  return { movers_up, movers_down, added_to_topn, removed_from_topn };
}

export function simulateScores(
  funds: SimulationInputFund[],
  baselineWeights: PersonaWeights,
  overrideWeights: PersonaWeights,
  topN: number = 20,
): SimulationResult {
  const rankings_baseline = rankFunds(funds, baselineWeights);
  const rankings_simulated = rankFunds(funds, overrideWeights);
  const { movers_up, movers_down, added_to_topn, removed_from_topn } =
    buildMovers(rankings_baseline, rankings_simulated, topN);
  return {
    baseline_weights: baselineWeights,
    override_weights: overrideWeights,
    top_n: topN,
    rankings_baseline,
    rankings_simulated,
    movers_up,
    movers_down,
    added_to_topn,
    removed_from_topn,
  };
}

/** Ağırlıkların toplamı (slider UI için sanity-check). */
export function weightsSum(w: PersonaWeights): number {
  return (
    w.inflation_weight +
    w.tax_weight +
    w.risk_weight +
    w.long_term_weight +
    w.diversification_weight
  );
}

/** Ağırlıkları 100'e normalize et (slider sürtünmesi tolere). */
export function normalizeWeights(w: PersonaWeights): PersonaWeights {
  const sum = weightsSum(w);
  if (sum <= 0) return MEHMET_DEFAULT_WEIGHTS;
  const k = 100 / sum;
  return {
    inflation_weight: w.inflation_weight * k,
    tax_weight: w.tax_weight * k,
    risk_weight: w.risk_weight * k,
    long_term_weight: w.long_term_weight * k,
    diversification_weight: w.diversification_weight * k,
  };
}

// Sprint-5.6 PR-B — Portfolio simulator (pure).
//
// Top N seçim + ağırlık verildiğinde, NAV serisi üzerinde günlük portfolio
// değerini izler. Rebalance noktasında pozisyon resetlenir.
//
// Look-ahead bias yok: tüm fetch'ler caller'a düşer; bu helper sadece
// matematik yapar.

import type { NavSeriesPoint } from "./types";

export interface PortfolioHolding {
  fund_code: string;
  units: number;          // o fonun adet/birim sayısı
  weight_at_rebalance: number;  // başlangıçta verilen ağırlık (audit)
}

export interface PortfolioState {
  /** Pozisyonlar — fund_code → units */
  holdings: Map<string, PortfolioHolding>;
  /** Cash bakiyesi (rebalance arasında genelde 0). */
  cash: number;
}

/** Bir günde portfolio'nun değerini hesapla (units × nav_at_day + cash). */
export function valuePortfolio(
  state: PortfolioState,
  navAtDay: Map<string, number>,
): number {
  let total = state.cash;
  for (const [code, holding] of state.holdings) {
    const nav = navAtDay.get(code);
    if (nav != null && Number.isFinite(nav) && nav > 0) {
      total += holding.units * nav;
    }
    // NAV yoksa: en son bilinen ağırlık × eski value — basitlik için ignore;
    // praktik olarak fund_prices sıralı, eksik gün rebalance arasında nadirdir.
  }
  return total;
}

/** Rebalance: tüm pozisyonları nakde çevir, yeni Top N'i al. */
export function rebalance(
  state: PortfolioState,
  topNCodes: string[],
  topNWeights: number[],
  navAtRebalanceDay: Map<string, number>,
): PortfolioState {
  // 1. Mevcut pozisyonları sat (rebalance günü NAV'ından)
  let cash = state.cash;
  for (const [code, holding] of state.holdings) {
    const nav = navAtRebalanceDay.get(code);
    if (nav != null && nav > 0) {
      cash += holding.units * nav;
    }
  }

  // 2. Toplam cash'i yeni Top N ağırlıklarına böl
  const newHoldings = new Map<string, PortfolioHolding>();
  for (let i = 0; i < topNCodes.length; i++) {
    const code = topNCodes[i];
    const weight = topNWeights[i];
    const nav = navAtRebalanceDay.get(code);
    if (nav == null || nav <= 0 || weight <= 0) continue;
    const cashForThis = cash * weight;
    const units = cashForThis / nav;
    newHoldings.set(code, {
      fund_code: code,
      units,
      weight_at_rebalance: weight,
    });
  }
  // Tahsis edilemeyen residual cash kalır (NAV bulunmayan fonlar için)
  let usedCash = 0;
  for (const holding of newHoldings.values()) {
    const nav = navAtRebalanceDay.get(holding.fund_code)!;
    usedCash += holding.units * nav;
  }
  return {
    holdings: newHoldings,
    cash: cash - usedCash,
  };
}

/**
 * Turnover — bir önceki Top N ile yenisini karşılaştırır.
 *
 * `turnover = sum(|new_weight - old_weight|) / 2`
 *
 * Tek bir fonun ağırlığı %10 → %15 olursa, başka bir fon eksilecek demektir.
 * Mutlak farkın yarısı pozisyon değişim yoğunluğunu verir.
 */
export function computeTurnover(
  prevWeightsByCode: Map<string, number>,
  newWeightsByCode: Map<string, number>,
): number {
  const allCodes = new Set([...prevWeightsByCode.keys(), ...newWeightsByCode.keys()]);
  let diff = 0;
  for (const code of allCodes) {
    const prev = prevWeightsByCode.get(code) ?? 0;
    const curr = newWeightsByCode.get(code) ?? 0;
    diff += Math.abs(prev - curr);
  }
  return diff / 2;
}

/** Overlap — Jaccard index (önceki Top N ∩ yeni / önceki Top N ∪ yeni). */
export function computeOverlap(prev: string[], curr: string[]): number | null {
  if (prev.length === 0 && curr.length === 0) return null;
  const setA = new Set(prev);
  const setB = new Set(curr);
  let intersection = 0;
  for (const code of setA) {
    if (setB.has(code)) intersection++;
  }
  const union = setA.size + setB.size - intersection;
  return union > 0 ? intersection / union : null;
}

/** Tüm nav_series'ten sadece portfolio_nav sayısal seri (metric hesabı için). */
export function extractPortfolioSeries(navSeries: NavSeriesPoint[]): number[] {
  return navSeries.map((p) => p.portfolio_nav);
}

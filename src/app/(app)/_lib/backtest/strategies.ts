// Sprint-5.6 PR-B — Strateji ağırlık hesabı (pure).
//
// 2 strateji:
//   - equal_weight    : 1/N
//   - score_weighted  : score / sum(scores), %20 hard cap iteratif redistribute
//
// applyCap: tipik 1-3 iterasyonda yakınsar; max 10 iterasyon (sonsuz döngü
// koruması). Cap doygun (TopN=5 + cap=0.20 = 5×20%=100%) durumda
// equal_weight'e çöker.

import type { BacktestStrategy } from "./types";

export const MAX_WEIGHT_CAP = 0.20;
const MAX_CAP_ITERATIONS = 10;
const EPS = 1e-9;

/**
 * Toplam ağırlığı 1.0 koruyarak hiçbir ağırlık `cap`'i geçmeyecek şekilde
 * iteratif redistribute eder.
 *
 * Algoritma:
 *   while any(w > cap):
 *     excess = sum(max(0, w - cap))
 *     w = min(w, cap)
 *     undercap_total = sum(w for w in weights if w < cap)
 *     redistribute excess proportionally to undercap weights
 *
 * Eğer N × cap <= 1 (örn. cap=0.20, N=4 → 0.8) → "doygun olmayan" boş kapasite
 * yok, redistribute yapamayız → equal_weight'e fallback.
 */
export function applyCap(weights: number[], cap: number = MAX_WEIGHT_CAP): number[] {
  const n = weights.length;
  if (n === 0) return [];
  if (cap <= 0 || cap >= 1) return [...weights];

  // Eğer N × cap <= 1, sadece "cap × N" toplam üretebiliriz → equal weight'e
  // çöker. Aslında N × cap < 1 ise rebalance imkansız.
  if (n * cap <= 1 + EPS) {
    return Array(n).fill(1 / n);
  }

  // Önce normalize et (cap algorithması ağırlıkların toplamının 1 olduğunu
  // varsayar).
  const sum = weights.reduce((a, b) => a + b, 0);
  if (sum <= 0) return Array(n).fill(1 / n);
  let w = weights.map((x) => x / sum);

  for (let iter = 0; iter < MAX_CAP_ITERATIONS; iter++) {
    const overcap = w.map((x) => Math.max(0, x - cap));
    const excess = overcap.reduce((a, b) => a + b, 0);
    if (excess < EPS) break;
    // Cap'le
    w = w.map((x) => Math.min(x, cap));
    // Cap'in altında kalanların payı
    const undercapWeights = w.map((x) => (x < cap - EPS ? x : 0));
    const undercapTotal = undercapWeights.reduce((a, b) => a + b, 0);
    if (undercapTotal <= 0) {
      // Hepsi cap'te — daha fazla redistribute yapamayız (doygun)
      break;
    }
    w = w.map((x, i) =>
      x < cap - EPS ? x + (excess * undercapWeights[i]) / undercapTotal : x,
    );
  }

  // Floating-point hatalarını düzelt: küçük taşmalarda kırp + normalize
  w = w.map((x) => Math.min(x, cap));
  const finalSum = w.reduce((a, b) => a + b, 0);
  if (finalSum > 0 && Math.abs(finalSum - 1) > EPS) {
    w = w.map((x) => x / finalSum);
  }
  return w;
}

/**
 * Strateji handler — Top N fonlar için ağırlık vektörü üretir.
 *
 * Top N input:
 *   [{ score: 73 }, { score: 72 }, ...]
 *
 * Output: toplam 1.0 olan numerik vektör, indeks-eş eşleşmesi.
 */
export function buildWeights(
  topN: Array<{ score: number | null }>,
  strategy: BacktestStrategy,
): number[] {
  const n = topN.length;
  if (n === 0) return [];

  if (strategy === "equal_weight") {
    return Array(n).fill(1 / n);
  }

  // score_weighted: null skorları 0 say; sonra cap uygula.
  const scores = topN.map((f) => f.score ?? 0);
  const sum = scores.reduce((a, b) => a + b, 0);
  if (sum <= 0) {
    // Hepsi null/sıfır → equal_weight fallback
    return Array(n).fill(1 / n);
  }
  const raw = scores.map((s) => s / sum);
  return applyCap(raw, MAX_WEIGHT_CAP);
}

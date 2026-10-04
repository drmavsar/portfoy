// Backtest senaryo takvimi (pure) — sabit tarih yok.
//
// Eskiden başlangıçlar ["2022-01-03" … "2025-01-02"] ve bitiş "2026-05-26"
// koda gömülüydü; yeni yıl hiç eklenmiyor, sonuçlar Mayıs 2026'da donuyordu.
// Artık:
//   - Bitiş: bir önceki ayın son günü. Ay içinde sabit kalır → aynı ay içinde
//     tekrar çalıştırma aynı parametreleri üretir (idempotent atlama çalışır),
//     her ay başında pencere kendiliğinden ilerler.
//   - Başlangıçlar: FIRST_SCENARIO_YEAR'dan itibaren her yılın ilk iş günü;
//     bitişe en az MIN_SCENARIO_DAYS gün kalan yıllar dahil.

import { addDays, daysBetween } from "./dates";
import type { BacktestStrategy } from "./types";

export const FIRST_SCENARIO_YEAR = 2022;
/** Bundan kısa pencere anlamlı CAGR/alfa üretmez. */
export const MIN_SCENARIO_DAYS = 180;

/**
 * Motor davranışını değiştiren son düzeltmenin zamanı (reel CAGR, iş günü
 * volatilitesi, ileri fiyatlama, hayatta kalma yanlılığı — PR #228'in
 * birleşmesi). Bundan önce üretilmiş sonuçlar bayat sayılır ve yeniden
 * hesaplanır. Motor yeniden değişirse bu zaman güncellenir.
 */
export const BACKTEST_ENGINE_VERSION_AT = "2026-10-04T16:46:26Z";

/** "YYYY-MM-DD" → bir önceki ayın son günü. */
export function backtestEndDate(today: string): string {
  const firstOfMonth = `${today.slice(0, 7)}-01`;
  return addDays(firstOfMonth, -1);
}

/** Yılın ilk iş günü (1 Ocak resmi tatil → 2 Ocak'tan itibaren ilk hafta içi). */
export function firstBusinessDayOfYear(year: number): string {
  let d = `${year}-01-02`;
  for (let i = 0; i < 7; i++) {
    const dow = new Date(`${d}T00:00:00Z`).getUTCDay(); // 0 Pazar, 6 Cumartesi
    if (dow !== 0 && dow !== 6) return d;
    d = addDays(d, 1);
  }
  return d;
}

/** Bugüne göre senaryo başlangıç tarihleri (artan). */
export function backtestScenarios(today: string): string[] {
  const end = backtestEndDate(today);
  const out: string[] = [];
  const lastYear = Number(end.slice(0, 4));
  for (let y = FIRST_SCENARIO_YEAR; y <= lastYear; y++) {
    const start = firstBusinessDayOfYear(y);
    if (daysBetween(start, end) >= MIN_SCENARIO_DAYS) out.push(start);
  }
  return out;
}

/** Faz-2 optimizasyon matrisi: 3 TopN × 4 rebalance × 2 strateji = 24. */
export const MATRIX_TOP_NS = [5, 10, 20] as const;
export const MATRIX_REBALANCE_DAYS = [30, 90, 180, 365] as const;
export const MATRIX_STRATEGIES: BacktestStrategy[] = ["equal_weight", "score_weighted"];

export interface MatrixCombo {
  top_n: number;
  rebalance_days: number;
  strategy: BacktestStrategy;
}

/**
 * Matris kombinasyonları öncelik sırasıyla: önce GO/NO-GO'nun dayandığı
 * yapılandırma (iki strateji), sonra Faz-1 taban (Top10 × 90g), sonra kalanı.
 * Zaman bütçesi dolarsa en önemliler hesaplanmış olur.
 */
export function prioritizedMatrix(
  best: { top_n: number; rebalance_days: number },
  baseline: { top_n: number; rebalance_days: number },
): MatrixCombo[] {
  const all: MatrixCombo[] = [];
  for (const top_n of MATRIX_TOP_NS) {
    for (const rebalance_days of MATRIX_REBALANCE_DAYS) {
      for (const strategy of MATRIX_STRATEGIES) all.push({ top_n, rebalance_days, strategy });
    }
  }
  const rank = (c: MatrixCombo) =>
    c.top_n === best.top_n && c.rebalance_days === best.rebalance_days
      ? 0
      : c.top_n === baseline.top_n && c.rebalance_days === baseline.rebalance_days
        ? 1
        : 2;
  return all
    .map((c, i) => ({ c, i }))
    .sort((a, b) => rank(a.c) - rank(b.c) || a.i - b.i)
    .map((x) => x.c);
}

/** Aynı senaryo + kombinasyonu tanımlayan anahtar (bitiş tarihi hariç). */
export function runKey(p: { start_date: string; top_n: number; rebalance_days: number; strategy: string }): string {
  return `${p.start_date}|${p.top_n}|${p.rebalance_days}|${p.strategy}`;
}

export interface StoredRun {
  id: string;
  created_at: string;
  params: { start_date: string; end_date: string; top_n: number; rebalance_days: number; strategy: string };
}

/**
 * Her anahtar için en yeni çalıştırma; yalnız güncel senaryolar. Eski motorla
 * ya da eski bitiş tarihiyle üretilmiş sonuçlar, yenisi gelince devre dışı.
 */
export function latestRunsByKey<T extends StoredRun>(runs: T[], scenarios: string[]): T[] {
  const allowed = new Set(scenarios);
  const best = new Map<string, T>();
  for (const r of runs) {
    if (!allowed.has(r.params.start_date)) continue;
    const k = runKey(r.params);
    const cur = best.get(k);
    if (!cur || Date.parse(r.created_at) > Date.parse(cur.created_at)) best.set(k, r);
  }
  return [...best.values()];
}

/**
 * Bir çalıştırma güncel mi: aynı bitiş tarihiyle, motor düzeltmesinden ve son
 * TÜFE güncellemesinden SONRA üretilmiş olmalı (TÜFE gelince reel getiri değişir).
 */
export function isFreshRun(
  run: StoredRun,
  endDate: string,
  cpiUpdatedAt: string | null,
): boolean {
  if (run.params.end_date !== endDate) return false;
  const created = Date.parse(run.created_at);
  if (!(created >= Date.parse(BACKTEST_ENGINE_VERSION_AT))) return false;
  if (cpiUpdatedAt && created < Date.parse(cpiUpdatedAt)) return false;
  return true;
}

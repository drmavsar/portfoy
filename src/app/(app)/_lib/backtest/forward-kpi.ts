// Sprint-5.6 PR-D — Forward Test KPI helpers (pure).
//
// fund_scores_history üzerinden 5 KPI hesaplar. Backtest engine ile aynı
// "Top N seçimi" yapar ama tarihsel rekompüt değil; o tarihteki cache
// snapshot'ından okur.

export interface DailySnapshot {
  /** YYYY-MM-DD */
  date: string;
  /** Top N fon kodları, score DESC sıralı */
  top_n_codes: string[];
}

export interface ForwardTestKPIs {
  /** 1 - avg(daily turnover). 1'e yakın stabil, 0'a yakın volatil. */
  top10_stability: number | null;
  /** Bir fonun Top N'de kaldığı gün sayısının ortalaması. */
  avg_holding_days: number | null;
  /** İlk 3 fon değişimi: 30 gün başına Top 3 değişen fon sayısı ortalaması. */
  top3_change_rate: number | null;
  /** Toplam turnover (period boyunca avg daily turnover). */
  turnover: number | null;
  /**
   * Top10 Koruma Oranı (30 gün) — t0 Top N'i 30 gün sonra Top N'de hâlâ
   * kaç tanesi var. 0-1 arası ortalama (window üzerinden).
   */
  top10_retention_30d: number | null;
  /** Hesap için gereken snapshot sayısı. */
  snapshots_used: number;
}

/** İki ardışık günlük Top N arasındaki turnover (Jaccard tabanlı). */
export function dailyTurnover(prev: string[], curr: string[]): number {
  const setA = new Set(prev);
  const setB = new Set(curr);
  let intersection = 0;
  for (const c of setA) if (setB.has(c)) intersection++;
  const union = setA.size + setB.size - intersection;
  if (union === 0) return 0;
  // Turnover = 1 - jaccard
  return 1 - intersection / union;
}

/**
 * Bir fonun Top N'de kaldığı gün sayılarının ortalaması (per-fund).
 * Diziye her gün için fonun varlık/yokluk durumuna göre run length hesaplar.
 */
export function averageHoldingDays(snapshots: DailySnapshot[]): number | null {
  if (snapshots.length < 2) return null;
  // Her fon için run length'leri topla
  const runs: number[] = [];
  const presentNow = new Map<string, number>(); // code → start_idx
  for (let i = 0; i < snapshots.length; i++) {
    const inSet = new Set(snapshots[i].top_n_codes);
    // Yeni başlayanlar
    for (const code of inSet) {
      if (!presentNow.has(code)) presentNow.set(code, i);
    }
    // Çıkanlar
    for (const [code, startIdx] of [...presentNow]) {
      if (!inSet.has(code)) {
        runs.push(i - startIdx);
        presentNow.delete(code);
      }
    }
  }
  // Hâlâ açık olan run'lar (period sonu)
  for (const [code, startIdx] of presentNow) {
    runs.push(snapshots.length - startIdx);
    void code;
  }
  if (runs.length === 0) return null;
  return runs.reduce((a, b) => a + b, 0) / runs.length;
}

/**
 * Top 3 değişim sıklığı — 30 günlük pencerede Top 3 değişen fon sayısı.
 * Tüm pencereler için ortalama döner.
 */
export function top3ChangeRate(snapshots: DailySnapshot[]): number | null {
  if (snapshots.length < 30) return null;
  const top3Daily = snapshots.map((s) => new Set(s.top_n_codes.slice(0, 3)));
  const changes: number[] = [];
  for (let i = 30; i < top3Daily.length; i++) {
    const old = top3Daily[i - 30];
    const cur = top3Daily[i];
    let diff = 0;
    for (const c of cur) if (!old.has(c)) diff++;
    changes.push(diff);
  }
  if (changes.length === 0) return null;
  return changes.reduce((a, b) => a + b, 0) / changes.length;
}

/**
 * Top10 Koruma Oranı (30 gün): t için |top_n(t) ∩ top_n(t+30)| / N
 * Tüm geçerli pencereler için ortalama (0-1).
 */
export function top10Retention30d(snapshots: DailySnapshot[]): number | null {
  if (snapshots.length < 31) return null;
  const retentions: number[] = [];
  for (let i = 0; i + 30 < snapshots.length; i++) {
    const setA = new Set(snapshots[i].top_n_codes);
    const setB = new Set(snapshots[i + 30].top_n_codes);
    let intersection = 0;
    for (const c of setA) if (setB.has(c)) intersection++;
    const n = setA.size;
    if (n > 0) retentions.push(intersection / n);
  }
  if (retentions.length === 0) return null;
  return retentions.reduce((a, b) => a + b, 0) / retentions.length;
}

/** Tüm 5 KPI'yı tek snapshot'tan hesapla. */
export function computeForwardKPIs(snapshots: DailySnapshot[]): ForwardTestKPIs {
  if (snapshots.length < 2) {
    return {
      top10_stability: null,
      avg_holding_days: null,
      top3_change_rate: null,
      turnover: null,
      top10_retention_30d: null,
      snapshots_used: snapshots.length,
    };
  }

  // Daily turnover ortalaması
  const turnovers: number[] = [];
  for (let i = 1; i < snapshots.length; i++) {
    turnovers.push(dailyTurnover(snapshots[i - 1].top_n_codes, snapshots[i].top_n_codes));
  }
  const avgTurnover = turnovers.length > 0
    ? turnovers.reduce((a, b) => a + b, 0) / turnovers.length
    : 0;

  return {
    top10_stability: 1 - avgTurnover,
    avg_holding_days: averageHoldingDays(snapshots),
    top3_change_rate: top3ChangeRate(snapshots),
    turnover: avgTurnover,
    top10_retention_30d: top10Retention30d(snapshots),
    snapshots_used: snapshots.length,
  };
}

export const __internals = { dailyTurnover, averageHoldingDays, top3ChangeRate, top10Retention30d };

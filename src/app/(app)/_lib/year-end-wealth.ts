/* ============================================================
   Yıl sonu servet kaydı (saf karar). wealth_snapshots'taki yıllık
   satırlar "Geçmiş Yıllar" ve Reel Değer raporlarının temelidir; elle
   girildiği için yıl başında bir önceki yıl ya hiç yoktur ya da yıl
   ortası bir tahmindir ("17.05.2026 tahmini"). Günlük snapshot cron'u,
   önceki yılın Aralık ayındaki son günlük kaydını yıl sonu olarak yazar.
   Elle girilmiş yıl sonu kayıtlarına dokunulmaz.
   ============================================================ */

export const AUTO_YEAR_END_PREFIX = "Yıl sonu (otomatik";

export interface DailyWealthPoint {
  /** "YYYY-MM-DD" */
  snapshot_date: string;
  total_wealth: number;
}

export interface YearRow {
  period: string;
  total_try: number;
  notes: string | null;
}

export interface YearEndPlan {
  period: string;
  total_try: number;
  notes: string;
}

/** Üzerine yazılabilir: kayıt yok, tahmin ya da daha önce otomatik yazılmış. */
export function isReplaceableYearRow(notes: string | null | undefined): boolean {
  const n = (notes ?? "").trim();
  if (!n) return true;
  if (n.startsWith(AUTO_YEAR_END_PREFIX)) return true;
  return n.toLocaleLowerCase("tr-TR").includes("tahmin");
}

/**
 * Bugüne göre önceki yılın yıl sonu kaydı yazılmalı mı?
 * @param lastDaily önceki yılın 31 Aralık'ına ≤ en son günlük snapshot
 * @param existing  wealth_snapshots'taki o yılın satırı (yoksa null)
 */
export function planYearEndSnapshot(
  today: string,
  lastDaily: DailyWealthPoint | null,
  existing: YearRow | null,
): YearEndPlan | null {
  const year = Number(today.slice(0, 4)) - 1;
  if (!lastDaily) return null;
  // Yalnız Aralık içindeki bir kayıt yıl sonunu temsil eder
  if (lastDaily.snapshot_date < `${year}-12-01` || lastDaily.snapshot_date > `${year}-12-31`) return null;
  if (!(lastDaily.total_wealth > 0)) return null;
  if (existing && !isReplaceableYearRow(existing.notes)) return null;

  const total = Math.round(Number(lastDaily.total_wealth) * 100) / 100;
  const notes = `${AUTO_YEAR_END_PREFIX} · ${lastDaily.snapshot_date} günlük kaydı)`;
  if (existing && Number(existing.total_try) === total && existing.notes === notes) return null;
  return { period: String(year), total_try: total, notes };
}

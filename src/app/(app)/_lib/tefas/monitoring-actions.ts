"use server";

import { isSupabaseConfigured } from "@/app/(app)/ayarlar/actions";
import { createClient } from "@/lib/supabase/server";
import type {
  FundReturnsHealth,
  FundReturnsIngestLog,
  FundScoresHealth,
  FundScoresIngestLog,
  TefasFundHealth,
  TefasIngestLog,
} from "./types";

/**
 * En son cron çalıştırmalarını döner (yeniden eskiye).
 * UI "son ingest" kartı için ilk N satır yeterli; default 10.
 */
export async function listIngestLog(limit: number = 10): Promise<TefasIngestLog[]> {
  if (!(await isSupabaseConfigured())) return [];
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("tefas_ingest_log")
    .select("*")
    .order("ran_at", { ascending: false })
    .limit(limit);
  if (error) {
    console.error("listIngestLog error", error);
    return [];
  }
  return (data ?? []) as TefasIngestLog[];
}

/**
 * Her aktif fon için son fiyat durumu (stale gün sayısı dahil).
 * UI'da fonun "kaç gündür güncel değil" rozetini göstermek için.
 */
export async function listFundsHealth(): Promise<TefasFundHealth[]> {
  if (!(await isSupabaseConfigured())) return [];
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("v_tefas_fund_prices_health")
    .select("*")
    .order("days_stale", { ascending: false, nullsFirst: true });
  if (error) {
    console.error("listFundsHealth error", error);
    return [];
  }
  return (data ?? []) as TefasFundHealth[];
}

/**
 * `daysThreshold` gün veya daha fazla geride kalmış (veya hiç fiyatı olmayan)
 * fonlar. UI'da stale fonlar bölümü için.
 */
export async function listStaleFunds(daysThreshold: number = 3): Promise<TefasFundHealth[]> {
  const all = await listFundsHealth();
  return all.filter((f) => f.last_as_of === null || (f.days_stale ?? 0) >= daysThreshold);
}

/**
 * En son cron çalıştırmasında failed olan fon kodları + ingest meta.
 * UI'da "Bugün ingest edilmeyenler" listesi için.
 */
export async function getLastIngestSummary(): Promise<{
  log: TefasIngestLog | null;
  failed_codes: string[];
}> {
  const logs = await listIngestLog(1);
  const log = logs[0] ?? null;
  return { log, failed_codes: log?.failed_codes ?? [] };
}

// ---------- Sprint-3 PR-4: fund_returns refresh monitoring -----------

/**
 * Returns refresh çalıştırmalarını döner (yeniden eskiye). UI özet kartı +
 * geçmiş için kullanılır.
 */
export async function listReturnsIngestLog(
  limit: number = 10,
): Promise<FundReturnsIngestLog[]> {
  if (!(await isSupabaseConfigured())) return [];
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("fund_returns_ingest_log")
    .select("*")
    .order("ran_at", { ascending: false })
    .limit(limit);
  if (error) {
    console.error("listReturnsIngestLog error", error);
    return [];
  }
  return (data ?? []) as FundReturnsIngestLog[];
}

/**
 * Her aktif fon için son cache durumu (kaç gün stale, hangi pencereler dolu).
 */
export async function listReturnsHealth(): Promise<FundReturnsHealth[]> {
  if (!(await isSupabaseConfigured())) return [];
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("v_fund_returns_health")
    .select("*")
    .order("days_stale", { ascending: false, nullsFirst: true });
  if (error) {
    console.error("listReturnsHealth error", error);
    return [];
  }
  return (data ?? []) as FundReturnsHealth[];
}

/**
 * `daysThreshold` günden geride kalmış (veya hiç cache satırı olmayan)
 * fonlar — UI "stale returns" listesi için.
 */
export async function listStaleReturns(
  daysThreshold: number = 3,
): Promise<FundReturnsHealth[]> {
  const all = await listReturnsHealth();
  return all.filter(
    (f) => f.last_as_of === null || (f.days_stale ?? 0) >= daysThreshold,
  );
}

/**
 * Son returns refresh çalıştırmasının özeti + atlanan fon kodları.
 */
export async function getLastReturnsRefreshSummary(): Promise<{
  log: FundReturnsIngestLog | null;
  skipped_codes: string[];
}> {
  const logs = await listReturnsIngestLog(1);
  const log = logs[0] ?? null;
  return { log, skipped_codes: log?.skipped_codes ?? [] };
}

// ---------- Sprint-4 PR-4: fund_scores refresh monitoring -----------

/**
 * Skor refresh çalıştırmalarını döner (yeniden eskiye).
 */
export async function listScoresIngestLog(
  limit: number = 10,
): Promise<FundScoresIngestLog[]> {
  if (!(await isSupabaseConfigured())) return [];
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("fund_scores_ingest_log")
    .select("*")
    .order("ran_at", { ascending: false })
    .limit(limit);
  if (error) {
    console.error("listScoresIngestLog error", error);
    return [];
  }
  return (data ?? []) as FundScoresIngestLog[];
}

/**
 * Her aktif fon × persona için skor sağlık durumu.
 */
export async function listScoresHealth(
  personaId?: string,
): Promise<FundScoresHealth[]> {
  if (!(await isSupabaseConfigured())) return [];
  const supabase = await createClient();
  let q = supabase
    .from("v_fund_scores_health")
    .select("*")
    .order("days_stale", { ascending: false, nullsFirst: true });
  if (personaId) q = q.eq("persona_id", personaId);
  const { data, error } = await q;
  if (error) {
    console.error("listScoresHealth error", error);
    return [];
  }
  return (data ?? []) as FundScoresHealth[];
}

/**
 * `daysThreshold` günden eski (veya hiç skor üretilmemiş) fon×persona kayıtları.
 */
export async function listStaleScores(
  daysThreshold: number = 3,
  personaId?: string,
): Promise<FundScoresHealth[]> {
  const all = await listScoresHealth(personaId);
  return all.filter(
    (h) => h.last_as_of === null || (h.days_stale ?? 0) >= daysThreshold,
  );
}

/**
 * Son skor refresh özeti + atlanan fon kodları.
 */
export async function getLastScoresRefreshSummary(): Promise<{
  log: FundScoresIngestLog | null;
  skipped_codes: string[];
}> {
  const logs = await listScoresIngestLog(1);
  const log = logs[0] ?? null;
  return { log, skipped_codes: log?.skipped_codes ?? [] };
}

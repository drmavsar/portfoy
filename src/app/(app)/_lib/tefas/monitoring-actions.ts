"use server";

import { isSupabaseConfigured } from "@/app/(app)/ayarlar/actions";
import { createClient } from "@/lib/supabase/server";
import type { TefasFundHealth, TefasIngestLog } from "./types";

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

"use server";

import { isSupabaseConfigured } from "@/app/(app)/ayarlar/actions";
import { createClient } from "@/lib/supabase/server";

export interface DailySnapshotRow {
  snapshot_date: string;
  total_wealth: number;
  cash_try: number;
  fx_try: number;
  metal_try: number;
  equity_mv: number;
  crypto_try: number;
  equity_by_person: Record<string, number>;
}

export async function listDailySnapshots(days: number = 180): Promise<DailySnapshotRow[]> {
  if (!(await isSupabaseConfigured())) return [];
  const supabase = await createClient();
  const since = new Date();
  since.setDate(since.getDate() - days);
  const { data, error } = await supabase
    .from("daily_snapshots")
    .select("snapshot_date, total_wealth, cash_try, fx_try, metal_try, equity_mv, crypto_try, equity_by_person")
    .gte("snapshot_date", since.toISOString().slice(0, 10))
    .order("snapshot_date", { ascending: true });
  if (error) {
    console.error("listDailySnapshots error", error);
    return [];
  }
  return (data ?? []) as unknown as DailySnapshotRow[];
}

export async function captureDailySnapshot(input: {
  total_wealth: number;
  cash_try: number;
  fx_try: number;
  metal_try: number;
  equity_mv: number;
  crypto_try: number;
  equity_by_person: Record<string, number>;
}): Promise<{ ok: boolean; created?: boolean; error?: string }> {
  if (!(await isSupabaseConfigured())) {
    return { ok: false, error: "Supabase yapılandırılmamış." };
  }
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return { ok: false, error: "Giriş yapmadın." };

  const today = new Date().toISOString().slice(0, 10);

  // Bugün için zaten var mı?
  const { data: existing } = await supabase
    .from("daily_snapshots")
    .select("id")
    .eq("user_id", user.id)
    .eq("snapshot_date", today)
    .maybeSingle();

  if (existing) return { ok: true, created: false };

  const { error } = await supabase.from("daily_snapshots").insert({
    user_id: user.id,
    snapshot_date: today,
    total_wealth: input.total_wealth,
    cash_try: input.cash_try,
    fx_try: input.fx_try,
    metal_try: input.metal_try,
    equity_mv: input.equity_mv,
    crypto_try: input.crypto_try,
    equity_by_person: input.equity_by_person,
  } as never);

  if (error) return { ok: false, error: error.message };
  return { ok: true, created: true };
}

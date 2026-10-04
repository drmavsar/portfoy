"use server";

import { isSupabaseConfigured } from "@/app/(app)/ayarlar/actions";
import { createClient } from "@/lib/supabase/server";
import { istanbulHour, istanbulToday } from "@/lib/finance/istanbul-date";

// Page-load fallback için TR saati eşiği. Cron 23:00 TR'de kanonik snapshot
// yazar; bu saatten önce sayfa açılışında DB'ye yazmıyoruz ki intra-day değer
// gün-sonu değerini ezmesin. Cron arızalanırsa bu saatten sonra sayfa açıldığında
// fallback olarak yazılır.
const SNAPSHOT_FALLBACK_HOUR_TR = 23;

export interface DailySnapshotRow {
  snapshot_date: string;
  total_wealth: number;
  cash_try: number;
  fx_try: number;
  metal_try: number;
  equity_mv: number;
  crypto_try: number;
  equity_by_person: Record<string, number>;
  /** Snapshot anındaki kurlar (0049'dan önce yazılanlar benchmark'tan dolduruldu) */
  usdtry?: number | null;
  eurtry?: number | null;
  xau_gram_try?: number | null;
}

const SNAPSHOT_COLUMNS =
  "snapshot_date, total_wealth, cash_try, fx_try, metal_try, equity_mv, crypto_try, equity_by_person, usdtry, eurtry, xau_gram_try";

export async function listDailySnapshots(days: number = 180): Promise<DailySnapshotRow[]> {
  if (!(await isSupabaseConfigured())) return [];
  const supabase = await createClient();
  const since = new Date();
  since.setDate(since.getDate() - days);
  const { data, error } = await supabase
    .from("daily_snapshots")
    .select(SNAPSHOT_COLUMNS)
    .gte("snapshot_date", since.toISOString().slice(0, 10))
    .order("snapshot_date", { ascending: true });
  if (error) {
    console.error("listDailySnapshots error", error);
    return [];
  }
  return (data ?? []) as unknown as DailySnapshotRow[];
}

/** Tarihe ≤ son snapshot (yıl başı karşılaştırması: listDailySnapshots penceresi dışında kalabilir). */
export async function getDailySnapshotOnOrBefore(date: string): Promise<DailySnapshotRow | null> {
  if (!(await isSupabaseConfigured())) return null;
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("daily_snapshots")
    .select(SNAPSHOT_COLUMNS)
    .lte("snapshot_date", date)
    .order("snapshot_date", { ascending: false })
    .limit(1)
    .maybeSingle();
  if (error) {
    console.error("getDailySnapshotOnOrBefore error", error);
    return null;
  }
  return (data ?? null) as unknown as DailySnapshotRow | null;
}

export async function captureDailySnapshot(input: {
  total_wealth: number;
  cash_try: number;
  fx_try: number;
  metal_try: number;
  equity_mv: number;
  crypto_try: number;
  equity_by_person: Record<string, number>;
  usdtry?: number | null;
  eurtry?: number | null;
  xau_gram_try?: number | null;
}): Promise<{ ok: boolean; created?: boolean; skipped?: boolean; error?: string }> {
  if (!(await isSupabaseConfigured())) {
    return { ok: false, error: "Supabase yapılandırılmamış." };
  }
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return { ok: false, error: "Giriş yapmadın." };

  const today = istanbulToday();

  // Bugün için zaten var mı?
  const { data: existing } = await supabase
    .from("daily_snapshots")
    .select("id")
    .eq("user_id", user.id)
    .eq("snapshot_date", today)
    .maybeSingle();

  if (existing) return { ok: true, created: false };

  // Cron 23:00 TR'de kanonik snapshot'ı yazar. Bu saatten önce sayfa açılışı
  // intra-day değerlerle satır oluşturmasın — yoksa cron'un gün-sonu değeri
  // ezilmiş olur ve "dünden beri değişim" intra-day kaymadan etkilenir.
  if (istanbulHour() < SNAPSHOT_FALLBACK_HOUR_TR) {
    return { ok: true, skipped: true };
  }

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
    usdtry: input.usdtry ?? null,
    eurtry: input.eurtry ?? null,
    xau_gram_try: input.xau_gram_try ?? null,
  } as never);

  if (error) return { ok: false, error: error.message };
  return { ok: true, created: true };
}

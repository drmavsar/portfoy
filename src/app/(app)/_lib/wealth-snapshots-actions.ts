"use server";

import { isSupabaseConfigured } from "@/app/(app)/ayarlar/actions";
import { createClient } from "@/lib/supabase/server";

export interface WealthSnapshotRow {
  id: string;
  period: string;
  total_try: number;
  notes: string | null;
  created_at: string;
}

export async function listWealthSnapshots(): Promise<WealthSnapshotRow[]> {
  if (!(await isSupabaseConfigured())) return [];
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("wealth_snapshots")
    .select("id, period, total_try, notes, created_at")
    .order("period", { ascending: true });
  if (error) {
    console.error("listWealthSnapshots error", error);
    return [];
  }
  return (data ?? []) as unknown as WealthSnapshotRow[];
}

export interface RealValueRow {
  period: string;
  total_try: number;
  usd_try: number | null;
  eur_try: number | null;
  gram_gold: number | null;
  cpi_index: number | null;
}

/**
 * Reel Değer serisi: yıllık net servet snapshot'ları + o yıla ait yıl-sonu
 * USD/EUR/gram-altın kuru ve TÜFE endeksi. Nominal TL büyümesinin ne kadarının
 * gerçek olduğunu (enflasyon/altın/döviz karşısında) görmek için kullanılır.
 */
export async function listRealValueSeries(): Promise<RealValueRow[]> {
  if (!(await isSupabaseConfigured())) return [];
  const supabase = await createClient();
  const { data, error } = await supabase.rpc("real_value_series");
  if (error) {
    console.error("listRealValueSeries error", error);
    return [];
  }
  type Row = {
    period: string;
    total_try: number | string;
    usd_try: number | string | null;
    eur_try: number | string | null;
    gram_gold: number | string | null;
    cpi_index: number | string | null;
  };
  const num = (v: number | string | null): number | null =>
    v == null ? null : Number(v);
  return ((data ?? []) as Row[]).map((r) => ({
    period: r.period,
    total_try: Number(r.total_try),
    usd_try: num(r.usd_try),
    eur_try: num(r.eur_try),
    gram_gold: num(r.gram_gold),
    cpi_index: num(r.cpi_index),
  }));
}

export interface BenchmarkPoint {
  code: string;
  name: string;
  as_of: string;
  value: number;
}

export async function listBenchmarkPoints(): Promise<BenchmarkPoint[]> {
  if (!(await isSupabaseConfigured())) return [];
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("benchmark_points")
    .select("as_of, value, benchmark_series!inner(code, name)")
    .order("as_of", { ascending: true });
  if (error) {
    console.error("listBenchmarkPoints error", error);
    return [];
  }
  type Row = { as_of: string; value: number; benchmark_series: { code: string; name: string } | Array<{ code: string; name: string }> };
  return ((data ?? []) as unknown as Row[]).map((r) => {
    const s = Array.isArray(r.benchmark_series) ? r.benchmark_series[0] : r.benchmark_series;
    return { code: s?.code ?? "?", name: s?.name ?? "?", as_of: r.as_of, value: Number(r.value) };
  });
}

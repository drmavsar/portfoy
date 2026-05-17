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

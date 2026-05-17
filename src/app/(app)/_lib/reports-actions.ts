"use server";

import { isSupabaseConfigured } from "@/app/(app)/ayarlar/actions";
import { createClient } from "@/lib/supabase/server";

export interface RawTxn {
  occurred_on: string;
  direction: "inflow" | "outflow" | "transfer";
  amount: number;
  currency: string;
  category_id: string | null;
  beneficiary_id: string | null;
}

/** Raporlar için ham transactions (son N ay, committed, transfer hariç). */
export async function listTransactionsForReports(sinceMonths: number = 24): Promise<RawTxn[]> {
  if (!(await isSupabaseConfigured())) return [];
  const supabase = await createClient();
  const since = new Date();
  since.setMonth(since.getMonth() - sinceMonths);
  since.setDate(1);
  const sinceIso = since.toISOString().slice(0, 10);

  const { data, error } = await supabase
    .from("transactions")
    .select("occurred_on, direction, amount, currency, category_id, beneficiary_id")
    .eq("status", "committed")
    .eq("is_transfer", false)
    .gte("occurred_on", sinceIso)
    .order("occurred_on", { ascending: true });

  if (error) {
    console.error("listTransactionsForReports error", error);
    return [];
  }
  return (data ?? []) as unknown as RawTxn[];
}

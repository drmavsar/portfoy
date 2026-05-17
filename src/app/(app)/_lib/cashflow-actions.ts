"use server";

import { revalidatePath } from "next/cache";

import { isSupabaseConfigured } from "@/app/(app)/ayarlar/actions";
import { createClient } from "@/lib/supabase/server";

export type TxnDirection = "inflow" | "outflow" | "transfer";

export interface TransactionRow {
  id: string;
  account_id: string;
  occurred_on: string;
  direction: TxnDirection;
  amount: number;
  currency: string;
  description: string | null;
  category_id: string | null;
  beneficiary_id: string | null;
  is_transfer: boolean;
  notes: string | null;
}

export async function listTransactions(
  direction: TxnDirection,
): Promise<TransactionRow[]> {
  if (!(await isSupabaseConfigured())) return [];
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("transactions")
    .select(
      "id, account_id, occurred_on, direction, amount, currency, description, category_id, beneficiary_id, is_transfer, notes",
    )
    .eq("direction", direction)
    .eq("status", "committed")
    .order("occurred_on", { ascending: false })
    .limit(500);
  if (error) {
    console.error("listTransactions error", error);
    return [];
  }
  return (data ?? []) as unknown as TransactionRow[];
}

export async function createTransaction(input: {
  account_id: string;
  occurred_on: string;
  direction: TxnDirection;
  amount: number;
  description: string;
  category_id: string | null;
  beneficiary_id: string | null;
  notes: string | null;
}): Promise<{ ok: true; row: TransactionRow } | { ok: false; error: string }> {
  if (!(await isSupabaseConfigured())) {
    return { ok: false, error: "Supabase yapılandırılmamış." };
  }
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return { ok: false, error: "Giriş yapmadın." };

  if (!input.account_id) return { ok: false, error: "Hesap seç." };
  if (!(input.amount > 0)) return { ok: false, error: "Tutar pozitif olmalı." };

  const { data, error } = await supabase
    .from("transactions")
    .insert({
      user_id: user.id,
      account_id: input.account_id,
      occurred_on: input.occurred_on,
      direction: input.direction,
      amount: input.amount,
      currency: "TRY",
      description: input.description.trim() || null,
      category_id: input.category_id,
      beneficiary_id: input.beneficiary_id,
      notes: input.notes?.trim() || null,
      is_transfer: false,
      status: "committed",
    } as never)
    .select(
      "id, account_id, occurred_on, direction, amount, currency, description, category_id, beneficiary_id, is_transfer, notes",
    )
    .single();

  if (error) return { ok: false, error: error.message };

  revalidatePath(input.direction === "inflow" ? "/gelirler" : "/giderler");
  revalidatePath("/ozet");
  return { ok: true, row: data as unknown as TransactionRow };
}

export async function updateTransaction(input: {
  id: string;
  direction: TxnDirection;
  account_id: string;
  occurred_on: string;
  amount: number;
  description: string;
  category_id: string | null;
  beneficiary_id: string | null;
  notes: string | null;
}): Promise<{ ok: true; row: TransactionRow } | { ok: false; error: string }> {
  if (!(await isSupabaseConfigured())) {
    return { ok: false, error: "Supabase yapılandırılmamış." };
  }
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return { ok: false, error: "Giriş yapmadın." };

  if (!input.account_id) return { ok: false, error: "Hesap seç." };
  if (!(input.amount > 0)) return { ok: false, error: "Tutar pozitif olmalı." };

  const { data, error } = await supabase
    .from("transactions")
    .update({
      account_id: input.account_id,
      occurred_on: input.occurred_on,
      amount: input.amount,
      description: input.description.trim() || null,
      category_id: input.category_id,
      beneficiary_id: input.beneficiary_id,
      notes: input.notes?.trim() || null,
    } as never)
    .eq("id", input.id)
    .select(
      "id, account_id, occurred_on, direction, amount, currency, description, category_id, beneficiary_id, is_transfer, notes",
    )
    .single();

  if (error) return { ok: false, error: error.message };

  revalidatePath(input.direction === "inflow" ? "/gelirler" : "/giderler");
  revalidatePath("/ozet");
  return { ok: true, row: data as unknown as TransactionRow };
}

export async function deleteTransaction(
  id: string,
  direction: TxnDirection,
): Promise<{ ok: boolean; error?: string }> {
  if (!(await isSupabaseConfigured())) {
    return { ok: false, error: "Supabase yapılandırılmamış." };
  }
  const supabase = await createClient();
  const { error } = await supabase.from("transactions").delete().eq("id", id);
  if (error) return { ok: false, error: error.message };
  revalidatePath(direction === "inflow" ? "/gelirler" : "/giderler");
  revalidatePath("/ozet");
  return { ok: true };
}

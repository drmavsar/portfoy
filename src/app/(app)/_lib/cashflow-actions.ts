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

const TRANSACTIONS_QUERY_LIMIT = 5000;

export async function listTransactions(
  direction: TxnDirection,
): Promise<TransactionRow[]> {
  if (!(await isSupabaseConfigured())) return [];
  const supabase = await createClient();
  const SELECT_COLS =
    "id, account_id, occurred_on, direction, amount, currency, description, category_id, beneficiary_id, is_transfer, notes";

  // İdeal sorgu: soft-deleted'leri ele
  const first = await supabase
    .from("transactions")
    .select(SELECT_COLS)
    .eq("direction", direction)
    .eq("status", "committed")
    .is("deleted_at", null)
    .order("occurred_on", { ascending: false })
    .limit(TRANSACTIONS_QUERY_LIMIT);

  // 0018 migration henüz çalışmadıysa "deleted_at" kolonu yok → filter
  // hata verir. Bu durumda filter'sız bir kez daha dene (defensive fallback).
  if (first.error) {
    const msg = String(first.error.message ?? "").toLowerCase();
    if (msg.includes("deleted_at") || first.error.code === "42703") {
      console.warn(
        "listTransactions: deleted_at kolonu yok — 0018 migration çalıştırılmamış. Filter düşürüldü.",
      );
      const fallback = await supabase
        .from("transactions")
        .select(SELECT_COLS)
        .eq("direction", direction)
        .eq("status", "committed")
        .order("occurred_on", { ascending: false })
        .limit(TRANSACTIONS_QUERY_LIMIT);
      if (fallback.error) {
        console.error("listTransactions fallback error", fallback.error);
        return [];
      }
      const data = (fallback.data ?? []) as unknown as TransactionRow[];
      if (data.length >= TRANSACTIONS_QUERY_LIMIT) {
        console.warn(
          `listTransactions: ${TRANSACTIONS_QUERY_LIMIT} satır limitine ulaşıldı, eski kayıtlar görünmüyor olabilir.`,
        );
      }
      return data;
    }
    console.error("listTransactions error", first.error);
    return [];
  }
  const data = (first.data ?? []) as unknown as TransactionRow[];
  if (data.length >= TRANSACTIONS_QUERY_LIMIT) {
    console.warn(
      `listTransactions: ${TRANSACTIONS_QUERY_LIMIT} satır limitine ulaşıldı, eski kayıtlar görünmüyor olabilir.`,
    );
  }
  return data;
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
  // Soft delete — deleted_at = now() set. /ayarlar arşivinden geri alınabilir,
  // ya da hemen ardından undoDeleteTransaction çağrılabilir (30 sn toast).
  const soft = await supabase
    .from("transactions")
    .update({ deleted_at: new Date().toISOString() } as never)
    .eq("id", id);
  if (soft.error) {
    const msg = String(soft.error.message ?? "").toLowerCase();
    if (msg.includes("deleted_at") || soft.error.code === "42703") {
      // 0018 yok — hard delete'e geri dön
      console.warn("deleteTransaction: 0018 migration yok, hard delete'e düşüyor");
      const hard = await supabase.from("transactions").delete().eq("id", id);
      if (hard.error) return { ok: false, error: hard.error.message };
      revalidatePath(direction === "inflow" ? "/gelirler" : "/giderler");
      revalidatePath("/ozet");
      return { ok: true };
    }
    return { ok: false, error: soft.error.message };
  }
  revalidatePath(direction === "inflow" ? "/gelirler" : "/giderler");
  revalidatePath("/ozet");
  return { ok: true };
}

/** 30 sn'lik undo penceresi için: deleted_at'i null'a çevirir. */
export async function undoDeleteTransaction(
  id: string,
  direction: TxnDirection,
): Promise<{ ok: boolean; error?: string }> {
  if (!(await isSupabaseConfigured())) {
    return { ok: false, error: "Supabase yapılandırılmamış." };
  }
  const supabase = await createClient();
  const { error } = await supabase
    .from("transactions")
    .update({ deleted_at: null } as never)
    .eq("id", id);
  if (error) return { ok: false, error: error.message };
  revalidatePath(direction === "inflow" ? "/gelirler" : "/giderler");
  revalidatePath("/ozet");
  return { ok: true };
}

/** /ayarlar Aktivite Geçmişi: son N silinmiş kayıt */
export async function listDeletedTransactions(
  limit = 50,
): Promise<TransactionRow[]> {
  if (!(await isSupabaseConfigured())) return [];
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("transactions")
    .select(
      "id, account_id, occurred_on, direction, amount, currency, description, category_id, beneficiary_id, is_transfer, notes",
    )
    .not("deleted_at", "is", null)
    .order("deleted_at", { ascending: false })
    .limit(limit);
  if (error) {
    console.error("listDeletedTransactions error", error);
    return [];
  }
  return (data ?? []) as unknown as TransactionRow[];
}

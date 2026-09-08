"use server";

import { revalidatePath } from "next/cache";

import { isSupabaseConfigured } from "@/app/(app)/ayarlar/actions";
import { createClient } from "@/lib/supabase/server";

export interface CustodyRow {
  id: string;
  name: string;
  slug: string;
  kind: string;
  color: string | null;
  short: string | null;
}

export interface AccountRow {
  id: string;
  custody_id: string | null;
  beneficiary_id: string | null;
  name: string;
  account_type: string;
  currency: string;
  iban: string | null;
  balance_try: number | null;
  balance_native: number | null;
  opening_balance: number;
}

export interface BeneficiaryLite {
  id: string;
  name: string;
  slug: string;
  color: string | null;
}

export async function listCustodyLocations(): Promise<CustodyRow[]> {
  if (!(await isSupabaseConfigured())) return [];
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("custody_locations")
    .select("id, name, slug, kind, color, short")
    .is("archived_at", null)
    .order("name");
  if (error) {
    console.error("listCustodyLocations error", error);
    return [];
  }
  return (data ?? []) as unknown as CustodyRow[];
}

export async function listAccounts(): Promise<AccountRow[]> {
  if (!(await isSupabaseConfigured())) return [];
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("accounts")
    .select(
      "id, custody_id, beneficiary_id, name, account_type, currency, iban, balance_try, balance_native, opening_balance",
    )
    .is("archived_at", null)
    .order("created_at", { ascending: true });
  if (error) {
    console.error("listAccounts error", error);
    return [];
  }
  return (data ?? []) as unknown as AccountRow[];
}

export async function listBeneficiariesLite(): Promise<BeneficiaryLite[]> {
  if (!(await isSupabaseConfigured())) return [];
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("beneficiaries")
    .select("id, name, slug, color")
    .is("archived_at", null)
    .order("created_at");
  if (error) return [];
  return (data ?? []) as unknown as BeneficiaryLite[];
}

export async function createAccount(input: {
  custody_id: string;
  beneficiary_id: string | null;
  name: string;
  account_type: string;
  currency: string;
  iban: string;
  balance_try: number;
  balance_native: number | null;
}): Promise<{ ok: true; row: AccountRow } | { ok: false; error: string }> {
  if (!(await isSupabaseConfigured())) {
    return { ok: false, error: "Supabase yapılandırılmamış." };
  }
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return { ok: false, error: "Giriş yapmadın." };

  const name = input.name.trim();
  if (!name) return { ok: false, error: "Hesap adı boş olamaz." };

  const insertRow = {
    user_id: user.id,
    custody_id: input.custody_id,
    beneficiary_id: input.beneficiary_id,
    name,
    account_type: input.account_type,
    currency: input.currency,
    iban: input.iban || null,
    opening_balance: input.balance_try,
    balance_try: input.balance_try,
    balance_native: input.balance_native,
  };

  const { data, error } = await supabase
    .from("accounts")
    .insert(insertRow as never)
    .select(
      "id, custody_id, beneficiary_id, name, account_type, currency, iban, balance_try, balance_native, opening_balance",
    )
    .single();

  if (error) return { ok: false, error: error.message };
  revalidatePath("/hesaplar");
  return { ok: true, row: data as unknown as AccountRow };
}

export async function updateAccount(input: {
  id: string;
  custody_id: string;
  beneficiary_id: string | null;
  name: string;
  account_type: string;
  currency: string;
  iban: string;
  balance_try: number;
  balance_native: number | null;
}): Promise<{ ok: true; row: AccountRow } | { ok: false; error: string }> {
  if (!(await isSupabaseConfigured())) {
    return { ok: false, error: "Supabase yapılandırılmamış." };
  }
  const supabase = await createClient();
  const name = input.name.trim();
  if (!name) return { ok: false, error: "Hesap adı boş olamaz." };

  const { data, error } = await supabase
    .from("accounts")
    .update({
      custody_id: input.custody_id,
      beneficiary_id: input.beneficiary_id,
      name,
      account_type: input.account_type,
      currency: input.currency,
      iban: input.iban || null,
      balance_try: input.balance_try,
      balance_native: input.balance_native,
    } as never)
    .eq("id", input.id)
    .select(
      "id, custody_id, beneficiary_id, name, account_type, currency, iban, balance_try, balance_native, opening_balance",
    )
    .single();

  if (error) return { ok: false, error: error.message };
  revalidatePath("/hesaplar");
  revalidatePath("/ozet");
  return { ok: true, row: data as unknown as AccountRow };
}

export async function deleteAccount(id: string): Promise<{ ok: boolean; error?: string }> {
  if (!(await isSupabaseConfigured())) {
    return { ok: false, error: "Supabase yapılandırılmamış." };
  }
  const supabase = await createClient();
  const { error } = await supabase
    .from("accounts")
    .update({ archived_at: new Date().toISOString() } as never)
    .eq("id", id);
  if (error) return { ok: false, error: error.message };
  revalidatePath("/hesaplar");
  return { ok: true };
}

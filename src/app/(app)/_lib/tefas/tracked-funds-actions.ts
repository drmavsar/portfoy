"use server";

import { isSupabaseConfigured } from "@/app/(app)/ayarlar/actions";
import { createClient } from "@/lib/supabase/server";
import type { TrackedFund } from "./types";

type Result<T = void> = { ok: true; data?: T } | { ok: false; error: string };

export async function listTrackedFunds(): Promise<TrackedFund[]> {
  if (!(await isSupabaseConfigured())) return [];
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("tracked_funds")
    .select("*")
    .order("added_at", { ascending: true });
  if (error) {
    console.error("listTrackedFunds error", error);
    return [];
  }
  return (data ?? []) as TrackedFund[];
}

export async function addTrackedFund(
  fundCode: string,
  notes?: string,
): Promise<Result<TrackedFund>> {
  if (!(await isSupabaseConfigured())) {
    return { ok: false, error: "Supabase yapılandırılmamış." };
  }
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return { ok: false, error: "Giriş yapmadın." };

  const { data, error } = await supabase
    .from("tracked_funds")
    .insert({ user_id: user.id, fund_code: fundCode, notes: notes ?? null } as never)
    .select("*")
    .single();
  if (error) return { ok: false, error: error.message };
  return { ok: true, data: data as TrackedFund };
}

export async function removeTrackedFund(fundCode: string): Promise<Result> {
  if (!(await isSupabaseConfigured())) {
    return { ok: false, error: "Supabase yapılandırılmamış." };
  }
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return { ok: false, error: "Giriş yapmadın." };

  const { error } = await supabase
    .from("tracked_funds")
    .delete()
    .eq("user_id", user.id)
    .eq("fund_code", fundCode);
  if (error) return { ok: false, error: error.message };
  return { ok: true };
}

export async function setTrackedActive(
  fundCode: string,
  isActive: boolean,
): Promise<Result> {
  if (!(await isSupabaseConfigured())) {
    return { ok: false, error: "Supabase yapılandırılmamış." };
  }
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return { ok: false, error: "Giriş yapmadın." };

  const { error } = await supabase
    .from("tracked_funds")
    .update({ is_active: isActive } as never)
    .eq("user_id", user.id)
    .eq("fund_code", fundCode);
  if (error) return { ok: false, error: error.message };
  return { ok: true };
}

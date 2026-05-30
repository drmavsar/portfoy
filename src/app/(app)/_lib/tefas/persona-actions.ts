"use server";

import { isSupabaseConfigured } from "@/app/(app)/ayarlar/actions";
import { createClient } from "@/lib/supabase/server";
import type { UserPersona } from "./types";

/**
 * Tüm görünür persona'ları döner: sistem default'u (user_id IS NULL) +
 * mevcut kullanıcının kendi persona'ları. RLS uygular.
 */
export async function listPersonas(): Promise<UserPersona[]> {
  if (!(await isSupabaseConfigured())) return [];
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("user_personas")
    .select("*")
    .order("is_default", { ascending: false })
    .order("created_at", { ascending: true });
  if (error) {
    console.error("listPersonas error", error);
    return [];
  }
  return (data ?? []) as UserPersona[];
}

/**
 * Default persona — kullanıcının kendi default'u varsa onu, yoksa sistem
 * default'unu (user_id IS NULL) döner.
 */
export async function getDefaultPersona(): Promise<UserPersona | null> {
  if (!(await isSupabaseConfigured())) return null;
  const supabase = await createClient();

  // Önce kullanıcının kendi default'u
  const { data: { user } } = await supabase.auth.getUser();
  if (user) {
    const { data: own } = await supabase
      .from("user_personas")
      .select("*")
      .eq("user_id", user.id)
      .eq("is_default", true)
      .maybeSingle();
    if (own) return own as UserPersona;
  }

  // Fallback: sistem default
  const { data: system } = await supabase
    .from("user_personas")
    .select("*")
    .is("user_id", null)
    .eq("is_default", true)
    .maybeSingle();
  return (system ?? null) as UserPersona | null;
}

/**
 * id ile persona getir (RLS user_id null veya kendi user_id'sini kabul eder).
 */
export async function getPersona(id: string): Promise<UserPersona | null> {
  if (!(await isSupabaseConfigured())) return null;
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("user_personas")
    .select("*")
    .eq("id", id)
    .maybeSingle();
  if (error) {
    console.error("getPersona error", error);
    return null;
  }
  return (data ?? null) as UserPersona | null;
}

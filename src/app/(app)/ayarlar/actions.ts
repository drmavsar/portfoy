"use server";

import { revalidatePath } from "next/cache";

import { createClient } from "@/lib/supabase/server";

export interface BeneficiaryRow {
  id: string;
  name: string;
  slug: string;
  color: string | null;
  role: string;
  created_at: string;
}

const COLORS = ["#6ea8fe", "#4cc9b0", "#d4a056", "#b388f2", "#e26a8f", "#a4cc4c"];

function slugify(name: string): string {
  return name
    .toLowerCase()
    .replace(/[ıİ]/g, "i")
    .replace(/[şŞ]/g, "s")
    .replace(/[çÇ]/g, "c")
    .replace(/[öÖ]/g, "o")
    .replace(/[üÜ]/g, "u")
    .replace(/[ğĞ]/g, "g")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 60);
}

/** Configured? */
export async function isSupabaseConfigured(): Promise<boolean> {
  return Boolean(
    process.env.NEXT_PUBLIC_SUPABASE_URL && process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY,
  );
}

export async function listBeneficiaries(): Promise<BeneficiaryRow[]> {
  if (!(await isSupabaseConfigured())) return [];
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("beneficiaries")
    .select("id, name, slug, color, role, created_at")
    .is("archived_at", null)
    .order("created_at", { ascending: true });
  if (error) {
    console.error("listBeneficiaries error", error);
    return [];
  }
  return ((data ?? []) as unknown) as BeneficiaryRow[];
}

export async function createBeneficiary(input: {
  name: string;
  role?: string;
  color?: string;
}): Promise<{ ok: true; row: BeneficiaryRow } | { ok: false; error: string }> {
  if (!(await isSupabaseConfigured())) {
    return { ok: false, error: "Supabase yapılandırılmamış." };
  }
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return { ok: false, error: "Giriş yapmadın." };

  const name = input.name.trim();
  if (!name) return { ok: false, error: "İsim boş olamaz." };

  const slug = slugify(name);
  const color = input.color ?? COLORS[Math.floor(Math.random() * COLORS.length)];
  const role = input.role ?? "other";

  const { data, error } = await supabase
    .from("beneficiaries")
    .insert({ user_id: user.id, name, slug, color, role } as never)
    .select("id, name, slug, color, role, created_at")
    .single();

  if (error) return { ok: false, error: error.message };
  revalidatePath("/ayarlar");
  return { ok: true, row: data as unknown as BeneficiaryRow };
}

export async function updateBeneficiaryColor(
  id: string,
  color: string,
): Promise<{ ok: boolean; error?: string }> {
  if (!(await isSupabaseConfigured())) {
    return { ok: false, error: "Supabase yapılandırılmamış." };
  }
  const supabase = await createClient();
  const { error } = await supabase
    .from("beneficiaries")
    .update({ color } as never)
    .eq("id", id);
  if (error) return { ok: false, error: error.message };
  revalidatePath("/ayarlar");
  return { ok: true };
}

export async function deleteBeneficiary(id: string): Promise<{ ok: boolean; error?: string }> {
  if (!(await isSupabaseConfigured())) {
    return { ok: false, error: "Supabase yapılandırılmamış." };
  }
  const supabase = await createClient();
  // Soft-delete via archived_at — eski ilişkili işlemleri kırmıyoruz.
  const { error } = await supabase
    .from("beneficiaries")
    .update({ archived_at: new Date().toISOString() } as never)
    .eq("id", id);
  if (error) return { ok: false, error: error.message };
  revalidatePath("/ayarlar");
  return { ok: true };
}

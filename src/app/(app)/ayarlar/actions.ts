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

// ============================================================
// Categories
// ============================================================

export interface CategoryRow {
  id: string;
  name: string;
  slug: string;
  kind: "income" | "expense" | "transfer";
  icon: string | null;
  color: string | null;
  created_at: string;
}

export async function listCategories(): Promise<CategoryRow[]> {
  if (!(await isSupabaseConfigured())) return [];
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("categories")
    .select("id, name, slug, kind, icon, color, created_at")
    .is("archived_at", null)
    .order("kind")
    .order("name");
  if (error) {
    console.error("listCategories error", error);
    return [];
  }
  return (data ?? []) as unknown as CategoryRow[];
}

export async function createCategory(input: {
  name: string;
  kind: "income" | "expense" | "transfer";
  icon?: string;
  color?: string;
}): Promise<{ ok: true; row: CategoryRow } | { ok: false; error: string }> {
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

  const { data, error } = await supabase
    .from("categories")
    .insert({
      user_id: user.id,
      name,
      slug,
      kind: input.kind,
      icon: input.icon ?? null,
      color,
    } as never)
    .select("id, name, slug, kind, icon, color, created_at")
    .single();

  if (error) return { ok: false, error: error.message };
  revalidatePath("/ayarlar");
  return { ok: true, row: data as unknown as CategoryRow };
}

export async function deleteCategory(id: string): Promise<{ ok: boolean; error?: string }> {
  if (!(await isSupabaseConfigured())) {
    return { ok: false, error: "Supabase yapılandırılmamış." };
  }
  const supabase = await createClient();
  const { error } = await supabase
    .from("categories")
    .update({ archived_at: new Date().toISOString() } as never)
    .eq("id", id);
  if (error) return { ok: false, error: error.message };
  revalidatePath("/ayarlar");
  return { ok: true };
}

// ============================================================
// Classification rules
// ============================================================

export interface ClassificationRuleRow {
  id: string;
  name: string;
  priority: number;
  is_enabled: boolean;
  match_merchant_ilike: string | null;
  match_description_ilike: string | null;
  match_min_amount: number | null;
  set_category_id: string | null;
  set_beneficiary_id: string | null;
  set_is_transfer: boolean | null;
  hit_count: number;
  last_hit_at: string | null;
}

export async function listClassificationRules(): Promise<ClassificationRuleRow[]> {
  if (!(await isSupabaseConfigured())) return [];
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("classification_rules")
    .select(
      "id, name, priority, is_enabled, match_merchant_ilike, match_description_ilike, match_min_amount, set_category_id, set_beneficiary_id, set_is_transfer, hit_count, last_hit_at",
    )
    .order("priority", { ascending: true });
  if (error) {
    console.error("listClassificationRules error", error);
    return [];
  }
  return (data ?? []) as unknown as ClassificationRuleRow[];
}

export async function createClassificationRule(input: {
  name: string;
  priority: number;
  match_description_ilike: string | null;
  match_merchant_ilike: string | null;
  match_min_amount: number | null;
  set_category_id: string | null;
  set_beneficiary_id: string | null;
  set_is_transfer: boolean | null;
}): Promise<{ ok: true; row: ClassificationRuleRow } | { ok: false; error: string }> {
  if (!(await isSupabaseConfigured())) {
    return { ok: false, error: "Supabase yapılandırılmamış." };
  }
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return { ok: false, error: "Giriş yapmadın." };

  const name = input.name.trim();
  if (!name) return { ok: false, error: "İsim boş olamaz." };

  const { data, error } = await supabase
    .from("classification_rules")
    .insert({
      user_id: user.id,
      name,
      priority: input.priority,
      match_description_ilike: input.match_description_ilike,
      match_merchant_ilike: input.match_merchant_ilike,
      match_min_amount: input.match_min_amount,
      set_category_id: input.set_category_id,
      set_beneficiary_id: input.set_beneficiary_id,
      set_is_transfer: input.set_is_transfer,
    } as never)
    .select(
      "id, name, priority, is_enabled, match_merchant_ilike, match_description_ilike, match_min_amount, set_category_id, set_beneficiary_id, set_is_transfer, hit_count, last_hit_at",
    )
    .single();

  if (error) return { ok: false, error: error.message };
  revalidatePath("/ayarlar");
  return { ok: true, row: data as unknown as ClassificationRuleRow };
}

export async function deleteClassificationRule(id: string): Promise<{ ok: boolean; error?: string }> {
  if (!(await isSupabaseConfigured())) {
    return { ok: false, error: "Supabase yapılandırılmamış." };
  }
  const supabase = await createClient();
  const { error } = await supabase
    .from("classification_rules")
    .delete()
    .eq("id", id);
  if (error) return { ok: false, error: error.message };
  revalidatePath("/ayarlar");
  return { ok: true };
}

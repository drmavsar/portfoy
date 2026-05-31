"use server";

// Komite · risk_flags CRUD (I/O). Saf gate mantığı gate.ts'te; bu katman
// yalnız okuma/yazma yapar. RLS user_id ile sahiplenir.

import { revalidatePath } from "next/cache";

import { isSupabaseConfigured } from "@/app/(app)/ayarlar/actions";
import { createClient } from "@/lib/supabase/server";
import type { RiskFlagKind, RiskFlagRow } from "@/lib/types/database";

export async function listActiveRiskFlags(): Promise<RiskFlagRow[]> {
  if (!(await isSupabaseConfigured())) return [];
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("risk_flags")
    .select("*")
    .eq("active", true)
    .order("symbol");
  if (error) {
    console.error("listActiveRiskFlags error", error);
    return [];
  }
  return (data ?? []) as RiskFlagRow[];
}

export async function upsertRiskFlag(input: {
  symbol: string;
  kind: RiskFlagKind;
  severity: number;
  note?: string | null;
  expires_at?: string | null;
}): Promise<{ ok: true; row: RiskFlagRow } | { ok: false; error: string }> {
  if (!(await isSupabaseConfigured())) {
    return { ok: false, error: "Supabase yapılandırılmamış." };
  }
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { ok: false, error: "Giriş yapmadın." };

  const symbol = input.symbol.trim().toUpperCase().replace(/[^A-Z0-9]/g, "");
  if (!symbol) return { ok: false, error: "Sembol boş." };
  const severity = Math.max(1, Math.min(3, Math.round(input.severity)));
  const note = input.note?.trim() || null;
  const expires_at = input.expires_at || null;

  // Partial unique index (where active) onConflict ile güvenilir değil; aynı
  // (symbol, kind) aktif kayıt varsa güncelle, yoksa ekle.
  const { data: existing } = await supabase
    .from("risk_flags")
    .select("id")
    .eq("user_id", user.id)
    .eq("symbol", symbol)
    .eq("kind", input.kind)
    .eq("active", true)
    .maybeSingle();

  const payload = {
    user_id: user.id,
    symbol,
    kind: input.kind,
    severity,
    note,
    active: true,
    expires_at,
    updated_at: new Date().toISOString(),
  };

  const query = existing
    ? supabase
        .from("risk_flags")
        .update(payload as never)
        .eq("id", (existing as { id: string }).id)
    : supabase.from("risk_flags").insert(payload as never);

  const { data, error } = await query.select("*").single();
  if (error) return { ok: false, error: error.message };
  revalidatePath("/komite");
  return { ok: true, row: data as unknown as RiskFlagRow };
}

export async function deactivateRiskFlag(
  id: string,
): Promise<{ ok: boolean; error?: string }> {
  if (!(await isSupabaseConfigured())) {
    return { ok: false, error: "Supabase yapılandırılmamış." };
  }
  const supabase = await createClient();
  const { error } = await supabase
    .from("risk_flags")
    .update({ active: false, updated_at: new Date().toISOString() } as never)
    .eq("id", id);
  if (error) return { ok: false, error: error.message };
  revalidatePath("/komite");
  return { ok: true };
}

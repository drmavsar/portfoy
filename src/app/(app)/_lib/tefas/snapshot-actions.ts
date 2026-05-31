"use server";

import { revalidatePath } from "next/cache";

import { isSupabaseConfigured } from "@/app/(app)/ayarlar/actions";
import { createClient } from "@/lib/supabase/server";

import { computeAllocation } from "./allocation-actions";
import { todaySnapshotDate, type SnapshotRow } from "./snapshot-list-helpers";
import type { AllocationResult } from "./allocation-types";

export interface SaveSnapshotInput {
  persona_id?: string;
  portfolio_id?: string;
  notes?: string;
}

export type SaveSnapshotResult =
  | {
      ok: true;
      snapshot_id: string;
      snapshot_date: string;
      created: boolean; // true = new INSERT, false = UPSERT update
    }
  | { ok: false; error: string };

/**
 * Mevcut allocation'ı hesapla + DB'ye yaz. UPSERT mantığı:
 * (user_id, persona_id, portfolio_id, snapshot_date) UNIQUE → aynı gün
 * ikinci kez çağrılırsa mevcut satır güncellenir.
 */
export async function saveAllocationSnapshot(
  input: SaveSnapshotInput = {},
): Promise<SaveSnapshotResult> {
  if (!(await isSupabaseConfigured())) {
    return { ok: false, error: "Supabase yapılandırılmamış." };
  }

  const allocResult = await computeAllocation({
    persona_id: input.persona_id,
    portfolio_id: input.portfolio_id,
  });
  if (!allocResult.ok) return { ok: false, error: allocResult.error };
  const a = allocResult.allocation;

  // Forbidden-words guard: snapshot persist edilmeden önce
  if (!a.forbidden_words_safe) {
    return {
      ok: false,
      error: "Komite içeriği güvenlik filtresinden geçmedi; snapshot kaydedilmedi.",
    };
  }

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { ok: false, error: "Giriş yapmadın." };

  const snapshotDate = todaySnapshotDate();

  // Mevcut snapshot var mı?
  const { data: existingRow } = await supabase
    .from("allocation_snapshots")
    .select("id")
    .eq("user_id", user.id)
    .eq("persona_id", a.persona_id)
    .eq("portfolio_id", a.portfolio_id)
    .eq("snapshot_date", snapshotDate)
    .maybeSingle();
  const existingId = (existingRow as { id: string } | null)?.id ?? null;

  const payload = buildSnapshotPayload({
    userId: user.id,
    snapshotDate,
    notes: input.notes,
    allocation: a,
  });

  if (existingId) {
    // UPDATE — kullanıcı gün içinde trade ekledi, snapshot yenilensin
    const { error } = await supabase
      .from("allocation_snapshots")
      .update(payload as never)
      .eq("id", existingId);
    if (error) return { ok: false, error: error.message };
    revalidatePath("/fonlar/allocation");
    revalidatePath("/fonlar/allocation/snapshots");
    revalidatePath(`/fonlar/allocation/snapshots/${existingId}`);
    return {
      ok: true,
      snapshot_id: existingId,
      snapshot_date: snapshotDate,
      created: false,
    };
  }

  const { data: inserted, error } = await supabase
    .from("allocation_snapshots")
    .insert(payload as never)
    .select("id")
    .single();
  if (error) return { ok: false, error: error.message };
  const newId = (inserted as { id: string }).id;
  revalidatePath("/fonlar/allocation");
  revalidatePath("/fonlar/allocation/snapshots");
  return { ok: true, snapshot_id: newId, snapshot_date: snapshotDate, created: true };
}

interface BuildPayloadInput {
  userId: string;
  snapshotDate: string;
  notes: string | undefined;
  allocation: AllocationResult;
}

function buildSnapshotPayload(input: BuildPayloadInput) {
  const a = input.allocation;
  return {
    user_id: input.userId,
    persona_id: a.persona_id,
    portfolio_id: a.portfolio_id,
    snapshot_date: input.snapshotDate,
    as_of: a.generated_at,
    top_n: a.summary.top_n,
    rebalance_days: 90, // ALLOCATION_DEFAULTS.REBALANCE_DAYS — Sprint-6 sabit
    strategy: a.summary.strategy,
    rebalance_band_pct: a.summary.rebalance_band_pct,
    total_market_value_try: a.summary.total_market_value_try,
    target_funds: a.target as unknown,
    current_positions: a.current as unknown,
    diffs: a.diff as unknown,
    sell_dry_runs: a.sell_dry_runs as unknown,
    summary: a.summary as unknown,
    data_quality_flags: a.data_quality_flags as unknown,
    notes: input.notes && input.notes.trim() ? input.notes.trim() : null,
  };
}

// ──────────────────────────────────────────────────────────────────────────
// List / get
// ──────────────────────────────────────────────────────────────────────────

export async function listAllocationSnapshots(input: {
  personaId?: string;
  portfolioId?: string;
  limit?: number;
} = {}): Promise<SnapshotRow[]> {
  if (!(await isSupabaseConfigured())) return [];
  const supabase = await createClient();
  let q = supabase
    .from("allocation_snapshots")
    .select("*")
    .order("snapshot_date", { ascending: false })
    .order("as_of", { ascending: false })
    .limit(input.limit ?? 100);
  if (input.personaId) q = q.eq("persona_id", input.personaId);
  if (input.portfolioId) q = q.eq("portfolio_id", input.portfolioId);
  const { data, error } = await q;
  if (error) {
    console.error("listAllocationSnapshots error", error);
    return [];
  }
  return (data ?? []) as unknown as SnapshotRow[];
}

export async function getAllocationSnapshot(id: string): Promise<SnapshotRow | null> {
  if (!(await isSupabaseConfigured())) return null;
  if (!id) return null;
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("allocation_snapshots")
    .select("*")
    .eq("id", id)
    .maybeSingle();
  if (error) {
    console.error("getAllocationSnapshot error", error);
    return null;
  }
  return (data ?? null) as unknown as SnapshotRow | null;
}

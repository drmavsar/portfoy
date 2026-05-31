// Sprint-6 PR-G — allocation_snapshots list/detail saf helper'ları.
//
// Snapshot satırı UI'a indirgenmiş halde; jsonb'den AllocationDiff[] vb.
// parse edilerek listede gösterilecek özet üretilir. DB yok; testable.

import type {
  AllocationAction,
  AllocationDiff,
  AllocationSummary,
} from "./allocation-types";

export interface SnapshotRow {
  id: string;
  user_id: string;
  persona_id: string;
  portfolio_id: string;
  snapshot_date: string; // YYYY-MM-DD
  as_of: string; // ISO timestamp
  top_n: number;
  rebalance_days: number;
  strategy: string;
  rebalance_band_pct: number;
  total_market_value_try: number;
  target_funds: unknown;
  current_positions: unknown;
  diffs: unknown;
  sell_dry_runs: unknown;
  summary: unknown;
  data_quality_flags: unknown;
  notes: string | null;
  created_at: string;
  updated_at: string;
}

export interface SnapshotListRowSummary {
  id: string;
  snapshot_date: string;
  as_of: string;
  top_n: number;
  total_market_value_try: number;
  net_cash_need_try: number;
  estimated_tax_try: number;
  action_counts: Record<AllocationAction, number>;
  flag_counts: { info: number; warn: number; critical: number };
  has_notes: boolean;
}

export function summarizeSnapshotForList(row: SnapshotRow): SnapshotListRowSummary {
  const diffs = safeArray<AllocationDiff>(row.diffs);
  const summary = safeObject<AllocationSummary>(row.summary);
  const flags = safeArray<{ level: "info" | "warn" | "critical"; message: string }>(
    row.data_quality_flags,
  );

  const counts: Record<AllocationAction, number> = { EKLEME: 0, AZALTMA: 0, TUT: 0 };
  for (const d of diffs) {
    if (d && (d.action === "EKLEME" || d.action === "AZALTMA" || d.action === "TUT")) {
      counts[d.action] = (counts[d.action] ?? 0) + 1;
    }
  }
  const flagCounts = { info: 0, warn: 0, critical: 0 };
  for (const f of flags) {
    if (f && f.level && f.level in flagCounts) {
      flagCounts[f.level]++;
    }
  }

  return {
    id: row.id,
    snapshot_date: row.snapshot_date,
    as_of: row.as_of,
    top_n: row.top_n,
    total_market_value_try: Number(row.total_market_value_try) || 0,
    net_cash_need_try: Number(summary?.net_cash_need_try ?? 0) || 0,
    estimated_tax_try: Number(summary?.total_tax_try ?? 0) || 0,
    action_counts: counts,
    flag_counts: flagCounts,
    has_notes: !!(row.notes && row.notes.trim().length > 0),
  };
}

/** UTC değil, local YYYY-MM-DD üretir (kullanıcı saat dilimi). */
export function todaySnapshotDate(now: Date = new Date()): string {
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(now.getDate())}`;
}

// ──────────────────────────────────────────────────────────────────────────
// Safe parse helpers (jsonb defensive)
// ──────────────────────────────────────────────────────────────────────────

function safeArray<T>(v: unknown): T[] {
  if (Array.isArray(v)) return v as T[];
  return [];
}

function safeObject<T extends object>(v: unknown): Partial<T> {
  if (v && typeof v === "object" && !Array.isArray(v)) return v as Partial<T>;
  return {};
}

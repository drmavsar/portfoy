// Sprint-5.6 PR-A — Survivorship-safe universe çekme.
//
// "X tarihinde hangi fonlar aktifti?" sorusuna cevap. fund_status_history
// üzerine.
//
// İki kullanım:
//   1. DB query (server context) — Supabase client ile
//   2. In-memory (backtest engine içinde, status history pre-loaded) — saf

import type { FundStatusEntry } from "./types";

/** YYYY-MM-DD tarihte aktif (status='active' ve effective_to >= date veya null). */
export function isActiveAtDate(
  entry: FundStatusEntry,
  date: string,
): boolean {
  if (entry.status !== "active") return false;
  if (entry.effective_from > date) return false;
  if (entry.effective_to != null && entry.effective_to < date) return false;
  return true;
}

/** In-memory: status history listesinden bir tarihteki aktif fund_code'ları. */
export function getActiveFundsAtDateInMemory(
  date: string,
  statusHistory: FundStatusEntry[],
): string[] {
  const active = new Set<string>();
  for (const e of statusHistory) {
    if (isActiveAtDate(e, date)) active.add(e.fund_code);
  }
  return Array.from(active).sort();
}

/** DB query — fund_status_history'ten o tarihte aktif olan fund_code'lar. */
export async function getActiveFundsAtDate(
  date: string,
  supabase: {
    from: (table: string) => {
      select: (cols: string) => {
        eq: (col: string, val: string) => {
          lte: (col: string, val: string) => {
            or: (cond: string) => Promise<{ data: unknown; error: unknown }>;
          };
        };
      };
    };
  },
): Promise<string[]> {
  const { data, error } = await supabase
    .from("fund_status_history")
    .select("fund_code")
    .eq("status", "active")
    .lte("effective_from", date)
    .or(`effective_to.is.null,effective_to.gte.${date}`);
  if (error) {
    throw new Error(`getActiveFundsAtDate: ${JSON.stringify(error)}`);
  }
  const codes = ((data ?? []) as Array<{ fund_code: string }>).map((r) => r.fund_code);
  // Unique + sorted
  return Array.from(new Set(codes)).sort();
}

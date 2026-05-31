// Sprint-5.6 PR-D — Forward Test server-side loader.
//
// fund_scores_history'den günlük Top N snapshot'ları derive eder.

import { createClient } from "@supabase/supabase-js";

import { computeForwardKPIs, type DailySnapshot, type ForwardTestKPIs } from "./forward-kpi";

export interface ForwardTestSnapshot {
  /** Persona id (default kullanıldı). */
  persona_id: string;
  /** Mevcut history aralığı. */
  available_from: string | null;
  available_to: string | null;
  history_days_count: number;
  /** Hesaplanan KPI'lar. */
  kpis: ForwardTestKPIs;
  /** Hangi tarihler için snapshot bulundu (UI debug). */
  snapshots_count: number;
  top_n: number;
  /** En son günün Top N listesi (UI'da göstermek için). */
  latest_top_n: Array<{ fund_code: string; mehmet_score: number }>;
  error?: string;
}

interface HistoryRow {
  fund_code: string;
  computed_at: string;
  mehmet_score: number | null;
}

export async function loadForwardTestSnapshot(
  topN: number = 10,
): Promise<ForwardTestSnapshot> {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !serviceKey) {
    return emptySnapshot(topN, "Supabase env eksik");
  }
  const supabase = createClient(url, serviceKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  });

  // Default persona
  const { data: defaultPersona } = await supabase
    .from("user_personas")
    .select("id")
    .eq("is_default", true)
    .maybeSingle();
  if (!defaultPersona) {
    return emptySnapshot(topN, "Default persona bulunamadı");
  }
  const personaId = defaultPersona.id as string;

  // Tüm history çek (pagination)
  const PAGE = 1000;
  const allRows: HistoryRow[] = [];
  for (let off = 0; ; off += PAGE) {
    const { data, error } = await supabase
      .from("fund_scores_history")
      .select("fund_code, computed_at, mehmet_score")
      .eq("persona_id", personaId)
      .order("computed_at", { ascending: true })
      .range(off, off + PAGE - 1);
    if (error) {
      return emptySnapshot(topN, `Query error: ${error.message}`);
    }
    const chunk = (data ?? []) as HistoryRow[];
    allRows.push(...chunk);
    if (chunk.length < PAGE) break;
  }

  if (allRows.length === 0) {
    return emptySnapshot(topN, "Henüz history snapshot yok");
  }

  // Group by date (computed_at'ın YYYY-MM-DD kısmı). Aynı günde birden fazla
  // snapshot varsa en sonuncuyu al.
  const byDate = new Map<string, HistoryRow[]>();
  for (const r of allRows) {
    const date = r.computed_at.slice(0, 10);
    if (!byDate.has(date)) byDate.set(date, []);
    byDate.get(date)!.push(r);
  }

  // Her gün için en yeni snapshot (computed_at DESC)
  const dates = [...byDate.keys()].sort();
  const snapshots: DailySnapshot[] = dates.map((date) => {
    const rows = byDate.get(date)!;
    // En yeni computed_at — bu gün için snapshot
    const latestCT = rows.map((r) => r.computed_at).sort().pop()!;
    const dayRows = rows.filter((r) => r.computed_at === latestCT);
    const topN_codes = dayRows
      .filter((r) => r.mehmet_score != null)
      .sort((a, b) => (b.mehmet_score! - a.mehmet_score!) || a.fund_code.localeCompare(b.fund_code))
      .slice(0, topN)
      .map((r) => r.fund_code);
    return { date, top_n_codes: topN_codes };
  });

  const kpis = computeForwardKPIs(snapshots);

  // Latest top N (UI için)
  const latestSnap = snapshots[snapshots.length - 1];
  const latestRows = byDate.get(latestSnap.date)!;
  const latestCT = latestRows.map((r) => r.computed_at).sort().pop()!;
  const latestTopN: Array<{ fund_code: string; mehmet_score: number }> = latestRows
    .filter((r) => r.computed_at === latestCT && r.mehmet_score != null)
    .sort((a, b) => (b.mehmet_score! - a.mehmet_score!) || a.fund_code.localeCompare(b.fund_code))
    .slice(0, topN)
    .map((r) => ({ fund_code: r.fund_code, mehmet_score: r.mehmet_score! }));

  return {
    persona_id: personaId,
    available_from: dates[0] ?? null,
    available_to: dates[dates.length - 1] ?? null,
    history_days_count: dates.length,
    kpis,
    snapshots_count: snapshots.length,
    top_n: topN,
    latest_top_n: latestTopN,
  };
}

function emptySnapshot(topN: number, errorMsg: string): ForwardTestSnapshot {
  return {
    persona_id: "",
    available_from: null,
    available_to: null,
    history_days_count: 0,
    kpis: {
      top10_stability: null,
      avg_holding_days: null,
      top3_change_rate: null,
      turnover: null,
      top10_retention_30d: null,
      snapshots_used: 0,
    },
    snapshots_count: 0,
    top_n: topN,
    latest_top_n: [],
    error: errorMsg,
  };
}

// Sprint-5.6 PR-E — Komite Karar Arşivi server-side loader.
//
// fund_scores_history'den belirli bir tarih için:
//   - Top N derived
//   - Bir önceki güne göre delta (yeni giren / çıkan / +3 artış / -3 düşüş)
//   - Mevcut tarih aralığı (UI navigasyon için)

import { createServiceClient } from "@/lib/supabase/server";

export interface KomiteArsivEntry {
  fund_code: string;
  mehmet_score: number;
  components_used: number;
  warnings: string[];
}

export interface KomiteArsivDeltaItem {
  fund_code: string;
  score_today: number | null;
  score_yesterday: number | null;
  delta: number | null;
}

export interface KomiteArsivSnapshot {
  date: string;
  /** Mevcut günün Top N */
  top_n: KomiteArsivEntry[];
  /** Bir önceki tarih (yoksa null) */
  previous_date: string | null;
  /** Bir sonraki tarih (yoksa null) */
  next_date: string | null;
  /** Tüm geçerli tarih aralığı (UI takvim widget için) */
  available_dates: string[];
  /** Yeni giren fonlar (today Top N, yesterday değil) */
  newcomers: KomiteArsivDeltaItem[];
  /** Çıkan fonlar (yesterday Top N, today değil) */
  dropouts: KomiteArsivDeltaItem[];
  /** En büyük 3 skor artışı (today - yesterday) */
  top_gainers: KomiteArsivDeltaItem[];
  /** En büyük 3 skor düşüşü */
  top_losers: KomiteArsivDeltaItem[];
  /** Comparison enabled mi (önceki gün varsa) */
  has_comparison: boolean;
  /** Persona id (display için) */
  persona_id: string;
  persona_name: string | null;
  /** Empty/error mesajı */
  error: string | null;
}

interface HistoryRow {
  fund_code: string;
  computed_at: string;
  mehmet_score: number | null;
  components_used: number | null;
  warnings: string[];
}

export const TOP_N = 10;

function pickLatestPerFund(rows: HistoryRow[]): Map<string, HistoryRow> {
  // O günün rows'unda her fund_code için en son computed_at'i seç
  const byCode = new Map<string, HistoryRow>();
  for (const r of rows) {
    const prev = byCode.get(r.fund_code);
    if (!prev || r.computed_at > prev.computed_at) {
      byCode.set(r.fund_code, r);
    }
  }
  return byCode;
}

function topN(byCode: Map<string, HistoryRow>): KomiteArsivEntry[] {
  return [...byCode.values()]
    .filter((r) => r.mehmet_score != null)
    .sort((a, b) =>
      (b.mehmet_score! - a.mehmet_score!) || a.fund_code.localeCompare(b.fund_code),
    )
    .slice(0, TOP_N)
    .map((r) => ({
      fund_code: r.fund_code,
      mehmet_score: r.mehmet_score!,
      components_used: r.components_used ?? 0,
      warnings: r.warnings ?? [],
    }));
}

/** Belirli bir tarihi (varsa) veya en yakın önceki tarihi resolve et. */
function resolveDate(allDates: string[], requested: string | null): string | null {
  if (allDates.length === 0) return null;
  if (!requested) return allDates[allDates.length - 1]; // en son
  if (allDates.includes(requested)) return requested;
  // En yakın önceki tarih
  for (let i = allDates.length - 1; i >= 0; i--) {
    if (allDates[i] <= requested) return allDates[i];
  }
  return allDates[0]; // requested tüm tarihlerden eski
}

export async function loadKomiteArsiv(requestedDate: string | null): Promise<KomiteArsivSnapshot> {
  const supabase = await createServiceClient();

  // Default persona
  const { data: defaultPersonaRaw } = await supabase
    .from("user_personas")
    .select("id, name")
    .eq("is_default", true)
    .maybeSingle();
  const defaultPersona = defaultPersonaRaw as { id: string; name: string | null } | null;
  if (!defaultPersona) {
    return emptySnapshot(requestedDate ?? "", "Default persona bulunamadı");
  }
  const personaId = defaultPersona.id;
  const personaName = defaultPersona.name ?? null;

  // Tüm history fetch (pagination)
  const PAGE = 1000;
  type Row = HistoryRow;
  const all: Row[] = [];
  for (let off = 0; ; off += PAGE) {
    const { data, error } = await supabase
      .from("fund_scores_history")
      .select("fund_code, computed_at, mehmet_score, components_used, warnings")
      .eq("persona_id", personaId)
      .order("computed_at", { ascending: true })
      .range(off, off + PAGE - 1);
    if (error) {
      return emptySnapshot(requestedDate ?? "", `Query error: ${error.message}`);
    }
    const chunk = (data ?? []) as unknown as Row[];
    all.push(...chunk);
    if (chunk.length < PAGE) break;
  }

  if (all.length === 0) {
    return {
      ...emptySnapshot(requestedDate ?? "", "Henüz history snapshot yok"),
      persona_id: personaId,
      persona_name: personaName,
    };
  }

  // Group by date
  const byDate = new Map<string, Row[]>();
  for (const r of all) {
    const date = r.computed_at.slice(0, 10);
    if (!byDate.has(date)) byDate.set(date, []);
    byDate.get(date)!.push(r);
  }
  const availableDates = [...byDate.keys()].sort();

  // Resolved date
  const date = resolveDate(availableDates, requestedDate);
  if (!date) {
    return emptySnapshot(requestedDate ?? "", "Hiç snapshot yok");
  }

  // Today snapshot
  const todayByCode = pickLatestPerFund(byDate.get(date) ?? []);
  const today_top = topN(todayByCode);

  // Previous / Next dates
  const idx = availableDates.indexOf(date);
  const previous_date = idx > 0 ? availableDates[idx - 1] : null;
  const next_date = idx + 1 < availableDates.length ? availableDates[idx + 1] : null;

  // Delta (only if previous available)
  let newcomers: KomiteArsivDeltaItem[] = [];
  let dropouts: KomiteArsivDeltaItem[] = [];
  let top_gainers: KomiteArsivDeltaItem[] = [];
  let top_losers: KomiteArsivDeltaItem[] = [];
  let has_comparison = false;

  if (previous_date) {
    has_comparison = true;
    const yesterdayByCode = pickLatestPerFund(byDate.get(previous_date) ?? []);
    const yesterday_top = topN(yesterdayByCode);
    const todaySet = new Set(today_top.map((t) => t.fund_code));
    const yesterdaySet = new Set(yesterday_top.map((t) => t.fund_code));

    newcomers = today_top
      .filter((t) => !yesterdaySet.has(t.fund_code))
      .map((t) => {
        const yesterdayScore = yesterdayByCode.get(t.fund_code)?.mehmet_score ?? null;
        return {
          fund_code: t.fund_code,
          score_today: t.mehmet_score,
          score_yesterday: yesterdayScore,
          delta: yesterdayScore != null ? t.mehmet_score - yesterdayScore : null,
        };
      });

    dropouts = yesterday_top
      .filter((y) => !todaySet.has(y.fund_code))
      .map((y) => {
        const todayScore = todayByCode.get(y.fund_code)?.mehmet_score ?? null;
        return {
          fund_code: y.fund_code,
          score_today: todayScore,
          score_yesterday: y.mehmet_score,
          delta: todayScore != null ? todayScore - y.mehmet_score : null,
        };
      });

    // Tüm fonlar üzerinde gainer/loser
    const deltas: KomiteArsivDeltaItem[] = [];
    const allCodes = new Set<string>([...todayByCode.keys(), ...yesterdayByCode.keys()]);
    for (const code of allCodes) {
      const t = todayByCode.get(code)?.mehmet_score ?? null;
      const y = yesterdayByCode.get(code)?.mehmet_score ?? null;
      const delta = t != null && y != null ? t - y : null;
      if (delta != null) {
        deltas.push({ fund_code: code, score_today: t, score_yesterday: y, delta });
      }
    }
    const sortedByDelta = [...deltas].sort((a, b) => (b.delta ?? 0) - (a.delta ?? 0));
    top_gainers = sortedByDelta.filter((d) => (d.delta ?? 0) > 0).slice(0, 3);
    top_losers = sortedByDelta.filter((d) => (d.delta ?? 0) < 0).slice(-3).reverse();
  }

  return {
    date,
    top_n: today_top,
    previous_date,
    next_date,
    available_dates: availableDates,
    newcomers,
    dropouts,
    top_gainers,
    top_losers,
    has_comparison,
    persona_id: personaId,
    persona_name: personaName,
    error: null,
  };
}

function emptySnapshot(date: string, errorMsg: string): KomiteArsivSnapshot {
  return {
    date,
    top_n: [],
    previous_date: null,
    next_date: null,
    available_dates: [],
    newcomers: [],
    dropouts: [],
    top_gainers: [],
    top_losers: [],
    has_comparison: false,
    persona_id: "",
    persona_name: null,
    error: errorMsg,
  };
}

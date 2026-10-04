"use server";

// Birikim ve hisse karşılaştırması — veri toplama katmanı.
// Saf hesap savings-analysis.ts'te; bu dosya yalnız okuma yapar.

import { isSupabaseConfigured } from "@/app/(app)/ayarlar/actions";
import {
  computeSavingsReport,
  type AltKey,
  type DailyPoint,
  type PortfolioFlow,
  type SavingsReport,
  type SavingsTxn,
  type WealthAnchor,
} from "@/app/(app)/_lib/savings-analysis";
import { taxIncomeKindForCategory } from "@/app/(app)/_lib/tax-year-report";
import { portfolioCashFlows } from "@/app/(app)/_lib/portfolio-flows";
import { listAssets, listRealizedBySellTrade, listTrades } from "@/app/(app)/_lib/wealth-actions";
import { istanbulToday } from "@/lib/finance/istanbul-date";
import { createClient } from "@/lib/supabase/server";
import { readAll } from "@/lib/supabase/read-all";

/** Portföy karşılaştırmasına giren varlık sınıfları (Özet'teki "Portföy" ile aynı kapsam). */
const PORTFOLIO_CLASSES = new Set(["equity_tr", "fund"]);

export async function savingsReport(year?: number): Promise<SavingsReport | null> {
  if (!(await isSupabaseConfigured())) return null;
  const supabase = await createClient();
  const today = istanbulToday();
  const y = year ?? Number(today.slice(0, 4));
  const start = `${y}-01-01`;
  const end = `${y}-12-31`;
  const prevDec = `${y - 1}-12-01`;

  const [txRows, catRows, dailyRows, wsRow, trades, assets, realizedBySell, seriesRows] = await Promise.all([
    readAll<{
      id: string;
      occurred_on: string;
      direction: "inflow" | "outflow" | "transfer";
      amount: number;
      amount_try: number | null;
      currency: string;
      category_id: string | null;
    }>(
      (f, t) =>
        supabase
          .from("transactions")
          .select("id, occurred_on, direction, amount, amount_try, currency, category_id", { count: "exact" })
          .eq("status", "committed")
          .eq("is_transfer", false)
          .is("deleted_at", null)
          .gte("occurred_on", start)
          .lte("occurred_on", end)
          .order("occurred_on", { ascending: true })
          .order("id", { ascending: true })
          .range(f, t),
      (r) => r.id,
    ),
    supabase.from("categories").select("id, name"),
    readAll<{ snapshot_date: string; total_wealth: number; equity_mv: number }>(
      (f, t) =>
        supabase
          .from("daily_snapshots")
          .select("snapshot_date, total_wealth, equity_mv", { count: "exact" })
          .gte("snapshot_date", prevDec)
          .lte("snapshot_date", end)
          .order("snapshot_date", { ascending: true })
          .range(f, t),
      (r) => r.snapshot_date,
    ),
    supabase.from("wealth_snapshots").select("period, total_try").eq("period", String(y - 1)).maybeSingle(),
    listTrades(),
    listAssets(),
    listRealizedBySellTrade(),
    supabase.from("benchmark_series").select("id, code").in("code", ["XU100", "XAUTRY", "USDTRY"]),
  ]);

  // ---- Gelir / gider ------------------------------------------------------
  const catName = new Map(((catRows.data ?? []) as Array<{ id: string; name: string }>).map((c) => [c.id, c.name]));
  const txns: SavingsTxn[] = [];
  const dividends: PortfolioFlow[] = [];
  for (const r of txRows) {
    const amount = r.currency === "TRY" ? Number(r.amount) : r.amount_try != null ? Number(r.amount_try) : null;
    if (amount == null || !Number.isFinite(amount)) continue;
    const category = r.category_id ? (catName.get(r.category_id) ?? null) : null;
    txns.push({ occurred_on: r.occurred_on, direction: r.direction, amount, category });
    // Temettü: portföyden çıkan nakit getiri
    if (r.direction === "inflow" && category && taxIncomeKindForCategory(category) === "dividend") {
      dividends.push({ date: r.occurred_on, amount });
    }
  }

  // ---- Servet ----------------------------------------------------------------
  const daily: DailyPoint[] = dailyRows.map((d) => ({
    date: d.snapshot_date,
    total_wealth: Number(d.total_wealth),
    equity_mv: Number(d.equity_mv),
  }));
  const prevYearEnd = [...daily].reverse().find((d) => d.date >= prevDec && d.date <= `${y - 1}-12-31`);
  const ws = wsRow.data as { period: string; total_try: number } | null;
  const yearStart: WealthAnchor | null = prevYearEnd
    ? { date: prevYearEnd.date, value: prevYearEnd.total_wealth, source: "daily" }
    : ws
      ? { date: `${y - 1}-12-31`, value: Number(ws.total_try), source: "manual" }
      : null;

  // ---- Portföy nakit akışları (eşleşmeyen satışlar hariç) -------------------
  const flows: PortfolioFlow[] = portfolioCashFlows(trades, assets, realizedBySell, PORTFOLIO_CLASSES);

  // ---- Karşılaştırma serileri ------------------------------------------------
  const codeById = new Map(
    ((seriesRows.data ?? []) as Array<{ id: string; code: AltKey }>).map((s) => [s.id, s.code]),
  );
  const series: Record<AltKey, Array<[string, number]>> = { XU100: [], XAUTRY: [], USDTRY: [] };
  if (codeById.size > 0) {
    const pts = await readAll<{ series_id: string; as_of: string; value: number }>(
      (f, t) =>
        supabase
          .from("benchmark_points")
          .select("series_id, as_of, value", { count: "exact" })
          .in("series_id", Array.from(codeById.keys()))
          .gte("as_of", `${y - 1}-11-15`)
          .lte("as_of", end)
          .order("as_of", { ascending: true })
          .order("series_id", { ascending: true })
          .range(f, t),
      (r) => `${r.series_id}|${r.as_of}`,
    );
    for (const p of pts) {
      const code = codeById.get(p.series_id);
      if (code) series[code].push([p.as_of, Number(p.value)]);
    }
  }

  return computeSavingsReport({ year: y, today, txns, daily, yearStart, flows, dividends, series });
}

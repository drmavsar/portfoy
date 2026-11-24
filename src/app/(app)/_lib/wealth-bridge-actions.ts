"use server";

// Servet köprüsü — veri toplama katmanı. Saf hesap wealth-bridge.ts'te.

import { isSupabaseConfigured } from "@/app/(app)/ayarlar/actions";
import { portfolioCashFlows } from "@/app/(app)/_lib/portfolio-flows";
import { taxIncomeKindForCategory } from "@/app/(app)/_lib/tax-year-report";
import { listAssets, listRealizedBySellTrade, listTrades } from "@/app/(app)/_lib/wealth-actions";
import {
  bridgeWindow,
  monthlyBridge,
  type BridgeInputs,
  type BridgeRow,
  type BridgeWindow,
  type EquityAnchor,
} from "@/app/(app)/_lib/wealth-bridge";
import { istanbulToday } from "@/lib/finance/istanbul-date";
import { createClient } from "@/lib/supabase/server";
import { readAll } from "@/lib/supabase/read-all";

export interface BridgePeriod {
  key: string;
  label: string;
  window: BridgeWindow;
}

export interface WealthBridgeReport {
  today: string;
  /** İlk günlük servet kaydı; öncesi sınıflara ayrılamaz */
  trackedSince: string | null;
  periods: BridgePeriod[];
  monthly: BridgeRow[];
}

/** Portföy → kişi: portföydeki işlemlerin çoğunluğunun beneficiary'si. */
function portfolioPersons(trades: Array<{ portfolio_id: string; beneficiary_id: string | null }>): Map<string, string> {
  const counts = new Map<string, Map<string, number>>();
  for (const t of trades) {
    if (!t.beneficiary_id) continue;
    const m = counts.get(t.portfolio_id) ?? new Map<string, number>();
    m.set(t.beneficiary_id, (m.get(t.beneficiary_id) ?? 0) + 1);
    counts.set(t.portfolio_id, m);
  }
  const out = new Map<string, string>();
  for (const [pid, m] of counts) out.set(pid, [...m.entries()].sort((a, b) => b[1] - a[1])[0][0]);
  return out;
}

function lastDayOfPrevMonth(iso: string): string {
  const [y, m] = iso.split("-").map(Number);
  return new Date(Date.UTC(y, m - 1, 0)).toISOString().slice(0, 10);
}

export async function wealthBridgeReport(): Promise<WealthBridgeReport | null> {
  if (!(await isSupabaseConfigured())) return null;
  const supabase = await createClient();
  const today = istanbulToday();

  const [dailyRows, wsRows, txRows, catRows, trades, assets, realizedBySell, anchorRows, benRows] = await Promise.all([
    readAll<{
      snapshot_date: string;
      total_wealth: number;
      fx_try: number;
      metal_try: number;
      equity_mv: number;
      equity_by_person: Record<string, number> | null;
      usdtry: number | null;
      xau_gram_try: number | null;
    }>(
      (f, t) =>
        supabase
          .from("daily_snapshots")
          .select("snapshot_date, total_wealth, fx_try, metal_try, equity_mv, equity_by_person, usdtry, xau_gram_try", { count: "exact" })
          .lte("snapshot_date", today)
          .order("snapshot_date", { ascending: true })
          .range(f, t),
      (r) => r.snapshot_date,
    ),
    supabase.from("wealth_snapshots").select("period, total_try"),
    readAll<{
      id: string;
      occurred_on: string;
      direction: "inflow" | "outflow";
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
          .in("direction", ["inflow", "outflow"])
          .lte("occurred_on", today)
          .order("occurred_on", { ascending: true })
          .order("id", { ascending: true })
          .range(f, t),
      (r) => r.id,
    ),
    supabase.from("categories").select("id, name"),
    listTrades(),
    listAssets(),
    listRealizedBySellTrade(),
    // Günlük kayıt öncesi, aracı kurum ekstresinden bilinen kişi bazında hisse değerleri
    supabase.from("equity_anchors").select("beneficiary_id, as_of, value_try"),
    supabase.from("beneficiaries").select("id, name"),
  ]);

  const daily = dailyRows.map((d) => ({
    date: d.snapshot_date,
    total: Number(d.total_wealth),
    fx: Number(d.fx_try),
    metal: Number(d.metal_try),
    invest: Number(d.equity_mv),
    investByPerson: d.equity_by_person
      ? Object.fromEntries(Object.entries(d.equity_by_person).map(([k, v]) => [k, Number(v)]))
      : undefined,
    usdtry: d.usdtry == null ? null : Number(d.usdtry),
    xau: d.xau_gram_try == null ? null : Number(d.xau_gram_try),
  }));
  const firstDaily = daily[0]?.date ?? null;

  // Elle girilen yıl sonları yalnız günlük kayıt başlamadan önce dayanak olur
  // (sonrası için günlük kayıt esas; "2026" gibi yıl içi tahmin satırları da
  // böylece yanlış tarihe oturmaz).
  const manual = ((wsRows.data ?? []) as Array<{ period: string; total_try: number }>)
    .filter((r) => /^\d{4}$/.test(r.period))
    .map((r) => ({ date: `${r.period}-12-31`, value: Number(r.total_try) }))
    .filter((r) => !firstDaily || r.date < firstDaily)
    .sort((a, b) => (a.date < b.date ? -1 : 1));

  const catName = new Map(((catRows.data ?? []) as Array<{ id: string; name: string }>).map((c) => [c.id, c.name]));
  const txns: BridgeInputs["txns"] = [];
  for (const r of txRows) {
    const amount = r.currency === "TRY" ? Number(r.amount) : r.amount_try != null ? Number(r.amount_try) : null;
    if (amount == null || !Number.isFinite(amount)) continue;
    const cat = r.category_id ? catName.get(r.category_id) : undefined;
    txns.push({
      date: r.occurred_on,
      direction: r.direction,
      amount,
      dividend: r.direction === "inflow" && !!cat && taxIncomeKindForCategory(cat) === "dividend",
    });
  }

  // Snapshot'taki yatırım değeri bütün pozisyonları kapsar → bütün işlemler.
  // Kişi: snapshot'ın equity_by_person'ı gibi portföy → kişi (portföydeki
  // işlemlerin çoğunluğunun kişisi).
  const personOf = portfolioPersons(trades);
  const flows = portfolioCashFlows(trades, assets, realizedBySell).map((f) => ({
    date: f.date,
    amount: f.amount,
    person: personOf.get(f.portfolioId) ?? null,
  }));
  const benName = new Map(((benRows.data ?? []) as Array<{ id: string; name: string }>).map((b) => [b.id, b.name]));
  const equityAnchors: EquityAnchor[] = ((anchorRows.data ?? []) as Array<{ beneficiary_id: string; as_of: string; value_try: number }>)
    .map((a) => ({ date: a.as_of, person: a.beneficiary_id, label: benName.get(a.beneficiary_id) ?? "?", value: Number(a.value_try) }))
    .filter((a) => Number.isFinite(a.value));
  const input: BridgeInputs = { today, daily, manual, txns, flows, equityAnchors };

  // Dönemler. "Başından" = kayıtlı gelir-giderin başladığı yıl sonu
  // (günlük kayıttan önceki son elle girilen yıl sonu); daha eski yıllarda
  // gelir-gider kaydı olmadığı için tasarruf ölçülemez.
  const y = Number(today.slice(0, 4));
  const thisMonthStart = lastDayOfPrevMonth(today);
  const periods: BridgePeriod[] = [];
  const push = (key: string, label: string, w: BridgeWindow | null) => {
    if (w && !periods.some((p) => p.window.start.date === w.start.date && p.window.end.date === w.end.date)) {
      periods.push({ key, label, window: w });
    }
  };
  push("month", "Bu ay", bridgeWindow(input, thisMonthStart, today));
  push("prev-month", "Geçen ay", bridgeWindow(input, lastDayOfPrevMonth(thisMonthStart), thisMonthStart));
  push("year", "Bu yıl", bridgeWindow(input, `${y - 1}-12-31`, today));
  const origin = manual.length > 0 ? manual[manual.length - 1].date : firstDaily;
  if (origin) {
    for (let yy = y - 1; yy > Number(origin.slice(0, 4)); yy--) {
      push(`y${yy}`, String(yy), bridgeWindow(input, `${yy - 1}-12-31`, `${yy}-12-31`));
    }
    push("all", "Başından", bridgeWindow(input, origin, today));
  }

  return { today, trackedSince: firstDaily, periods, monthly: monthlyBridge(input) };
}

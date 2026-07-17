"use server";

import { isSupabaseConfigured } from "@/app/(app)/ayarlar/actions";
import { createClient } from "@/lib/supabase/server";
import { listAssets, listHoldings, listTrades } from "@/app/(app)/_lib/wealth-actions";
import { getStockPrices } from "@/app/(app)/_lib/stock-prices";
import { listFundQuotes } from "@/app/(app)/_lib/tefas/prices-actions";
import {
  BENCH_CODES,
  type BenchResult,
  type BenchmarkCompareResult,
  type SymbolCompare,
} from "@/app/(app)/_lib/benchmark-compare-types";

/** Sıralı [date, value] dizisinde tarihe ≤ en yakın değeri bul (binary search). */
function nearestOnOrBefore(points: Array<[string, number]>, date: string): number | null {
  let lo = 0;
  let hi = points.length - 1;
  let ans: number | null = null;
  while (lo <= hi) {
    const mid = (lo + hi) >> 1;
    if (points[mid][0] <= date) {
      ans = points[mid][1];
      lo = mid + 1;
    } else {
      hi = mid - 1;
    }
  }
  return ans;
}

export async function benchmarkComparison(): Promise<BenchmarkCompareResult | null> {
  if (!(await isSupabaseConfigured())) return null;

  const [trades, assets, holdings] = await Promise.all([
    listTrades(),
    listAssets(),
    listHoldings(),
  ]);
  if (trades.length === 0) return null;

  const assetMap = Object.fromEntries(assets.map((a) => [a.id, a]));

  // ---- Benchmark serilerini çek (işlem aralığı + bugün) --------------------
  const minTradeDate = trades.reduce(
    (m, t) => (t.executed_at.slice(0, 10) < m ? t.executed_at.slice(0, 10) : m),
    trades[0].executed_at.slice(0, 10),
  );
  // Hafta sonu/tatil işlemleri için birkaç gün geriye tampon.
  const fromDate = (() => {
    const d = new Date(minTradeDate + "T00:00:00Z");
    d.setUTCDate(d.getUTCDate() - 7);
    return d.toISOString().slice(0, 10);
  })();

  const supabase = await createClient();
  const { data: bpData, error } = await supabase
    .from("benchmark_points")
    .select("as_of, value, benchmark_series!inner(code)")
    .gte("as_of", fromDate)
    .order("as_of", { ascending: true });
  if (error) {
    console.error("benchmarkComparison points error", error);
    return null;
  }
  type BpRow = { as_of: string; value: number; benchmark_series: { code: string } | Array<{ code: string }> };
  const seriesPoints: Record<string, Array<[string, number]>> = {};
  let asOf = fromDate;
  for (const r of (bpData ?? []) as unknown as BpRow[]) {
    const s = Array.isArray(r.benchmark_series) ? r.benchmark_series[0] : r.benchmark_series;
    const code = s?.code;
    if (!code || !(BENCH_CODES as readonly string[]).includes(code)) continue;
    (seriesPoints[code] ??= []).push([r.as_of, Number(r.value)]);
    if (r.as_of > asOf) asOf = r.as_of;
  }
  // Her seri için "bugünkü" (en güncel) fiyat.
  const latestPrice: Record<string, number> = {};
  for (const code of BENCH_CODES) {
    const pts = seriesPoints[code];
    if (pts && pts.length > 0) latestPrice[code] = pts[pts.length - 1][1];
  }

  // ---- Güncel hisse/fon fiyatları (açık pozisyon değeri) -------------------
  const heldEquity = holdings
    .map((h) => assetMap[h.asset_id])
    .filter((a) => a && a.asset_class === "equity_tr")
    .map((a) => a.symbol);
  const heldFunds = holdings
    .map((h) => assetMap[h.asset_id])
    .filter((a) => a && a.asset_class === "fund")
    .map((a) => a.symbol);
  const [stockQuotes, fundQuotes] = await Promise.all([
    heldEquity.length > 0 ? getStockPrices(heldEquity) : Promise.resolve({} as Awaited<ReturnType<typeof getStockPrices>>),
    heldFunds.length > 0 ? listFundQuotes(heldFunds) : Promise.resolve([] as Awaited<ReturnType<typeof listFundQuotes>>),
  ]);
  const priceBySymbol: Record<string, number> = {};
  for (const [sym, q] of Object.entries(stockQuotes)) priceBySymbol[sym] = q.price;
  for (const fq of fundQuotes) priceBySymbol[fq.fund_code] = fq.nav;

  const holdingByAsset = new Map(holdings.map((h) => [h.asset_id, h]));

  // ---- Sembol bazında nakit akışı aynası -----------------------------------
  interface Acc {
    asset_id: string;
    symbol: string;
    name: string;
    asset_class: string;
    buyTry: number;
    sellTry: number;
    // benchmark birimi (kod → birim adedi); alışta artar, satışta azalır
    units: Record<string, number>;
  }
  const accs = new Map<string, Acc>();
  // Kronolojik sırayla işle (aynı gün fiyatı kullanılır).
  const sorted = [...trades].sort((a, b) => (a.executed_at < b.executed_at ? -1 : 1));
  for (const t of sorted) {
    const a = assetMap[t.asset_id];
    if (!a) continue;
    let acc = accs.get(t.asset_id);
    if (!acc) {
      acc = {
        asset_id: t.asset_id,
        symbol: a.symbol,
        name: a.name,
        asset_class: a.asset_class,
        buyTry: 0,
        sellTry: 0,
        units: {},
      };
      accs.set(t.asset_id, acc);
    }
    const date = t.executed_at.slice(0, 10);
    const gross = Number(t.quantity) * Number(t.price);
    const fees = Number(t.fees);
    const cashTry = t.side === "buy" ? gross + fees : gross - fees;
    if (t.side === "buy") acc.buyTry += cashTry;
    else acc.sellTry += cashTry;

    for (const code of BENCH_CODES) {
      const pts = seriesPoints[code];
      if (!pts) continue;
      const px = nearestOnOrBefore(pts, date);
      if (px == null || px <= 0) continue;
      const unitDelta = cashTry / px;
      acc.units[code] = (acc.units[code] ?? 0) + (t.side === "buy" ? unitDelta : -unitDelta);
    }
  }

  const buildBenches = (units: Record<string, number>, netInvested: number, actualProfit: number): BenchResult[] =>
    BENCH_CODES.map((code) => {
      const u = units[code] ?? 0;
      const px = latestPrice[code] ?? 0;
      const finalValue = u * px;
      const profit = finalValue - netInvested;
      return { code, finalValue, profit, vsActual: profit - actualProfit };
    });

  const symbols: SymbolCompare[] = [];
  const totalUnits: Record<string, number> = {};
  let tBuy = 0;
  let tSell = 0;
  let tMv = 0;

  for (const acc of accs.values()) {
    const h = holdingByAsset.get(acc.asset_id);
    const qty = h ? Number(h.quantity) : 0;
    const px = priceBySymbol[acc.symbol];
    const priced = px != null && qty > 0;
    // Güncel piyasa değeri: fiyat varsa qty×fiyat, yoksa maliyet bazına düş.
    const currentMv = priced ? qty * px : h ? Number(h.cost_basis_try) : 0;
    const netInvested = acc.buyTry - acc.sellTry;
    const actualProfit = currentMv - netInvested;

    symbols.push({
      asset_id: acc.asset_id,
      symbol: acc.symbol,
      name: acc.name,
      buyTry: acc.buyTry,
      sellTry: acc.sellTry,
      netInvested,
      currentQty: qty,
      currentMv,
      actualProfit,
      priced,
      benches: buildBenches(acc.units, netInvested, actualProfit),
    });

    tBuy += acc.buyTry;
    tSell += acc.sellTry;
    tMv += currentMv;
    for (const code of BENCH_CODES) totalUnits[code] = (totalUnits[code] ?? 0) + (acc.units[code] ?? 0);
  }

  symbols.sort((a, b) => b.currentMv - a.currentMv);

  const totalNetInvested = tBuy - tSell;
  const totalActualProfit = tMv - totalNetInvested;

  return {
    symbols,
    total: {
      buyTry: tBuy,
      sellTry: tSell,
      netInvested: totalNetInvested,
      currentQty: 0,
      currentMv: tMv,
      actualProfit: totalActualProfit,
      benches: buildBenches(totalUnits, totalNetInvested, totalActualProfit),
    },
    asOf,
    tradeCount: trades.length,
  };
}

"use server";

import { isSupabaseConfigured } from "@/app/(app)/ayarlar/actions";
import { createClient } from "@/lib/supabase/server";
import { readAll } from "@/lib/supabase/read-all";
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

  // Yalnız ihtiyaç duyulan serileri, SAYFALAYARAK oku. Eskiden filtresiz ve
  // sayfasız okunuyordu: PostgREST 1000 satır sınırı EN ESKİ 1000 satırı
  // döndürüyor (TLREF/CPI gibi ilgisiz seriler de sayıyordu) → "bugünkü"
  // benchmark fiyatı aylar öncesinden kalıyordu.
  const supabase = await createClient();
  const { data: seriesRows, error: seriesErr } = await supabase
    .from("benchmark_series")
    .select("id, code")
    .in("code", BENCH_CODES as unknown as string[]);
  if (seriesErr) {
    console.error("benchmarkComparison series error", seriesErr);
    return null;
  }
  const codeById = new Map(
    ((seriesRows ?? []) as Array<{ id: string; code: string }>).map((s) => [s.id, s.code]),
  );
  type BpRow = { series_id: string; as_of: string; value: number };
  let bpData: BpRow[] = [];
  if (codeById.size > 0) {
    try {
      bpData = await readAll<BpRow>(
        (from, to) =>
          supabase
            .from("benchmark_points")
            .select("series_id, as_of, value", { count: "exact" })
            .in("series_id", Array.from(codeById.keys()))
            .gte("as_of", fromDate)
            .order("as_of", { ascending: true })
            .order("series_id", { ascending: true })
            .range(from, to),
        (r) => `${r.series_id}|${r.as_of}`,
      );
    } catch (e) {
      console.error("benchmarkComparison points error", e);
      return null;
    }
  }
  const seriesPoints: Record<string, Array<[string, number]>> = {};
  let asOf = fromDate;
  for (const r of bpData) {
    const code = codeById.get(r.series_id);
    if (!code) continue;
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

  // v_holdings_wac (portföy, varlık) başına satırdır; aynı hisse birden fazla
  // portföyde olabilir (ör. THYAO üç kişide). Eskiden Map son satırı tutuyordu
  // → güncel değer tek portföyün adedinden, nakit akışı ise TÜM portföylerden
  // → gerçek K/Z büyük ölçüde yanlıştı. Varlık bazında topla.
  const holdingByAsset = new Map<string, { quantity: number; cost_basis_try: number }>();
  for (const h of holdings) {
    const cur = holdingByAsset.get(h.asset_id) ?? { quantity: 0, cost_basis_try: 0 };
    cur.quantity += Number(h.quantity);
    cur.cost_basis_try += Number(h.cost_basis_try);
    holdingByAsset.set(h.asset_id, cur);
  }

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
    // işlem tarihinde fiyatı olmayan benchmark'lar (seri daha geç başlıyor)
    missing: Set<string>;
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
        missing: new Set(),
      };
      accs.set(t.asset_id, acc);
    }
    const date = t.executed_at.slice(0, 10);
    // Döviz cinsinden işlem → TRY (v_holdings_wac ile aynı kural)
    const fx = t.currency === "TRY" ? 1 : Number(t.fx_rate_to_try ?? 1) || 1;
    const gross = Number(t.quantity) * Number(t.price) * fx;
    const fees = Number(t.fees) * fx;
    const cashTry = t.side === "buy" ? gross + fees : gross - fees;
    if (t.side === "buy") acc.buyTry += cashTry;
    else acc.sellTry += cashTry;

    for (const code of BENCH_CODES) {
      const pts = seriesPoints[code];
      const px = pts ? nearestOnOrBefore(pts, date) : null;
      if (px == null || px <= 0) {
        acc.missing.add(code);
        continue;
      }
      const unitDelta = cashTry / px;
      acc.units[code] = (acc.units[code] ?? 0) + (t.side === "buy" ? unitDelta : -unitDelta);
    }
  }

  const buildBenches = (
    units: Record<string, number>,
    missing: Set<string>,
    netInvested: number,
    actualProfit: number,
  ): BenchResult[] =>
    BENCH_CODES.map((code) => {
      const u = units[code] ?? 0;
      const px = latestPrice[code] ?? 0;
      const available = !missing.has(code) && px > 0;
      const finalValue = u * px;
      const profit = finalValue - netInvested;
      return { code, available, finalValue, profit, vsActual: profit - actualProfit };
    });

  const symbols: SymbolCompare[] = [];
  const totalUnits: Record<string, number> = {};
  const totalMissing = new Set<string>();
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
      benches: buildBenches(acc.units, acc.missing, netInvested, actualProfit),
    });
    for (const c of acc.missing) totalMissing.add(c);

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
      benches: buildBenches(totalUnits, totalMissing, totalNetInvested, totalActualProfit),
    },
    asOf,
    tradeCount: trades.length,
  };
}

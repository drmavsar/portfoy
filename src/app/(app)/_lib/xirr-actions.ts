"use server";

// Para ağırlıklı getiri (XIRR) raporu — veri toplama katmanı.
// Saf hesap xirr-report.ts'te; bu dosya yalnız okuma yapar.

import { isSupabaseConfigured } from "@/app/(app)/ayarlar/actions";
import { listBeneficiariesLite } from "@/app/(app)/hesaplar/actions";
import { getStockPrices } from "@/app/(app)/_lib/stock-prices";
import { listFundQuotes } from "@/app/(app)/_lib/tefas/prices-actions";
import {
  listAssets,
  listHoldings,
  listPortfolios,
  listRealizedBySellTrade,
  listTrades,
} from "@/app/(app)/_lib/wealth-actions";
import {
  computeXirrReport,
  findUnmatchedSells,
  type XirrGroup,
  type XirrReport,
} from "@/app/(app)/_lib/xirr-report";
import { istanbulToday } from "@/lib/finance/istanbul-date";
import { createClient } from "@/lib/supabase/server";
import { readAll } from "@/lib/supabase/read-all";

export async function xirrReport(): Promise<XirrReport | null> {
  if (!(await isSupabaseConfigured())) return null;

  const [trades, holdings, assets, portfolios, beneficiaries, realizedBySell] = await Promise.all([
    listTrades(),
    listHoldings(),
    listAssets(),
    listPortfolios(),
    listBeneficiariesLite(),
    listRealizedBySellTrade(),
  ]);
  if (trades.length === 0) return null;

  const assetMap = new Map(assets.map((a) => [a.id, a]));

  // ---- Bugünkü piyasa değeri (portföy başına) -----------------------------
  const equitySymbols: string[] = [];
  const fundCodes: string[] = [];
  for (const h of holdings) {
    const a = assetMap.get(h.asset_id);
    if (!a) continue;
    if (a.asset_class === "equity_tr") equitySymbols.push(a.symbol);
    else if (a.asset_class === "fund") fundCodes.push(a.symbol);
  }
  const [stockQuotes, fundQuotes] = await Promise.all([
    equitySymbols.length > 0
      ? getStockPrices(equitySymbols)
      : Promise.resolve({} as Awaited<ReturnType<typeof getStockPrices>>),
    fundCodes.length > 0
      ? listFundQuotes(fundCodes)
      : Promise.resolve([] as Awaited<ReturnType<typeof listFundQuotes>>),
  ]);
  const priceBySymbol: Record<string, number> = {};
  for (const [sym, q] of Object.entries(stockQuotes)) priceBySymbol[sym] = q.price;
  for (const fq of fundQuotes) priceBySymbol[fq.fund_code] = fq.nav;

  const mvByPortfolio: Record<string, number> = {};
  for (const h of holdings) {
    const a = assetMap.get(h.asset_id);
    const px = a ? priceBySymbol[a.symbol] : undefined;
    // Fiyat yoksa maliyetten (Özet/cron ile aynı yedek)
    const mv = px != null ? Number(h.quantity) * px : Number(h.cost_basis_try);
    mvByPortfolio[h.portfolio_id] = (mvByPortfolio[h.portfolio_id] ?? 0) + mv;
  }

  // ---- Gruplar: toplam · kişi · (kişide birden fazla portföy varsa) portföy --
  const benCount = new Map<string, Map<string, number>>(); // portfolio → ben → adet
  for (const t of trades) {
    if (!t.beneficiary_id) continue;
    const m = benCount.get(t.portfolio_id) ?? new Map<string, number>();
    m.set(t.beneficiary_id, (m.get(t.beneficiary_id) ?? 0) + 1);
    benCount.set(t.portfolio_id, m);
  }
  const ownerOf = (portfolioId: string): string | null => {
    const m = benCount.get(portfolioId);
    if (!m) return null;
    return [...m.entries()].sort((a, b) => b[1] - a[1])[0]?.[0] ?? null;
  };
  const tradedPortfolios = Array.from(new Set(trades.map((t) => t.portfolio_id)));
  const byPerson = new Map<string, string[]>();
  for (const pid of tradedPortfolios) {
    const owner = ownerOf(pid) ?? "__none__";
    byPerson.set(owner, [...(byPerson.get(owner) ?? []), pid]);
  }
  const benName = new Map(beneficiaries.map((b) => [b.id, b.name]));
  const portfolioName = new Map(portfolios.map((p) => [p.id, p.name]));

  const groups: XirrGroup[] = [
    { key: "total", label: "Toplam", kind: "total", portfolioIds: tradedPortfolios },
  ];
  for (const [person, pids] of byPerson) {
    groups.push({
      key: `person:${person}`,
      label: person === "__none__" ? "Atanmamış" : (benName.get(person) ?? "Bilinmeyen kişi"),
      kind: "person",
      portfolioIds: pids,
    });
    if (pids.length > 1) {
      for (const pid of pids) {
        groups.push({
          key: `portfolio:${pid}`,
          label: portfolioName.get(pid) ?? "Portföy",
          kind: "portfolio",
          portfolioIds: [pid],
        });
      }
    }
  }

  // ---- Birim serileri: USD, gram altın, TÜFE -----------------------------
  const firstTrade = trades.reduce(
    (m, t) => (t.executed_at.slice(0, 10) < m ? t.executed_at.slice(0, 10) : m),
    trades[0].executed_at.slice(0, 10),
  );
  const from = new Date(Date.parse(`${firstTrade}T00:00:00Z`) - 10 * 86_400_000)
    .toISOString()
    .slice(0, 10);

  const supabase = await createClient();
  const { data: seriesRows } = await supabase
    .from("benchmark_series")
    .select("id, code")
    .in("code", ["USDTRY", "XAUTRY"]);
  const codeById = new Map(
    ((seriesRows ?? []) as Array<{ id: string; code: string }>).map((s) => [s.id, s.code]),
  );
  const usdtry: Array<[string, number]> = [];
  const gold: Array<[string, number]> = [];
  if (codeById.size > 0) {
    type Row = { series_id: string; as_of: string; value: number };
    const pts = await readAll<Row>(
      (f, t) =>
        supabase
          .from("benchmark_points")
          .select("series_id, as_of, value", { count: "exact" })
          .in("series_id", Array.from(codeById.keys()))
          .gte("as_of", from)
          .order("as_of", { ascending: true })
          .order("series_id", { ascending: true })
          .range(f, t),
      (r) => `${r.series_id}|${r.as_of}`,
    );
    for (const p of pts) {
      const code = codeById.get(p.series_id);
      if (code === "USDTRY") usdtry.push([p.as_of, Number(p.value)]);
      else if (code === "XAUTRY") gold.push([p.as_of, Number(p.value)]);
    }
  }

  const { data: cpiRows } = await supabase
    .from("cpi_monthly")
    .select("period_month, index_value")
    .eq("series_code", "CPI_TR_GENERAL");
  const cpi: Record<string, number> = {};
  for (const c of (cpiRows ?? []) as Array<{ period_month: string; index_value: number }>) {
    cpi[c.period_month] = Number(c.index_value);
  }

  const report = computeXirrReport({
    trades,
    groups,
    mvByPortfolio,
    today: istanbulToday(),
    usdtry,
    goldTryPerGram: gold,
    cpi,
  });
  report.unmatchedSells = findUnmatchedSells(
    trades,
    (id) => realizedBySell[id] != null,
    (assetId) => assetMap.get(assetId)?.symbol ?? "?",
    (pid) => portfolioName.get(pid) ?? "Portföy",
  );
  return report;
}

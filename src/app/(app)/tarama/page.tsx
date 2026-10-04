import { getXK100Symbols } from "@/app/(app)/_lib/bist-index-members";
import { computeSectorMomentum, getScreeningData } from "@/app/(app)/_lib/stock-screening";
import { listAssets, listHoldings, listTrades } from "@/app/(app)/_lib/wealth-actions";
import { medianFeeRate } from "@/lib/finance/position-size";

import { TaramaClient } from "./tarama-client";

export const dynamic = "force-dynamic";

export default async function TaramaPage() {
  const [symbols, assets, holdings, trades] = await Promise.all([
    getXK100Symbols(),
    listAssets(),
    listHoldings(),
    listTrades(),
  ]);
  const rows = await getScreeningData(symbols);

  // Lot hesabı varsayılanları: hisse portföyü değeri (taramadaki fiyatla, yoksa
  // maliyet) ve kullanıcının kendi hisse işlemlerindeki efektif komisyon.
  const assetById = new Map(assets.map((a) => [a.id, a]));
  const priceBySymbol = new Map(rows.map((r) => [r.symbol, r.price]));
  let equityMv = 0;
  for (const h of holdings) {
    const a = assetById.get(h.asset_id);
    if (!a || a.asset_class !== "equity_tr") continue;
    const px = priceBySymbol.get(a.symbol);
    equityMv += px != null ? Number(h.quantity) * px : Number(h.cost_basis_try);
  }
  const observedFeeRate = medianFeeRate(
    trades
      .filter((t) => assetById.get(t.asset_id)?.asset_class === "equity_tr")
      .map((t) => ({ quantity: Number(t.quantity), price: Number(t.price), fees: Number(t.fees) })),
  );

  const assetMap = Object.fromEntries(assets.map((a) => [a.symbol, a]));
  const withSector = rows.map((r) => ({
    ...r,
    name: assetMap[r.symbol]?.name ?? r.symbol,
    sector: assetMap[r.symbol]?.sector ?? null,
    external_url: assetMap[r.symbol]?.external_url ?? null,
  }));

  // Sector momentum ranking
  const sectorMom = await computeSectorMomentum(withSector);
  const enriched = withSector.map((r) => {
    const info = r.sector ? sectorMom.get(r.sector) : undefined;
    return {
      ...r,
      sector_rank: info?.sector_rank ?? null,
      sector_momentum_score: info?.sector_momentum_score ?? null,
    };
  });

  return (
    <TaramaClient
      rows={enriched}
      symbolCount={symbols.length}
      defaultEquity={equityMv > 0 ? equityMv : null}
      observedFeeRate={observedFeeRate}
    />
  );
}

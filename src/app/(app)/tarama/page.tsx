import { getXK100Symbols } from "@/app/(app)/_lib/bist-index-members";
import { computeSectorMomentum, getScreeningData } from "@/app/(app)/_lib/stock-screening";
import { listAssets } from "@/app/(app)/_lib/wealth-actions";

import { TaramaClient } from "./tarama-client";

export const dynamic = "force-dynamic";

export default async function TaramaPage() {
  const [symbols, assets] = await Promise.all([getXK100Symbols(), listAssets()]);
  const rows = await getScreeningData(symbols);

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

  return <TaramaClient rows={enriched} symbolCount={symbols.length} />;
}

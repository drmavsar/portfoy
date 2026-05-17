import { getXK100Symbols } from "@/app/(app)/_lib/bist-index-members";
import { getScreeningData } from "@/app/(app)/_lib/stock-screening";
import { listAssets } from "@/app/(app)/_lib/wealth-actions";

import { TaramaClient } from "./tarama-client";

export const dynamic = "force-dynamic";

export default async function TaramaPage() {
  const [symbols, assets] = await Promise.all([getXK100Symbols(), listAssets()]);
  // symbols ya CSV'den ya da statik BIST 100 fallback'tan gelir (~100 sembol)
  const rows = await getScreeningData(symbols);

  // Asset master'dan name/sector/external_url eşleştir
  const assetMap = Object.fromEntries(assets.map((a) => [a.symbol, a]));
  const enriched = rows.map((r) => ({
    ...r,
    name: assetMap[r.symbol]?.name ?? r.symbol,
    sector: assetMap[r.symbol]?.sector ?? null,
    external_url: assetMap[r.symbol]?.external_url ?? null,
  }));

  return <TaramaClient rows={enriched} symbolCount={symbols.length} />;
}

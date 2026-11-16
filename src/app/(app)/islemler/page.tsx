import { isSupabaseConfigured } from "@/app/(app)/ayarlar/actions";
import { getAssetRates } from "@/app/(app)/_lib/asset-rates";
import {
  listAssets,
  listPortfolios,
  listRealizedBySellTrade,
  listTrades,
} from "@/app/(app)/_lib/wealth-actions";
import {
  listBeneficiariesLite,
  listCustodyLocations,
} from "@/app/(app)/hesaplar/actions";

import { IslemlerClient } from "./islemler-client";

export const dynamic = "force-dynamic";

export default async function IslemlerPage() {
  const [configured, trades, assets, portfolios, custodies, beneficiaries, realizedBySell, rates] =
    await Promise.all([
      isSupabaseConfigured(),
      listTrades(),
      listAssets(),
      listPortfolios(),
      listCustodyLocations(),
      listBeneficiariesLite(),
      listRealizedBySellTrade(),
      getAssetRates().catch(() => ({}) as Record<string, number>),
    ]);

  return (
    <IslemlerClient
      initialTrades={trades}
      realizedBySell={realizedBySell}
      assets={assets}
      portfolios={portfolios}
      custodies={custodies}
      beneficiaries={beneficiaries}
      configured={configured}
      usdTry={typeof rates.USD === "number" && rates.USD > 0 ? rates.USD : null}
    />
  );
}

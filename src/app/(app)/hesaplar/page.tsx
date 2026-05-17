import { isSupabaseConfigured } from "@/app/(app)/ayarlar/actions";
import { getAssetRates } from "@/app/(app)/_lib/asset-rates";
import {
  listAssets,
  listHoldings,
  listPortfolios,
  listTrades,
} from "@/app/(app)/_lib/wealth-actions";
import { getStockPrices } from "@/app/(app)/_lib/stock-prices";

import { HesaplarClient } from "./hesaplar-client";
import {
  listAccounts,
  listBeneficiariesLite,
  listCustodyLocations,
} from "./actions";

export const dynamic = "force-dynamic";

export default async function HesaplarPage() {
  const [configured, accounts, custodies, beneficiaries, fxRates, holdings, assets, portfolios, trades] = await Promise.all([
    isSupabaseConfigured(),
    listAccounts(),
    listCustodyLocations(),
    listBeneficiariesLite(),
    getAssetRates(),
    listHoldings(),
    listAssets(),
    listPortfolios(),
    listTrades(),
  ]);

  // BIST sembolleri için anlık fiyat
  const bistSymbols = assets
    .filter((a) => a.asset_class === "equity_tr")
    .map((a) => a.symbol);
  const stockQuotes = await getStockPrices(bistSymbols);

  return (
    <HesaplarClient
      accounts={accounts}
      custodies={custodies}
      beneficiaries={beneficiaries}
      supabaseConfigured={configured}
      fxRates={fxRates}
      holdings={holdings}
      assets={assets}
      portfolios={portfolios}
      trades={trades}
      stockQuotes={stockQuotes}
    />
  );
}

import { isSupabaseConfigured } from "@/app/(app)/ayarlar/actions";
import { getAssetRates } from "@/app/(app)/_lib/asset-rates";
import {
  listAssets,
  listHoldings,
  listPortfolios,
  listTrades,
} from "@/app/(app)/_lib/wealth-actions";
import { getEquityQuotes } from "@/app/(app)/_lib/stock-prices";
import { isEquity } from "@/app/(app)/_lib/us-equity";

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

  // Elde tutulan hisseler için anlık fiyat (BIST + ABD; ABD canlı kurla TL)
  const heldAssetIds = new Set(holdings.map((h) => h.asset_id));
  const stockQuotes = await getEquityQuotes(
    assets.filter((a) => heldAssetIds.has(a.id) && isEquity(a.asset_class)),
  );

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

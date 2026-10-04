import { isSupabaseConfigured } from "@/app/(app)/ayarlar/actions";
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
  const [configured, trades, assets, portfolios, custodies, beneficiaries, realizedBySell] =
    await Promise.all([
      isSupabaseConfigured(),
      listTrades(),
      listAssets(),
      listPortfolios(),
      listCustodyLocations(),
      listBeneficiariesLite(),
      listRealizedBySellTrade(),
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
    />
  );
}

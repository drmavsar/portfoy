import { isSupabaseConfigured } from "@/app/(app)/ayarlar/actions";
import {
  listAssets,
  listPortfolios,
  listTrades,
} from "@/app/(app)/_lib/wealth-actions";
import {
  listBeneficiariesLite,
  listCustodyLocations,
} from "@/app/(app)/hesaplar/actions";

import { IslemlerClient } from "./islemler-client";

export const dynamic = "force-dynamic";

export default async function IslemlerPage() {
  const [configured, trades, assets, portfolios, custodies, beneficiaries] = await Promise.all([
    isSupabaseConfigured(),
    listTrades(),
    listAssets(),
    listPortfolios(),
    listCustodyLocations(),
    listBeneficiariesLite(),
  ]);

  return (
    <IslemlerClient
      initialTrades={trades}
      assets={assets}
      portfolios={portfolios}
      custodies={custodies}
      beneficiaries={beneficiaries}
      configured={configured}
    />
  );
}

import { isSupabaseConfigured } from "@/app/(app)/ayarlar/actions";
import { getTcmbRates } from "@/app/(app)/_lib/fx-rates";

import { HesaplarClient } from "./hesaplar-client";
import {
  listAccounts,
  listBeneficiariesLite,
  listCustodyLocations,
} from "./actions";

export const dynamic = "force-dynamic";

export default async function HesaplarPage() {
  const [configured, accounts, custodies, beneficiaries, fxRates] = await Promise.all([
    isSupabaseConfigured(),
    listAccounts(),
    listCustodyLocations(),
    listBeneficiariesLite(),
    getTcmbRates(),
  ]);

  return (
    <HesaplarClient
      accounts={accounts}
      custodies={custodies}
      beneficiaries={beneficiaries}
      supabaseConfigured={configured}
      fxRates={fxRates}
    />
  );
}

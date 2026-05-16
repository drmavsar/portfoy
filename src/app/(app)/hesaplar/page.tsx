import { isSupabaseConfigured } from "@/app/(app)/ayarlar/actions";

import { HesaplarClient } from "./hesaplar-client";
import {
  listAccounts,
  listBeneficiariesLite,
  listCustodyLocations,
} from "./actions";

export const dynamic = "force-dynamic";

export default async function HesaplarPage() {
  const [configured, accounts, custodies, beneficiaries] = await Promise.all([
    isSupabaseConfigured(),
    listAccounts(),
    listCustodyLocations(),
    listBeneficiariesLite(),
  ]);

  return (
    <HesaplarClient
      accounts={accounts}
      custodies={custodies}
      beneficiaries={beneficiaries}
      supabaseConfigured={configured}
    />
  );
}

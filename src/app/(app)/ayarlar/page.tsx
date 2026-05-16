import {
  listAccounts,
  listBeneficiariesLite,
  listCustodyLocations,
} from "@/app/(app)/hesaplar/actions";

import { AyarlarClient } from "./ayarlar-client";
import {
  isSupabaseConfigured,
  listBeneficiaries,
  listCategories,
  listClassificationRules,
} from "./actions";

export const dynamic = "force-dynamic";

export default async function AyarlarPage() {
  const [
    configured,
    beneficiaries,
    categories,
    rules,
    accounts,
    custodies,
    beneficiariesLite,
  ] = await Promise.all([
    isSupabaseConfigured(),
    listBeneficiaries(),
    listCategories(),
    listClassificationRules(),
    listAccounts(),
    listCustodyLocations(),
    listBeneficiariesLite(),
  ]);

  return (
    <AyarlarClient
      initialBeneficiaries={beneficiaries}
      initialCategories={categories}
      initialRules={rules}
      accounts={accounts}
      custodies={custodies}
      beneficiariesLite={beneficiariesLite}
      supabaseConfigured={configured}
    />
  );
}

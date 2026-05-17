import { isSupabaseConfigured, listCategories } from "@/app/(app)/ayarlar/actions";
import { listAccounts, listBeneficiariesLite } from "@/app/(app)/hesaplar/actions";

import { EkstreClient } from "./ekstre-client";

export const dynamic = "force-dynamic";

export default async function EkstrePage() {
  const [configured, accounts, beneficiaries, categories] = await Promise.all([
    isSupabaseConfigured(),
    listAccounts(),
    listBeneficiariesLite(),
    listCategories(),
  ]);

  return (
    <EkstreClient
      configured={configured}
      accounts={accounts}
      beneficiaries={beneficiaries}
      categories={categories}
    />
  );
}

import {
  listAccounts,
  listBeneficiariesLite,
  listCustodyLocations,
} from "@/app/(app)/hesaplar/actions";
import { listFunds, listFundCategories } from "@/app/(app)/_lib/tefas/funds-actions";
import { listTrackedFunds } from "@/app/(app)/_lib/tefas/tracked-funds-actions";
import { listTaxRules } from "@/app/(app)/_lib/tefas/tax-rules-actions";
import { listFundsHealth, listIngestLog } from "@/app/(app)/_lib/tefas/monitoring-actions";

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
    tefasFunds,
    tefasCategories,
    tefasTracked,
    tefasTaxRules,
    tefasIngestLog,
    tefasFundsHealth,
  ] = await Promise.all([
    isSupabaseConfigured(),
    listBeneficiaries(),
    listCategories(),
    listClassificationRules(),
    listAccounts(),
    listCustodyLocations(),
    listBeneficiariesLite(),
    listFunds(),
    listFundCategories(),
    listTrackedFunds(),
    listTaxRules({ activeOnly: true }),
    listIngestLog(10),
    listFundsHealth(),
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
      tefasFunds={tefasFunds}
      tefasCategories={tefasCategories}
      tefasTracked={tefasTracked}
      tefasTaxRules={tefasTaxRules}
      tefasIngestLog={tefasIngestLog}
      tefasFundsHealth={tefasFundsHealth}
    />
  );
}

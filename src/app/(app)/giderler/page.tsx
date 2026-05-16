import { CashflowClient } from "@/app/(app)/_components/cashflow-client";
import { listTransactions } from "@/app/(app)/_lib/cashflow-actions";
import {
  isSupabaseConfigured,
  listCategories,
} from "@/app/(app)/ayarlar/actions";
import {
  listAccounts,
  listBeneficiariesLite,
  listCustodyLocations,
} from "@/app/(app)/hesaplar/actions";

export const dynamic = "force-dynamic";

export default async function GiderlerPage() {
  const [configured, rows, accounts, custodies, beneficiaries, categories] = await Promise.all([
    isSupabaseConfigured(),
    listTransactions("outflow"),
    listAccounts(),
    listCustodyLocations(),
    listBeneficiariesLite(),
    listCategories(),
  ]);

  return (
    <CashflowClient
      direction="outflow"
      title="Giderler"
      subtitle="Harcama kayıtları + ekstre yükleme."
      initialRows={rows}
      accounts={accounts}
      custodies={custodies}
      beneficiaries={beneficiaries}
      categories={categories}
      configured={configured}
    />
  );
}

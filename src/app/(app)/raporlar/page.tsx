import { listBeneficiariesLite } from "@/app/(app)/hesaplar/actions";
import { listCategories } from "@/app/(app)/ayarlar/actions";
import { listTransactionsForReports } from "@/app/(app)/_lib/reports-actions";
import { Icon } from "@/components/ui/icon";

import { RaporlarClient } from "./raporlar-client";

export const dynamic = "force-dynamic";

export default async function RaporlarPage() {
  // Son 24 ay veri çekiyoruz — client tarafı tarih aralığı filtresi uygular
  const [txns, categories, beneficiaries] = await Promise.all([
    listTransactionsForReports(24),
    listCategories(),
    listBeneficiariesLite(),
  ]);

  if (txns.length === 0) {
    return (
      <div>
        <div className="page-head">
          <div>
            <div className="page-title">Raporlar</div>
            <div className="page-sub">Nakit akış · kategori dağılımı · kişi analizi.</div>
          </div>
        </div>
        <div className="empty">
          <div className="title">
            <Icon name="report" size={20} /> Henüz veri yok
          </div>
          <div style={{ marginTop: 8, lineHeight: 1.6 }}>
            Gelir veya gider kaydı eklenince burada raporlar canlıya çıkacak.
          </div>
        </div>
      </div>
    );
  }

  return (
    <RaporlarClient
      txns={txns}
      categories={categories}
      beneficiaries={beneficiaries}
    />
  );
}

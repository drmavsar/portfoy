import { listBeneficiariesLite } from "@/app/(app)/hesaplar/actions";
import { listCategories } from "@/app/(app)/ayarlar/actions";
import {
  listRealizedForReport,
  listTransactionsForReports,
} from "@/app/(app)/_lib/reports-actions";
import { listRealValueSeries } from "@/app/(app)/_lib/wealth-snapshots-actions";
import { benchmarkComparison } from "@/app/(app)/_lib/benchmark-compare-actions";
import { Icon } from "@/components/ui/icon";

import { RaporlarClient } from "./raporlar-client";

export const dynamic = "force-dynamic";

export default async function RaporlarPage() {
  // Son 24 ay veri çekiyoruz — client tarafı tarih aralığı filtresi uygular
  const [txns, realized, categories, beneficiaries, realValue, benchmark] = await Promise.all([
    listTransactionsForReports(24),
    listRealizedForReport(24),
    listCategories(),
    listBeneficiariesLite(),
    listRealValueSeries(),
    benchmarkComparison(),
  ]);

  if (txns.length === 0 && realized.length === 0 && realValue.length === 0 && !benchmark) {
    return (
      <div>
        <div className="page-head">
          <div>
            <div className="page-title">Raporlar</div>
            <div className="page-sub">Nakit akış · yatırım performansı · kategori dağılımı.</div>
          </div>
        </div>
        <div className="empty">
          <div className="title">
            <Icon name="report" size={20} /> Henüz veri yok
          </div>
          <div style={{ marginTop: 8, lineHeight: 1.6 }}>
            Gelir/gider kaydı veya işlem eklenince burada raporlar canlıya çıkacak.
          </div>
        </div>
      </div>
    );
  }

  return (
    <RaporlarClient
      txns={txns}
      realized={realized}
      categories={categories}
      beneficiaries={beneficiaries}
      realValue={realValue}
      benchmark={benchmark}
    />
  );
}

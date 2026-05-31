import { listFunds, listFundCategories } from "@/app/(app)/_lib/tefas/funds-actions";
import { getDefaultPersona } from "@/app/(app)/_lib/tefas/persona-actions";
import { listLatestFundScores } from "@/app/(app)/_lib/tefas/scoring-actions";
import { listLatestFundReturns } from "@/app/(app)/_lib/tefas/returns-actions";
import Link from "next/link";
import { Icon } from "@/components/ui/icon";

import { KomiteClient } from "./komite-client";

export const dynamic = "force-dynamic";

export default async function FonKomitesiPage() {
  const [funds, categories, persona] = await Promise.all([
    listFunds({ isActive: true }),
    listFundCategories(),
    getDefaultPersona(),
  ]);

  if (!persona) {
    return (
      <div>
        <div className="page-head">
          <div>
            <div className="page-title">Fon Komitesi</div>
            <div className="page-sub">Persona seed eksik.</div>
          </div>
        </div>
      </div>
    );
  }

  const [scores, returns] = await Promise.all([
    listLatestFundScores(persona.id),
    listLatestFundReturns(),
  ]);

  if (scores.length === 0) {
    return (
      <div>
        <div className="page-head">
          <div>
            <div className="page-title">Fon Komitesi</div>
            <div className="page-sub">{persona.name} persona</div>
          </div>
        </div>
        <div className="empty">
          <div className="title">
            <Icon name="calendar" size={20} /> Skor cache&apos;i boş
          </div>
          <div style={{ marginTop: 8, lineHeight: 1.6 }}>
            Cron tetiklemesi henüz yapılmadı. Dashboard&apos;dan
            (<code>/fonlar</code>) cron rehberini takip edip skorları
            doldurun, sonra bu sayfa dolacak.
          </div>
        </div>
      </div>
    );
  }

  return (
    <div>
      <div className="page-head">
        <div>
          <div className="page-title">Fon Komitesi</div>
          <div className="page-sub">
            Kategori bazlı sıralı Mehmet Score · <strong>{persona.name}</strong> persona ·{" "}
            {scores.length} fon skorlu
          </div>
        </div>
        <div style={{ display: "flex", gap: 8 }}>
          <Link
            href="/fonlar/komite/arsiv"
            className="chip"
            style={{ textDecoration: "none", whiteSpace: "nowrap" }}
          >
            <Icon name="calendar" size={12} /> Karar Arşivi
          </Link>
        </div>
      </div>

      <KomiteClient
        funds={funds}
        categories={categories}
        scores={scores}
        returns={returns}
        persona={persona}
      />
    </div>
  );
}

import { listFunds, listFundCategories } from "@/app/(app)/_lib/tefas/funds-actions";
import { getDefaultPersona } from "@/app/(app)/_lib/tefas/persona-actions";
import { listLatestFundScores } from "@/app/(app)/_lib/tefas/scoring-actions";
import { listLatestFundReturns } from "@/app/(app)/_lib/tefas/returns-actions";
import { getLatestCpi } from "@/app/(app)/_lib/tefas/cpi-actions";
import {
  getLastIngestSummary,
  getLastReturnsRefreshSummary,
  getLastScoresRefreshSummary,
  listScoresHealth,
} from "@/app/(app)/_lib/tefas/monitoring-actions";
import { Icon } from "@/components/ui/icon";
import Link from "next/link";

import { SystemHealthStrip } from "./_components/system-health-strip";
import { KpiCards } from "./_components/kpi-cards";
import { TopMehmetTable } from "./_components/top-mehmet-table";
import { TodayMoversCard } from "./_components/today-movers-card";
import { CategoryDistribution } from "./_components/category-distribution";
import { WarningsCard } from "./_components/warnings-card";
import { DashboardEmptyState } from "./_components/dashboard-empty-state";

export const dynamic = "force-dynamic";

export default async function FonlarDashboardPage() {
  const [
    funds,
    categories,
    persona,
    lastNavIngest,
    lastReturnsRefresh,
    lastScoresRefresh,
    latestCpi,
  ] = await Promise.all([
    listFunds({ isActive: true }),
    listFundCategories(),
    getDefaultPersona(),
    getLastIngestSummary(),
    getLastReturnsRefreshSummary(),
    getLastScoresRefreshSummary(),
    getLatestCpi(),
  ]);

  // Persona zorunlu — sistem default Mehmet yoksa kurulum eksik
  if (!persona) {
    return (
      <div>
        <div className="page-head">
          <div>
            <div className="page-title">TEFAS Fonları</div>
            <div className="page-sub">Persona bulunamadı.</div>
          </div>
        </div>
        <div className="empty">
          <div className="title">
            <Icon name="bell" size={20} /> Sistem persona seed&apos;i eksik
          </div>
          <div style={{ marginTop: 8, lineHeight: 1.6 }}>
            <code>user_personas</code> tablosunda Mehmet Default kaydı yok.
            Migration <code>0033_user_personas.sql</code> tekrar uygulanmalı.
          </div>
        </div>
      </div>
    );
  }

  const [scores, returns, scoresHealth] = await Promise.all([
    listLatestFundScores(persona.id),
    listLatestFundReturns(),
    listScoresHealth(persona.id),
  ]);

  return (
    <div>
      <div className="page-head">
        <div>
          <div className="page-title">TEFAS Fonları</div>
          <div className="page-sub">
            {funds.length} fon · {categories.length} kategori ·{" "}
            <strong>{persona.name}</strong> persona aktif
          </div>
        </div>
        <div style={{ display: "flex", gap: 8 }}>
          <Link
            href="/fonlar/komite"
            className="chip"
            style={{ textDecoration: "none", whiteSpace: "nowrap" }}
          >
            <Icon name="report" size={12} /> Fon Komitesi
          </Link>
          <Link
            href="/fonlar/kalibrasyon"
            className="chip"
            style={{ textDecoration: "none", whiteSpace: "nowrap" }}
          >
            <Icon name="settings" size={12} /> Kalibrasyon
          </Link>
          <Link
            href="/fonlar/karsilastir"
            className="chip"
            style={{ textDecoration: "none", whiteSpace: "nowrap" }}
          >
            <Icon name="screener" size={12} /> Karşılaştır
          </Link>
        </div>
      </div>

      <div style={{ display: "grid", gap: 16 }}>
        <SystemHealthStrip
          lastNavIngest={lastNavIngest.log}
          lastReturnsRefresh={lastReturnsRefresh.log}
          lastScoresRefresh={lastScoresRefresh.log}
          latestCpi={latestCpi}
          returns={returns}
        />

        {scores.length === 0 ? (
          <DashboardEmptyState
            navIngestLog={lastNavIngest.log}
            returnsLog={lastReturnsRefresh.log}
            scoresLog={lastScoresRefresh.log}
          />
        ) : (
          <>
            <KpiCards scores={scores} funds={funds} />

            <div
              style={{
                display: "grid",
                gridTemplateColumns: "minmax(0, 2fr) minmax(0, 1fr)",
                gap: 16,
              }}
            >
              <TopMehmetTable scores={scores} funds={funds} categories={categories} />
              <TodayMoversCard returns={returns} funds={funds} />
            </div>

            <CategoryDistribution funds={funds} categories={categories} scores={scores} />

            <WarningsCard scoresHealth={scoresHealth} scores={scores} />
          </>
        )}
      </div>
    </div>
  );
}

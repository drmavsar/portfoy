import { notFound } from "next/navigation";
import Link from "next/link";

import { getFund, listFundCategories } from "@/app/(app)/_lib/tefas/funds-actions";
import { getDefaultPersona } from "@/app/(app)/_lib/tefas/persona-actions";
import { getLatestFundReturns } from "@/app/(app)/_lib/tefas/returns-actions";
import {
  getLatestFundScores,
  getScoreHistoryCompare,
  listLatestFundScores,
  type HistorySnapshot,
} from "@/app/(app)/_lib/tefas/scoring-actions";
import { generateKomiteNotu } from "@/app/(app)/_lib/tefas/komite-notu";
import {
  explainFundScore,
  type CategoryPeerInput,
} from "@/app/(app)/_lib/tefas/score-explain";
import { listLatestFundPrices } from "@/app/(app)/_lib/tefas/prices-actions";
import { createClient } from "@/lib/supabase/server";
import { isSupabaseConfigured } from "@/app/(app)/ayarlar/actions";
import type { FundTaxKind } from "@/app/(app)/_lib/tefas/types";

import { FundHeader } from "./_components/fund-header";
import { ScoreSummaryCards } from "./_components/score-summary-cards";
import { NavChart } from "./_components/nav-chart";
import { ReturnsTable } from "./_components/returns-table";
import { ScoreComponentsTable } from "./_components/score-components-table";
import { RiskMetricsCard } from "./_components/risk-metrics-card";
import { KomiteNotu } from "./_components/komite-notu";
import { ScoreBreakdownCard } from "./_components/score-breakdown-card";
import { StrengthsWeaknessesCard } from "./_components/strengths-weaknesses-card";
import { CategoryRankCard } from "./_components/category-rank-card";
import { TaxImpactCard } from "./_components/tax-impact-card";
import { SimilarFundsCard } from "./_components/similar-funds-card";
import { ScoreHistoryCard } from "./_components/score-history-card";
import { CommitteeFlagsCard } from "./_components/committee-flags-card";

export const dynamic = "force-dynamic";

interface PageProps {
  params: Promise<{ code: string }>;
}

async function fetchNavSeries(code: string, lookbackDays: number = 365 * 5) {
  if (!(await isSupabaseConfigured())) return [];
  const supabase = await createClient();
  const cutoff = new Date();
  cutoff.setDate(cutoff.getDate() - lookbackDays);
  const { data } = await supabase
    .from("fund_prices")
    .select("as_of, nav")
    .eq("fund_code", code)
    .gte("as_of", cutoff.toISOString().slice(0, 10))
    .order("as_of", { ascending: true })
    .range(0, 9999); // 5Y = ~1250 satır, default 1000 limitini bypass et
  return (data ?? []) as Array<{ as_of: string; nav: number }>;
}

/** Kategori peer'larını çek — score-explain similar_funds + category_rank için. */
async function fetchCategoryPeers(
  categoryId: number | null,
  personaId: string,
): Promise<CategoryPeerInput[]> {
  if (categoryId == null) return [];
  if (!(await isSupabaseConfigured())) return [];
  const supabase = await createClient();
  // 1) Aynı kategorideki fon kodlarını çek
  const { data: catFundsData } = await supabase
    .from("funds")
    .select("code, name")
    .eq("category_id", categoryId)
    .eq("is_active", true);
  const catFunds = (catFundsData ?? []) as Array<{ code: string; name: string | null }>;
  if (catFunds.length === 0) return [];
  const codes = catFunds.map((f) => f.code);
  // 2) Skorları çek
  const scores = await listLatestFundScores(personaId, codes);
  const scoreByCode = new Map(scores.map((s) => [s.fund_code, s.mehmet_score]));
  return catFunds.map((f) => ({
    fund_code: f.code,
    name: f.name,
    mehmet_score: scoreByCode.get(f.code) ?? null,
  }));
}

export default async function FonDetayPage({ params }: PageProps) {
  const { code: rawCode } = await params;
  const code = decodeURIComponent(rawCode).toUpperCase();
  const [fund, categories, persona] = await Promise.all([
    getFund(code),
    listFundCategories(),
    getDefaultPersona(),
  ]);
  if (!fund) notFound();

  const cat = categories.find((c) => c.id === fund.category_id);

  const [returns, scores, navSeries, peers, history] = await Promise.all([
    getLatestFundReturns(code),
    persona ? getLatestFundScores(code, persona.id) : Promise.resolve(null),
    fetchNavSeries(code),
    persona ? fetchCategoryPeers(fund.category_id, persona.id) : Promise.resolve([]),
    persona
      ? getScoreHistoryCompare(code, persona.id, [7, 30, 90])
      : Promise.resolve<Record<number, HistorySnapshot | null>>({}),
  ]);
  // ensure linter sees unused import is intentional (latest fund_prices unused here)
  void listLatestFundPrices;

  // Explanation engine — 7 yeni kartı besler
  const explanation =
    scores && persona
      ? explainFundScore({
          fund: {
            code: fund.code,
            name: fund.name,
            category_id: fund.category_id,
            investment_universe: fund.investment_universe,
            is_equity_intensive: fund.is_equity_intensive,
          },
          category: cat ?? null,
          scores,
          returns,
          persona,
          category_peers: peers,
          history: {
            d7: history[7] ? { score: history[7]!.mehmet_score } : null,
            d30: history[30] ? { score: history[30]!.mehmet_score } : null,
            d90: history[90] ? { score: history[90]!.mehmet_score } : null,
          },
        })
      : null;

  const komiteNotu =
    persona && returns && scores
      ? generateKomiteNotu({
          fund_code: code,
          gross_3y_cagr: returns.gross_3y_cagr,
          net_1y: returns.net_1y,
          real_1y: returns.real_1y,
          vs_category_3y: returns.vs_category_3y,
          vs_category_net_3y: returns.vs_category_net_3y,
          applied_tax_kind: returns.applied_tax_kind as FundTaxKind | null,
          applied_tax_rate: returns.applied_tax_rate,
          tax_confidence: returns.tax_confidence,
          volatility_1y: scores.volatility_1y,
          max_drawdown_3y: scores.max_drawdown_3y,
          normalized_risk_score: scores.normalized_risk_score,
          bist_dependency_score: scores.bist_dependency_score,
          gold_dependency_score: scores.gold_dependency_score,
          investment_universe: fund.investment_universe,
          persona: { max_volatility_pct: persona.max_volatility_pct },
        })
      : null;

  return (
    <div>
      <div className="page-head" style={{ display: "flex", alignItems: "flex-end", gap: 16 }}>
        <div style={{ flex: 1, minWidth: 0 }}>
          <Link
            href="/fonlar"
            style={{ fontSize: 12, color: "var(--muted)", textDecoration: "none" }}
          >
            ← TEFAS Fonları
          </Link>
          <FundHeader fund={fund} category={cat} />
        </div>
        {fund.is_active && (
          <Link href={`/fonlar/${code}/trade`} className="btn btn-prim">
            İşlem Kaydet
          </Link>
        )}
      </div>

      <div style={{ display: "grid", gap: 16 }}>
        <ScoreSummaryCards scores={scores} returns={returns} persona={persona} />

        <NavChart series={navSeries} fundCode={code} />

        {/* Sprint-5.5 PR-3: 7 yeni açıklanabilirlik kartı */}
        {explanation && (
          <>
            <div
              style={{
                display: "grid",
                gridTemplateColumns: "minmax(0, 1.4fr) minmax(0, 1fr) minmax(0, 1fr)",
                gap: 16,
              }}
            >
              <ScoreBreakdownCard
                totalScore={explanation.total_score}
                componentsUsed={explanation.components_used}
                breakdown={explanation.breakdown}
              />
              <CategoryRankCard
                categoryName={cat?.name_tr ?? null}
                rank={explanation.category_rank}
              />
              <ScoreHistoryCard history={explanation.history_compare} />
            </div>

            <div
              style={{
                display: "grid",
                gridTemplateColumns: "minmax(0, 1.4fr) minmax(0, 1fr) minmax(0, 1fr)",
                gap: 16,
              }}
            >
              <StrengthsWeaknessesCard
                strengths={explanation.strengths}
                weaknesses={explanation.weaknesses}
              />
              <TaxImpactCard taxImpact={explanation.tax_impact} />
              <SimilarFundsCard similar={explanation.similar_funds} />
            </div>

            <CommitteeFlagsCard flags={explanation.data_quality_flags} />
          </>
        )}

        <div
          style={{
            display: "grid",
            gridTemplateColumns: "minmax(0, 1fr) minmax(0, 1fr)",
            gap: 16,
          }}
        >
          <ScoreComponentsTable scores={scores} persona={persona} />
          <RiskMetricsCard scores={scores} />
        </div>

        <ReturnsTable returns={returns} />

        {komiteNotu && <KomiteNotu output={komiteNotu} />}
      </div>
    </div>
  );
}

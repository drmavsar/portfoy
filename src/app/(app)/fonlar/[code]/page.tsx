import { notFound } from "next/navigation";
import Link from "next/link";

import { getFund, listFundCategories } from "@/app/(app)/_lib/tefas/funds-actions";
import { getDefaultPersona } from "@/app/(app)/_lib/tefas/persona-actions";
import { getLatestFundReturns } from "@/app/(app)/_lib/tefas/returns-actions";
import { getLatestFundScores } from "@/app/(app)/_lib/tefas/scoring-actions";
import { generateKomiteNotu } from "@/app/(app)/_lib/tefas/komite-notu";
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
    .order("as_of", { ascending: true });
  return (data ?? []) as Array<{ as_of: string; nav: number }>;
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

  const [returns, scores, navSeries] = await Promise.all([
    getLatestFundReturns(code),
    persona ? getLatestFundScores(code, persona.id) : Promise.resolve(null),
    fetchNavSeries(code),
  ]);

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
      <div className="page-head">
        <div>
          <Link
            href="/fonlar"
            style={{ fontSize: 12, color: "var(--muted)", textDecoration: "none" }}
          >
            ← TEFAS Fonları
          </Link>
          <FundHeader fund={fund} category={cat} />
        </div>
      </div>

      <div style={{ display: "grid", gap: 16 }}>
        <ScoreSummaryCards scores={scores} returns={returns} persona={persona} />

        <NavChart series={navSeries} fundCode={code} />

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

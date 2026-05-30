import Link from "next/link";

import { listFunds, listFundCategories } from "@/app/(app)/_lib/tefas/funds-actions";
import { getDefaultPersona } from "@/app/(app)/_lib/tefas/persona-actions";
import { listLatestFundReturns } from "@/app/(app)/_lib/tefas/returns-actions";
import { listLatestFundScores } from "@/app/(app)/_lib/tefas/scoring-actions";
import { generateKomiteNotu } from "@/app/(app)/_lib/tefas/komite-notu";
import { createClient } from "@/lib/supabase/server";
import { isSupabaseConfigured } from "@/app/(app)/ayarlar/actions";
import type {
  Fund,
  FundReturns,
  FundScores,
  FundTaxKind,
} from "@/app/(app)/_lib/tefas/types";

import { KarsilastirClient } from "./karsilastir-client";

export const dynamic = "force-dynamic";

const MAX_FUNDS = 5;

async function fetchNavSeries(
  codes: string[],
): Promise<Record<string, Array<{ as_of: string; nav: number }>>> {
  if (!(await isSupabaseConfigured()) || codes.length === 0) return {};
  const supabase = await createClient();
  const cutoff = new Date();
  cutoff.setFullYear(cutoff.getFullYear() - 5);
  const cutoffIso = cutoff.toISOString().slice(0, 10);
  const { data } = await supabase
    .from("fund_prices")
    .select("fund_code, as_of, nav")
    .in("fund_code", codes)
    .gte("as_of", cutoffIso)
    .order("fund_code")
    .order("as_of")
    .range(0, 49999); // 5 fon × ~1250 satır, default 1000 limitini bypass et
  const out: Record<string, Array<{ as_of: string; nav: number }>> = {};
  for (const row of (data ?? []) as Array<{
    fund_code: string;
    as_of: string;
    nav: number;
  }>) {
    const list = out[row.fund_code] ?? [];
    list.push({ as_of: row.as_of, nav: Number(row.nav) });
    out[row.fund_code] = list;
  }
  return out;
}

interface PageProps {
  searchParams: Promise<{ codes?: string }>;
}

export default async function KarsilastirPage({ searchParams }: PageProps) {
  const sp = await searchParams;
  const codes = (sp.codes ?? "")
    .split(",")
    .map((c) => c.trim().toUpperCase())
    .filter(Boolean)
    .slice(0, MAX_FUNDS);

  const [allFunds, categories, persona] = await Promise.all([
    listFunds({ isActive: true }),
    listFundCategories(),
    getDefaultPersona(),
  ]);

  const selectedFunds = codes
    .map((c) => allFunds.find((f) => f.code === c))
    .filter((f): f is Fund => f !== undefined);

  let returnsByCode: Map<string, FundReturns> = new Map();
  let scoresByCode: Map<string, FundScores> = new Map();
  let navByCode: Record<string, Array<{ as_of: string; nav: number }>> = {};
  const komiteByCode: Map<string, string> = new Map();

  if (selectedFunds.length > 0 && persona) {
    const selectedCodes = selectedFunds.map((f) => f.code);
    const [rets, scrs, navs] = await Promise.all([
      listLatestFundReturns(selectedCodes),
      listLatestFundScores(persona.id, selectedCodes),
      fetchNavSeries(selectedCodes),
    ]);
    returnsByCode = new Map(rets.map((r) => [r.fund_code, r]));
    scoresByCode = new Map(scrs.map((s) => [s.fund_code, s]));
    navByCode = navs;

    for (const fund of selectedFunds) {
      const ret = returnsByCode.get(fund.code);
      const score = scoresByCode.get(fund.code);
      if (!ret || !score) continue;
      const note = generateKomiteNotu({
        fund_code: fund.code,
        gross_3y_cagr: ret.gross_3y_cagr,
        net_1y: ret.net_1y,
        real_1y: ret.real_1y,
        vs_category_3y: ret.vs_category_3y,
        vs_category_net_3y: ret.vs_category_net_3y,
        applied_tax_kind: ret.applied_tax_kind as FundTaxKind | null,
        applied_tax_rate: ret.applied_tax_rate,
        tax_confidence: ret.tax_confidence,
        volatility_1y: score.volatility_1y,
        max_drawdown_3y: score.max_drawdown_3y,
        normalized_risk_score: score.normalized_risk_score,
        bist_dependency_score: score.bist_dependency_score,
        gold_dependency_score: score.gold_dependency_score,
        investment_universe: fund.investment_universe,
        persona: { max_volatility_pct: persona.max_volatility_pct },
      });
      komiteByCode.set(fund.code, note.text);
    }
  }

  // Returns'tan applied_tax_kind çıkarımı için map
  const returnsForClient = selectedFunds
    .map((f) => returnsByCode.get(f.code))
    .filter((r): r is FundReturns => r !== undefined);
  const scoresForClient = selectedFunds
    .map((f) => scoresByCode.get(f.code))
    .filter((s): s is FundScores => s !== undefined);

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
          <div className="page-title">Fon Karşılaştırma</div>
          <div className="page-sub">
            {selectedFunds.length} / {MAX_FUNDS} fon seçili · URL state ile paylaşılabilir
          </div>
        </div>
      </div>

      <KarsilastirClient
        allFunds={allFunds}
        categories={categories}
        selectedFunds={selectedFunds}
        returns={returnsForClient}
        scores={scoresForClient}
        navByCode={navByCode}
        komiteByCode={Object.fromEntries(komiteByCode)}
        maxFunds={MAX_FUNDS}
      />
    </div>
  );
}

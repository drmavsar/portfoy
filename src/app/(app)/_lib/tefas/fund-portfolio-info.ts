"use server";

// Sprint-6 PR-F — Fon detay sayfasında kullanılan kompakt portfolio bilgisi.
// computeAllocation tüm hesabı yapmak gerekmez; bu fon için minimum bilgi:
//   - Portföyde var mı? (qty, market_value, weight)
//   - Top 10'da mı? (target_weight)
//   - Action önerisi (band kuralı)

import { isSupabaseConfigured } from "@/app/(app)/ayarlar/actions";
import { createClient } from "@/lib/supabase/server";

import {
  ALLOCATION_DEFAULTS,
  type AllocationAction,
} from "./allocation-types";
import { getDefaultPersona } from "./persona-actions";
import { listLatestFundScores } from "./scoring-actions";
import { selectTopN, type ScoreCandidate } from "./allocation-engine";

export interface FundPortfolioInfo {
  fund_code: string;
  in_portfolio: boolean;
  in_target: boolean;
  current_quantity: number;
  current_market_value_try: number;
  current_weight_pct: number;
  total_market_value_try: number;
  target_weight_pct: number;
  delta_pct: number;
  action: AllocationAction;
  /** Sırası Top N içinde (1-based) — in_target=false ise null. */
  target_rank: number | null;
}

export async function getFundPortfolioInfo(
  fundCode: string,
): Promise<FundPortfolioInfo | null> {
  if (!(await isSupabaseConfigured())) return null;
  const code = fundCode.trim().toUpperCase();
  if (!code) return null;

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return null;

  const persona = await getDefaultPersona();
  if (!persona) return null;

  // Default portfolio
  const { data: defaultPortRaw } = await supabase
    .from("portfolios")
    .select("id")
    .eq("is_default", true)
    .is("archived_at", null)
    .maybeSingle();
  const portfolioId = (defaultPortRaw as { id: string } | null)?.id ?? null;
  if (!portfolioId) return null;

  // Top N for persona
  const scores = await listLatestFundScores(persona.id);
  const topScores = selectTopN(
    scores.map(
      (s): ScoreCandidate => ({
        fund_code: s.fund_code,
        mehmet_score: s.mehmet_score,
        components_used: s.components_used,
      }),
    ),
    ALLOCATION_DEFAULTS.TOP_N,
  );
  const targetRankIdx = topScores.findIndex((s) => s.fund_code === code);
  const inTarget = targetRankIdx >= 0;
  const targetWeight = inTarget ? 1 / topScores.length : 0;

  // Asset ID for this fund
  const { data: assetRow } = await supabase
    .from("assets")
    .select("id")
    .eq("symbol", code)
    .eq("asset_class", "fund")
    .maybeSingle();
  const assetId = (assetRow as { id: string } | null)?.id ?? null;

  // Tüm portföy holdings (toplam MV için)
  const { data: holdingsRaw } = await supabase
    .from("v_holdings_wac")
    .select("asset_id, quantity, wac_try")
    .eq("portfolio_id", portfolioId);
  const holdings = (holdingsRaw ?? []) as Array<{
    asset_id: string;
    quantity: number;
    wac_try: number;
  }>;

  // Latest NAV map (yalnızca fon olanları kullanacağız; küçük tablo)
  const { data: navRaw } = await supabase
    .from("v_fund_prices_latest")
    .select("fund_code, nav");
  const navByCode = new Map(
    ((navRaw ?? []) as Array<{ fund_code: string; nav: number }>).map((r) => [
      r.fund_code,
      Number(r.nav),
    ]),
  );

  // Asset_id → symbol/asset_class map
  const assetIds = holdings.map((h) => h.asset_id);
  let assetMap = new Map<string, { symbol: string; asset_class: string }>();
  if (assetIds.length > 0) {
    const { data: assetsRaw } = await supabase
      .from("assets")
      .select("id, symbol, asset_class")
      .in("id", assetIds);
    assetMap = new Map(
      ((assetsRaw ?? []) as Array<{ id: string; symbol: string; asset_class: string }>).map(
        (a) => [a.id, { symbol: a.symbol, asset_class: a.asset_class }],
      ),
    );
  }

  let thisQty = 0;
  let thisMv = 0;
  let totalMv = 0;
  for (const h of holdings) {
    const meta = assetMap.get(h.asset_id);
    const isFund = meta?.asset_class === "fund";
    const fc = isFund ? meta?.symbol ?? null : null;
    const nav = fc ? navByCode.get(fc) ?? null : null;
    const price = nav ?? Number(h.wac_try);
    const mv = Number(h.quantity) * price;
    totalMv += mv;
    if (h.asset_id === assetId) {
      thisQty = Number(h.quantity);
      thisMv = mv;
    }
  }

  const currentWeight = totalMv > 0 ? thisMv / totalMv : 0;
  const deltaPct = currentWeight - targetWeight;
  const band = ALLOCATION_DEFAULTS.REBALANCE_BAND_PCT;
  let action: AllocationAction;
  if (!inTarget && currentWeight > 0) {
    action = "AZALTMA";
  } else if (Math.abs(deltaPct) <= band) {
    action = inTarget ? "TUT" : "TUT";
  } else if (deltaPct > band) {
    action = "AZALTMA";
  } else {
    action = "EKLEME";
  }

  return {
    fund_code: code,
    in_portfolio: thisQty > 0,
    in_target: inTarget,
    current_quantity: thisQty,
    current_market_value_try: round2(thisMv),
    current_weight_pct: currentWeight,
    total_market_value_try: round2(totalMv),
    target_weight_pct: targetWeight,
    delta_pct: deltaPct,
    action,
    target_rank: inTarget ? targetRankIdx + 1 : null,
  };
}

function round2(n: number): number {
  return Math.round(n * 100) / 100;
}

"use server";

import { isSupabaseConfigured } from "@/app/(app)/ayarlar/actions";
import { createClient, createServiceClient } from "@/lib/supabase/server";
import { computeFundRiskMetrics } from "./risk-logic";
import { type NavPoint } from "./returns-logic";
import {
  bistDependencyScore,
  computeMehmetScore,
  diversificationScore,
  goldDependencyScore,
  inflationProtectionScore,
  longTermPerformanceScore,
  riskScoreFromVolatility,
  taxAdvantageScore,
} from "./scoring-logic";
import type {
  Fund,
  FundReturns,
  FundScores,
  UserPersona,
} from "./types";

export async function listLatestFundScores(
  personaId: string,
  codes?: string[],
): Promise<FundScores[]> {
  if (!(await isSupabaseConfigured())) return [];
  const supabase = await createClient();
  let q = supabase
    .from("v_fund_scores_latest")
    .select("*")
    .eq("persona_id", personaId);
  if (codes && codes.length > 0) q = q.in("fund_code", codes);
  const { data, error } = await q;
  if (error) {
    console.error("listLatestFundScores error", error);
    return [];
  }
  return (data ?? []) as FundScores[];
}

export async function getLatestFundScores(
  fundCode: string,
  personaId: string,
): Promise<FundScores | null> {
  const rows = await listLatestFundScores(personaId, [fundCode]);
  return rows[0] ?? null;
}

/**
 * Tüm aktif fonlar × tüm aktif persona'lar için skor cache'i hesapla + UPSERT.
 *
 * Akış:
 *  1. funds + tüm persona'lar çek
 *  2. fund_returns_cache son satırları (her fon için tek)
 *  3. fund_prices son 4 yıl NAV (vol + MaxDD için)
 *  4. Her fon için risk metrikleri (computeFundRiskMetrics)
 *  5. Her fon × persona için bileşen skorları + Mehmet Score
 *  6. fund_scores_cache'a batch UPSERT (onConflict: fund_code,as_of,persona_id)
 *
 * Service role gerekir.
 */
export async function refreshAllFundScores(): Promise<{
  ok: boolean;
  processed_funds: number;
  processed_personas: number;
  upserted: number;
  skipped: string[];
  duration_ms: number;
  error?: string;
}> {
  const start = Date.now();
  if (!(await isSupabaseConfigured())) {
    return {
      ok: false,
      processed_funds: 0,
      processed_personas: 0,
      upserted: 0,
      skipped: [],
      duration_ms: 0,
      error: "Supabase yapılandırılmamış.",
    };
  }
  const supabase = await createServiceClient();

  // 1) Funds + personas
  const { data: fundsData, error: fundsErr } = await supabase
    .from("funds")
    .select("code, investment_universe")
    .eq("is_active", true);
  if (fundsErr) {
    return {
      ok: false,
      processed_funds: 0,
      processed_personas: 0,
      upserted: 0,
      skipped: [],
      duration_ms: Date.now() - start,
      error: fundsErr.message,
    };
  }
  type FundLite = Pick<Fund, "code" | "investment_universe">;
  const funds = (fundsData ?? []) as FundLite[];
  if (funds.length === 0) {
    return {
      ok: true,
      processed_funds: 0,
      processed_personas: 0,
      upserted: 0,
      skipped: [],
      duration_ms: Date.now() - start,
    };
  }

  const { data: personasData } = await supabase.from("user_personas").select("*");
  const personas = (personasData ?? []) as UserPersona[];
  if (personas.length === 0) {
    return {
      ok: true,
      processed_funds: funds.length,
      processed_personas: 0,
      upserted: 0,
      skipped: [],
      duration_ms: Date.now() - start,
    };
  }

  // 2) Latest returns (her fon için son satır — v_fund_returns_latest)
  const { data: returnsData } = await supabase
    .from("v_fund_returns_latest")
    .select(
      "fund_code, as_of, gross_1y, real_1y, vs_category_3y, vs_category_net_3y, applied_tax_kind",
    );
  const returnsByCode = new Map<string, FundReturns>();
  for (const r of (returnsData ?? []) as FundReturns[]) {
    returnsByCode.set(r.fund_code, r);
  }

  // 3) NAV serileri (son 4 yıl) — MaxDD 3Y için yeterli
  const cutoff = new Date();
  cutoff.setFullYear(cutoff.getFullYear() - 4);
  const cutoffIso = cutoff.toISOString().slice(0, 10);
  const { data: pricesData } = await supabase
    .from("fund_prices")
    .select("fund_code, as_of, nav")
    .gte("as_of", cutoffIso)
    .order("fund_code", { ascending: true })
    .order("as_of", { ascending: true });
  const seriesByFund = new Map<string, NavPoint[]>();
  for (const row of (pricesData ?? []) as Array<{ fund_code: string; as_of: string; nav: number }>) {
    const list = seriesByFund.get(row.fund_code) ?? [];
    list.push({ as_of: row.as_of, nav: Number(row.nav) });
    seriesByFund.set(row.fund_code, list);
  }

  // 4-5) Hesap + payload
  const skipped: string[] = [];
  const payload: Array<Record<string, unknown>> = [];
  const computedAt = new Date().toISOString();

  for (const fund of funds) {
    const ret = returnsByCode.get(fund.code);
    if (!ret) {
      skipped.push(fund.code);
      continue;
    }
    const series = seriesByFund.get(fund.code) ?? [];
    const risk = computeFundRiskMetrics(series, ret.gross_1y);

    const inflation = inflationProtectionScore(ret.real_1y);
    const taxAdv = taxAdvantageScore(ret.applied_tax_kind);
    const longTerm = longTermPerformanceScore(ret.vs_category_net_3y, ret.vs_category_3y);
    const diversification = diversificationScore(fund.investment_universe);
    const bistDep = bistDependencyScore(null, fund.investment_universe);
    const goldDep = goldDependencyScore(null, fund.investment_universe);

    for (const persona of personas) {
      const maxVol = persona.max_volatility_pct ?? 0.40;
      const normalizedRisk = riskScoreFromVolatility(risk.volatility_1y, maxVol);

      const mehmet = computeMehmetScore(
        {
          inflation_protection_score: inflation,
          tax_advantage_score: taxAdv,
          normalized_risk_score: normalizedRisk,
          long_term_performance_score: longTerm,
          diversification_score: diversification,
        },
        persona,
      );

      payload.push({
        fund_code: fund.code,
        as_of: ret.as_of,
        persona_id: persona.id,
        volatility_1y: risk.volatility_1y,
        max_drawdown_3y: risk.max_drawdown_3y,
        downside_volatility_1y: risk.downside_volatility_1y,
        sharpe_like_1y: risk.return_risk_ratio_1y,
        bist_correlation_1y: null,
        gold_correlation_1y: null,
        bist_source: "default_from_universe",
        gold_source: "default_from_universe",
        inflation_protection_score: inflation,
        tax_advantage_score: taxAdv,
        normalized_risk_score: normalizedRisk,
        long_term_performance_score: longTerm,
        diversification_score: diversification,
        bist_dependency_score: bistDep,
        gold_dependency_score: goldDep,
        mehmet_score: mehmet.score,
        components_used: mehmet.components_used,
        computed_at: computedAt,
        warnings: mehmet.warnings,
      });
    }
  }

  if (payload.length === 0) {
    return {
      ok: true,
      processed_funds: funds.length,
      processed_personas: personas.length,
      upserted: 0,
      skipped,
      duration_ms: Date.now() - start,
    };
  }

  const { error: upsertErr, count } = await supabase
    .from("fund_scores_cache")
    .upsert(payload as never, {
      onConflict: "fund_code,as_of,persona_id",
      count: "exact",
    });
  if (upsertErr) {
    return {
      ok: false,
      processed_funds: funds.length,
      processed_personas: personas.length,
      upserted: 0,
      skipped,
      duration_ms: Date.now() - start,
      error: upsertErr.message,
    };
  }

  return {
    ok: true,
    processed_funds: funds.length,
    processed_personas: personas.length,
    upserted: count ?? payload.length,
    skipped,
    duration_ms: Date.now() - start,
  };
}

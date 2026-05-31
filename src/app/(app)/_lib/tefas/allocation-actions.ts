"use server";

import { isSupabaseConfigured } from "@/app/(app)/ayarlar/actions";
import { createClient } from "@/lib/supabase/server";

import { getDefaultPersona, getPersona } from "./persona-actions";
import { listLatestFundScores } from "./scoring-actions";
import { listFundCategories } from "./funds-actions";
import { getLatestFundReturns } from "./returns-actions";
import { resolveTaxRulePure, toISODate } from "./tax-rules-logic";
import { explainFundScore, type ExplainFundScoreInput } from "./score-explain";
import {
  ALLOCATION_DEFAULTS,
  BACKTEST_CHAMPION,
  type AllocationCurrentPosition,
  type AllocationFlag,
  type AllocationResult,
  type AllocationTargetFund,
  type KomiteSnippet,
  type SellDryRunResult,
} from "./allocation-types";
import {
  buildAllocationDiff,
  buildAllocationSummary,
  buildCurrentPositions,
  checkForbiddenWords,
  computeTargetWeights,
  selectTopN,
  type RawHolding,
  type ScoreCandidate,
} from "./allocation-engine";
import { simulateSell } from "./sell-dry-run";
import type { RawBuyLot, TaxResolverFn } from "./fifo-processor";
import type {
  Fund,
  FundCategory,
  FundScores,
  FundTaxKind,
  FundTaxRule,
  UserPersona,
} from "./types";

export interface ComputeAllocationInput {
  persona_id?: string; // omit → default persona
  portfolio_id?: string; // omit → user's default portfolio
}

export type ComputeAllocationResult =
  | { ok: true; allocation: AllocationResult }
  | { ok: false; error: string };

export async function computeAllocation(
  input: ComputeAllocationInput = {},
): Promise<ComputeAllocationResult> {
  if (!(await isSupabaseConfigured())) {
    return { ok: false, error: "Supabase yapılandırılmamış." };
  }

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { ok: false, error: "Giriş yapmadın." };

  // 1. Persona + Portfolio
  const persona = input.persona_id
    ? await getPersona(input.persona_id)
    : await getDefaultPersona();
  if (!persona) return { ok: false, error: "Persona bulunamadı." };

  let portfolioId = input.portfolio_id ?? null;
  if (!portfolioId) {
    const { data: defaultPortRaw } = await supabase
      .from("portfolios")
      .select("id")
      .eq("is_default", true)
      .is("archived_at", null)
      .maybeSingle();
    portfolioId = (defaultPortRaw as { id: string } | null)?.id ?? null;
  }
  if (!portfolioId) return { ok: false, error: "Default portföy bulunamadı." };

  // 2. Latest scores → Top N seç
  const scores = await listLatestFundScores(persona.id);
  const topScores = selectTopN(
    scores.map(toScoreCandidate),
    ALLOCATION_DEFAULTS.TOP_N,
    ALLOCATION_DEFAULTS.MIN_COMPONENTS_USED,
  );

  if (topScores.length === 0) {
    return {
      ok: false,
      error: "Skor altyapısı henüz Top N için yeterli değil (components_used < 3 veya skor yok).",
    };
  }

  const topCodes = topScores.map((s) => s.fund_code);
  const weights = computeTargetWeights(topScores);

  // 3. Target fund metadata + komite snippet
  const [funds, categories, returnsByCode, scoresByCode, taxRules] = await Promise.all([
    fetchFundsByCodes(supabase, topCodes),
    listFundCategories(),
    fetchReturnsByCodes(topCodes),
    fetchScoresByCodes(scores, topCodes),
    fetchTaxRules(supabase),
  ]);

  const categoryById = new Map(categories.map((c) => [c.id, c]));
  const fundByCode = new Map(funds.map((f) => [f.code, f]));

  const target: AllocationTargetFund[] = [];
  const flags: AllocationFlag[] = [];

  for (const sc of topScores) {
    const fund = fundByCode.get(sc.fund_code);
    if (!fund) {
      flags.push({
        level: "warn",
        message: `Top N içinde fon metadata eksik: ${sc.fund_code}`,
      });
      continue;
    }
    const category = categoryById.get(fund.category_id) ?? null;
    const fundScores = scoresByCode.get(fund.code);
    const returns = returnsByCode.get(fund.code) ?? null;

    const komite =
      fundScores != null
        ? buildKomiteSnippet({
            fund,
            category,
            scores: fundScores,
            returns,
            persona,
          })
        : null;

    target.push({
      fund_code: fund.code,
      fund_name: fund.name,
      category_name: category?.name_tr ?? null,
      mehmet_score: sc.mehmet_score ?? 0,
      components_used: sc.components_used ?? 0,
      target_weight_pct: weights.get(fund.code) ?? 0,
      komite,
    });
  }

  // 4. Current holdings
  const { data: holdingsRaw } = await supabase
    .from("v_holdings_wac")
    .select("portfolio_id, asset_id, quantity, wac_try, cost_basis_try")
    .eq("portfolio_id", portfolioId);
  const holdings = (holdingsRaw ?? []) as Array<{
    portfolio_id: string;
    asset_id: string;
    quantity: number;
    wac_try: number;
    cost_basis_try: number;
  }>;

  const assetIds = holdings.map((h) => h.asset_id);
  const [assetsByIdMap, latestNavByCode] = await Promise.all([
    fetchAssetsByIds(supabase, assetIds),
    fetchLatestNavByCodes(supabase),
  ]);

  const rawHoldings: RawHolding[] = holdings.map((h) => {
    const asset = assetsByIdMap.get(h.asset_id);
    const isFund = asset?.asset_class === "fund";
    const fundCode = isFund ? asset?.symbol ?? null : null;
    const nav = fundCode ? latestNavByCode.get(fundCode) ?? null : null;
    return {
      asset_id: h.asset_id,
      asset_class: asset?.asset_class ?? "unknown",
      symbol: asset?.symbol ?? "?",
      fund_code: fundCode,
      fund_name: fundCode ? fundByCode.get(fundCode)?.name ?? null : null,
      quantity: Number(h.quantity),
      wac_try: Number(h.wac_try),
      cost_basis_try: Number(h.cost_basis_try),
      last_price_try: nav,
    };
  });

  const { positions: current, totalMarketValueTry } = buildCurrentPositions(rawHoldings);

  // 5. Diff
  const diffs = buildAllocationDiff({
    targets: target,
    current,
    totalMarketValueTry,
    rebalanceBandPct: ALLOCATION_DEFAULTS.REBALANCE_BAND_PCT,
  });

  // 6. Sell dry-runs (AZALTMA action'ları için)
  const sellDryRuns: SellDryRunResult[] = [];
  const sellDiffs = diffs.filter((d) => d.action === "AZALTMA" && d.in_portfolio);

  for (const sd of sellDiffs) {
    const dryRun = await runSellDryRunForFund({
      supabase,
      userId: user.id,
      portfolioId,
      fundCode: sd.fund_code,
      sellAmountTry: sd.delta_try,
      currentPosition: current.find((c) => c.fund_code === sd.fund_code),
      fund: fundByCode.get(sd.fund_code) ?? null,
      categoryDefaultKindResolver: (fund) =>
        categoryById.get(fund.category_id)?.default_tax_kind ?? "BELIRSIZ",
      taxRules,
    });
    if (dryRun) sellDryRuns.push(dryRun);
  }

  // 7. Summary
  const summary = buildAllocationSummary({
    diffs,
    sellDryRuns,
    totalMarketValueTry,
    topN: ALLOCATION_DEFAULTS.TOP_N,
    rebalanceBandPct: ALLOCATION_DEFAULTS.REBALANCE_BAND_PCT,
  });

  // 8. Data quality flags
  if (target.length < ALLOCATION_DEFAULTS.TOP_N) {
    flags.push({
      level: "warn",
      message: `Top ${ALLOCATION_DEFAULTS.TOP_N} için yeterli skor yok (${target.length} fon önerildi).`,
    });
  }
  if (totalMarketValueTry === 0 && current.length === 0) {
    flags.push({ level: "info", message: "Portföy boş — tüm öneriler EKLEME yönündedir." });
  }
  for (const dr of sellDryRuns) {
    if (dr.tax_confidence === "NONE" || dr.tax_confidence === "LOW") {
      flags.push({
        level: "warn",
        message: `${dr.fund_code} stopaj güvenilirliği düşük (${dr.tax_confidence}) — kural eşleşmesi belirsiz.`,
      });
    }
  }
  for (const c of current) {
    if (c.asset_class !== "fund") {
      flags.push({
        level: "info",
        message: `${c.symbol} (${c.asset_class}) allocation kapsamı dışı tutuldu.`,
      });
    }
  }

  // 9. Forbidden words guard
  const allStrings: Array<string | null> = [];
  for (const t of target) {
    if (t.komite) {
      allStrings.push(t.komite.strength_first);
      allStrings.push(t.komite.tax_impact_label);
      allStrings.push(t.komite.category_band_label);
      for (const f of t.komite.data_quality_flags) allStrings.push(f.label);
    }
    allStrings.push(t.fund_name);
  }
  const forbiddenSafe = checkForbiddenWords(allStrings);
  if (!forbiddenSafe) {
    flags.push({
      level: "critical",
      message: "Komite snippet'larında yasak kelime tespit edildi. UI render edilmemeli.",
    });
  }

  return {
    ok: true,
    allocation: {
      persona_id: persona.id,
      portfolio_id: portfolioId,
      generated_at: new Date().toISOString(),
      target,
      current,
      diff: diffs,
      sell_dry_runs: sellDryRuns,
      summary,
      data_quality_flags: flags,
      forbidden_words_safe: forbiddenSafe,
      backtest_champion: BACKTEST_CHAMPION,
    },
  };
}

// ──────────────────────────────────────────────────────────────────────────
// Helpers (server-only)
// ──────────────────────────────────────────────────────────────────────────

function toScoreCandidate(s: FundScores): ScoreCandidate {
  return {
    fund_code: s.fund_code,
    mehmet_score: s.mehmet_score,
    components_used: s.components_used,
  };
}

type DbClient = Awaited<ReturnType<typeof createClient>>;

async function fetchFundsByCodes(
  supabase: DbClient,
  codes: string[],
): Promise<Fund[]> {
  if (codes.length === 0) return [];
  const { data } = await supabase
    .from("funds")
    .select("*")
    .in("code", codes);
  return (data ?? []) as unknown as Fund[];
}

async function fetchAssetsByIds(
  supabase: DbClient,
  ids: string[],
): Promise<Map<string, { id: string; symbol: string; asset_class: string }>> {
  if (ids.length === 0) return new Map();
  const { data } = await supabase
    .from("assets")
    .select("id, symbol, asset_class")
    .in("id", ids);
  const rows = (data ?? []) as Array<{ id: string; symbol: string; asset_class: string }>;
  return new Map(rows.map((r) => [r.id, r]));
}

async function fetchLatestNavByCodes(
  supabase: DbClient,
): Promise<Map<string, number>> {
  // v_fund_prices_latest tüm fonlar için son NAV — küçük tablo (~155 satır)
  const { data } = await supabase
    .from("v_fund_prices_latest")
    .select("fund_code, nav");
  const rows = (data ?? []) as Array<{ fund_code: string; nav: number }>;
  return new Map(rows.map((r) => [r.fund_code, Number(r.nav)]));
}

async function fetchTaxRules(supabase: DbClient): Promise<FundTaxRule[]> {
  const { data } = await supabase
    .from("fund_tax_rules")
    .select("*")
    .eq("is_active", true);
  return (data ?? []) as FundTaxRule[];
}

async function fetchReturnsByCodes(
  codes: string[],
): Promise<Map<string, NonNullable<Awaited<ReturnType<typeof getLatestFundReturns>>>>> {
  const results = await Promise.all(codes.map((c) => getLatestFundReturns(c)));
  const map = new Map<string, NonNullable<Awaited<ReturnType<typeof getLatestFundReturns>>>>();
  results.forEach((r, i) => {
    if (r) map.set(codes[i], r);
  });
  return map;
}

function fetchScoresByCodes(
  allScores: FundScores[],
  codes: string[],
): Map<string, FundScores> {
  const set = new Set(codes);
  return new Map(allScores.filter((s) => set.has(s.fund_code)).map((s) => [s.fund_code, s]));
}

// ──────────────────────────────────────────────────────────────────────────
// Komite snippet builder
// ──────────────────────────────────────────────────────────────────────────

interface BuildKomiteInput {
  fund: Fund;
  category: FundCategory | null;
  scores: FundScores;
  returns: NonNullable<Awaited<ReturnType<typeof getLatestFundReturns>>> | null;
  persona: UserPersona;
}

function buildKomiteSnippet(input: BuildKomiteInput): KomiteSnippet {
  const explainInput: ExplainFundScoreInput = {
    fund: {
      code: input.fund.code,
      name: input.fund.name,
      category_id: input.fund.category_id,
      investment_universe: input.fund.investment_universe,
      is_equity_intensive: input.fund.is_equity_intensive,
    },
    category: input.category,
    scores: input.scores,
    returns: input.returns,
    persona: input.persona,
    category_peers: [], // PR-F'de zenginleştirilecek; v1 boş → category_rank null
    history: undefined,
  };
  const exp = explainFundScore(explainInput);

  return {
    strength_first: exp.strengths[0] ?? null,
    category_rank: exp.category_rank?.rank ?? null,
    category_total: exp.category_rank?.total ?? null,
    category_medal: exp.category_rank?.medal ?? null,
    category_band_label: exp.category_rank?.band_label ?? null,
    tax_impact_label: exp.tax_impact?.label ?? null,
    data_quality_flags: exp.data_quality_flags.map((f) => ({
      severity: f.severity as "info" | "warn" | "critical",
      label: f.label,
    })),
  };
}

// ──────────────────────────────────────────────────────────────────────────
// Sell dry-run wrapper (server IO + pure simulator)
// ──────────────────────────────────────────────────────────────────────────

interface RunSellDryRunInput {
  supabase: DbClient;
  userId: string;
  portfolioId: string;
  fundCode: string;
  sellAmountTry: number;
  currentPosition: AllocationCurrentPosition | undefined;
  fund: Fund | null;
  categoryDefaultKindResolver: (fund: Fund) => FundTaxKind;
  taxRules: FundTaxRule[];
}

async function runSellDryRunForFund(
  input: RunSellDryRunInput,
): Promise<SellDryRunResult | null> {
  if (!input.currentPosition || !input.fund) return null;
  const cur = input.currentPosition;
  const unitPrice = cur.last_price_try ?? cur.wac_try;
  if (!(unitPrice > 0)) return null;

  const sellQty = Math.min(cur.quantity, input.sellAmountTry / unitPrice);
  if (!(sellQty > 0)) return null;

  // Açık buy lot'lar
  const { data: buyRaw } = await input.supabase
    .from("trades")
    .select("id, executed_at, quantity, price, currency, fx_rate_to_try, fees")
    .eq("user_id", input.userId)
    .eq("portfolio_id", input.portfolioId)
    .eq("asset_id", cur.asset_id)
    .eq("side", "buy")
    .order("executed_at", { ascending: true });
  const buyRows = (buyRaw ?? []) as Array<{
    id: string;
    executed_at: string;
    quantity: number;
    price: number;
    currency: string;
    fx_rate_to_try: number | null;
    fees: number;
  }>;

  // prior consumed per buy
  const buyIds = buyRows.map((b) => b.id);
  const priorByBuy = new Map<string, number>();
  if (buyIds.length > 0) {
    const { data: priorRaw } = await input.supabase
      .from("realized_lots")
      .select("buy_trade_id, quantity")
      .in("buy_trade_id", buyIds);
    for (const row of (priorRaw ?? []) as Array<{
      buy_trade_id: string | null;
      quantity: number;
    }>) {
      if (!row.buy_trade_id) continue;
      priorByBuy.set(row.buy_trade_id, (priorByBuy.get(row.buy_trade_id) ?? 0) + Number(row.quantity));
    }
  }

  const buys: RawBuyLot[] = buyRows.map((b) => ({
    trade_id: b.id,
    executed_at: b.executed_at,
    quantity: Number(b.quantity),
    price: Number(b.price),
    fees: Number(b.fees) || 0,
    currency: b.currency,
    fx_rate_to_try: b.fx_rate_to_try == null ? null : Number(b.fx_rate_to_try),
    prior_consumed_qty: priorByBuy.get(b.id) ?? 0,
  }));

  if (buys.length === 0) return null;

  const fundForTax = input.fund;
  const defaultKind = input.categoryDefaultKindResolver(fundForTax);

  const resolveTax: TaxResolverFn = (acquired, sold) => {
    const r = resolveTaxRulePure(
      fundForTax,
      input.taxRules,
      defaultKind,
      toISODate(acquired),
      toISODate(sold),
    );
    return {
      kind: r.kind,
      rate: r.effective_rate,
      confidence: r.confidence,
      source: r.source,
      rule_id: r.rule?.id ?? null,
    };
  };

  const result = simulateSell({
    fund_code: input.fundCode,
    sell_quantity: sellQty,
    estimated_unit_price_try: unitPrice,
    estimated_executed_at: new Date().toISOString(),
    buys,
    resolveTax,
  });
  return result.ok ? result.dry_run : null;
}

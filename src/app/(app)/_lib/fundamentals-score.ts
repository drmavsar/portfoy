/* ============================================================
   Temel analiz — saf hesaplama çekirdeği.
   "use server" YOK: hem testler hem client buradan import eder.
   Veri kaynağı: /api/bist-fundamentals (borsapy).
   ============================================================ */

/** Margin of Safety hesabında kullanılan "adil F/K" kabulü (basit gösterge). */
export const FAIR_PE = 15;

export type Verdict = "good" | "warn" | "bad" | "na";

export interface StatementTable {
  periods: string[];
  rows: { item: string; values: (number | null)[] }[];
}

export interface AnnualPoint {
  period: string;
  value: number;
}

/** /api/bist-fundamentals endpoint'inin döndürdüğü ham yapı. */
export interface FundamentalsRaw {
  ok: true;
  symbol: string;
  fetched_at: number;
  warnings: string[];
  profile: {
    sector: string | null;
    industry: string | null;
    website: string | null;
    summary: string | null;
  };
  quote: {
    price: number | null;
    previous_close: number | null;
    change_pct: number | null;
    currency: string;
    market_cap: number | null;
    shares_outstanding: number | null;
    fifty_two_week_high: number | null;
    fifty_two_week_low: number | null;
    fifty_day_average: number | null;
    two_hundred_day_average: number | null;
  };
  valuation: {
    pe: number | null;
    pb: number | null;
    ev_ebitda: number | null;
    net_debt: number | null;
    free_float: number | null;
    foreign_ratio: number | null;
  };
  dividend: {
    yield: number | null;
    annual_rate: number | null;
    ex_date: string | null;
    history: { date: string; amount: number | null }[];
  };
  analyst: {
    recommendation?: string | null;
    target_price?: number | null;
    upside_potential?: number | null;
    low?: number | null;
    high?: number | null;
    mean?: number | null;
    median?: number | null;
    num_analysts?: number | null;
    summary?: {
      strongBuy: number | null;
      buy: number | null;
      hold: number | null;
      sell: number | null;
      strongSell: number | null;
    };
  };
  financials: {
    derived: {
      revenue_ttm?: number | null;
      net_income_ttm?: number | null;
      gross_profit_ttm?: number | null;
      operating_cf_ttm?: number | null;
      capex_ttm?: number | null;
      equity?: number | null;
      total_assets?: number | null;
      current_assets?: number | null;
      current_liabilities?: number | null;
      revenue_annual?: AnnualPoint[];
      net_income_annual?: AnnualPoint[];
    };
    income_annual?: StatementTable | null;
    balance_annual?: StatementTable | null;
    cashflow_annual?: StatementTable | null;
  };
}

export interface DerivedMetrics {
  eps_ttm: number | null;
  fair_value: number | null;
  margin_of_safety_pct: number | null;
  roe: number | null;
  net_margin: number | null;
  gross_margin: number | null;
  revenue_growth: number | null;
  earnings_growth: number | null;
  free_cash_flow_ttm: number | null;
  current_ratio: number | null;
  price_position_52w: number | null;
}

export interface ScorePillar {
  key: string;
  label: string;
  verdict: Verdict;
  weight: number;
  detail: string;
}

export interface FundamentalScore {
  score: number | null;
  label: "Güçlü" | "Orta" | "Zayıf" | "—";
  pillars: ScorePillar[];
}

export interface Fundamentals {
  raw: FundamentalsRaw;
  derived: DerivedMetrics;
  score: FundamentalScore;
}

function isNum(v: unknown): v is number {
  return typeof v === "number" && Number.isFinite(v);
}

/** İlk geçerli (sonlu) sayıyı döndür, yoksa null. */
function firstNum(...vals: Array<number | null | undefined>): number | null {
  for (const v of vals) if (isNum(v)) return v;
  return null;
}

/**
 * Bir oranı eşik bantlarına göre değerlendir. `higherIsBetter` true ise
 * büyük değer iyidir; false ise küçük değer iyidir.
 */
export function bandVerdict(
  value: number | null | undefined,
  good: number,
  warn: number,
  higherIsBetter: boolean,
): Verdict {
  if (!isNum(value)) return "na";
  if (higherIsBetter) {
    if (value >= good) return "good";
    if (value >= warn) return "warn";
    return "bad";
  }
  if (value <= good) return "good";
  if (value <= warn) return "warn";
  return "bad";
}

/** Ham veriden türetilmiş oran ve metrikleri hesapla. */
export function deriveMetrics(raw: FundamentalsRaw): DerivedMetrics {
  const { quote, valuation, financials } = raw;
  const d = financials?.derived ?? {};
  const price = quote?.price ?? null;

  // EPS — fiyat / F/K (birim bağımsız, en güvenilir). F/K pozitif olmalı.
  const pe = valuation?.pe ?? null;
  const eps_ttm = isNum(price) && isNum(pe) && pe > 0 ? price / pe : null;

  // Margin of Safety — FAIR_PE × EPS adil değeri ile bugünkü fiyat kıyası.
  const fair_value = isNum(eps_ttm) && eps_ttm > 0 ? FAIR_PE * eps_ttm : null;
  const margin_of_safety_pct =
    isNum(fair_value) && isNum(price) && price > 0
      ? ((fair_value - price) / price) * 100
      : null;

  // ROE / marjlar — aynı tablodan, birimler sadeleşir.
  const roe =
    isNum(d.net_income_ttm) && isNum(d.equity) && d.equity > 0
      ? (d.net_income_ttm / d.equity) * 100
      : null;
  const net_margin =
    isNum(d.net_income_ttm) && isNum(d.revenue_ttm) && d.revenue_ttm > 0
      ? (d.net_income_ttm / d.revenue_ttm) * 100
      : null;
  const gross_margin =
    isNum(d.gross_profit_ttm) && isNum(d.revenue_ttm) && d.revenue_ttm > 0
      ? (d.gross_profit_ttm / d.revenue_ttm) * 100
      : null;

  // Yıllık büyüme — seri en güncel dönem başta. Önceki dönem pozitif olmalı.
  const revenue_growth = yoyGrowth(d.revenue_annual);
  const earnings_growth = yoyGrowth(d.net_income_annual);

  // Serbest nakit akışı = işletme nakit akışı − yatırım harcaması (capex).
  const free_cash_flow_ttm =
    isNum(d.operating_cf_ttm) && isNum(d.capex_ttm)
      ? d.operating_cf_ttm - d.capex_ttm
      : null;

  const current_ratio =
    isNum(d.current_assets) && isNum(d.current_liabilities) && d.current_liabilities > 0
      ? d.current_assets / d.current_liabilities
      : null;

  // Fiyatın 52 haftalık aralıktaki konumu (%).
  const hi = quote?.fifty_two_week_high ?? null;
  const lo = quote?.fifty_two_week_low ?? null;
  const price_position_52w =
    isNum(price) && isNum(hi) && isNum(lo) && hi > lo
      ? ((price - lo) / (hi - lo)) * 100
      : null;

  return {
    eps_ttm,
    fair_value,
    margin_of_safety_pct,
    roe,
    net_margin,
    gross_margin,
    revenue_growth,
    earnings_growth,
    free_cash_flow_ttm,
    current_ratio,
    price_position_52w,
  };
}

/** Yıllık seriden son dönem yıllık % büyümesi (önceki dönem pozitifse). */
function yoyGrowth(series: AnnualPoint[] | null | undefined): number | null {
  if (!series || series.length < 2) return null;
  const latest = series[0]?.value;
  const prior = series[1]?.value;
  if (!isNum(latest) || !isNum(prior) || prior <= 0) return null;
  return ((latest - prior) / prior) * 100;
}

interface PillarInput {
  key: string;
  label: string;
  weight: number;
  ratio: number | null; // 0..1 puan
  verdict: Verdict;
  detail: string;
}

function ratioVerdict(ratio: number): Verdict {
  if (ratio >= 0.7) return "good";
  if (ratio >= 0.4) return "warn";
  return "bad";
}

/**
 * 0-100 temel analiz skoru. Her sütun bağımsız değerlendirilir; verisi
 * olmayan sütun ağırlığı düşülür ve kalanlar yeniden normalize edilir.
 */
export function scoreFundamentals(
  raw: FundamentalsRaw,
  derived: DerivedMetrics,
): FundamentalScore {
  const pillars: PillarInput[] = [];

  // Değerleme — F/K düşükse iyi.
  const pe = raw.valuation?.pe ?? null;
  if (isNum(pe)) {
    let r: number;
    if (pe <= 0) r = 0;
    else if (pe <= 8) r = 1;
    else if (pe <= 15) r = 0.7;
    else if (pe <= 25) r = 0.4;
    else r = 0.15;
    pillars.push({
      key: "valuation",
      label: "Değerleme",
      weight: 25,
      ratio: r,
      verdict: pe <= 0 ? "bad" : ratioVerdict(r),
      detail: `F/K ${pe.toFixed(1)}`,
    });
  }

  // Karlılık — ROE yüksekse iyi.
  if (isNum(derived.roe)) {
    const roe = derived.roe;
    let r: number;
    if (roe < 0) r = 0;
    else if (roe >= 25) r = 1;
    else if (roe >= 15) r = 0.75;
    else if (roe >= 8) r = 0.5;
    else r = 0.25;
    pillars.push({
      key: "profitability",
      label: "Karlılık",
      weight: 25,
      ratio: r,
      verdict: roe < 0 ? "bad" : ratioVerdict(r),
      detail: `ROE %${roe.toFixed(1)}`,
    });
  }

  // Borçluluk — net borç / piyasa değeri düşükse iyi; net nakit en iyi.
  const netDebt = raw.valuation?.net_debt ?? null;
  const mcap = raw.quote?.market_cap ?? null;
  if (isNum(netDebt) && isNum(mcap) && mcap > 0) {
    const lev = netDebt / mcap;
    let r: number;
    if (lev <= 0) r = 1;
    else if (lev <= 0.3) r = 0.7;
    else if (lev <= 0.6) r = 0.4;
    else r = 0.15;
    pillars.push({
      key: "debt",
      label: "Borçluluk",
      weight: 20,
      ratio: r,
      verdict: ratioVerdict(r),
      detail: lev <= 0 ? "Net nakit" : `Net borç/PD ${lev.toFixed(2)}`,
    });
  }

  // Büyüme — nominal gelir büyümesi (enflasyon arındırılmamış).
  if (isNum(derived.revenue_growth)) {
    const gr = derived.revenue_growth;
    let r: number;
    if (gr >= 50) r = 1;
    else if (gr >= 25) r = 0.7;
    else if (gr >= 0) r = 0.4;
    else r = 0.1;
    pillars.push({
      key: "growth",
      label: "Büyüme",
      weight: 15,
      ratio: r,
      verdict: ratioVerdict(r),
      detail: `Gelir YoY %${gr.toFixed(0)} (nominal)`,
    });
  }

  // Likidite — cari oran 1.5+ ideal.
  if (isNum(derived.current_ratio)) {
    const cr = derived.current_ratio;
    let r: number;
    if (cr >= 1.5) r = 1;
    else if (cr >= 1) r = 0.6;
    else r = 0.2;
    pillars.push({
      key: "liquidity",
      label: "Likidite",
      weight: 10,
      ratio: r,
      verdict: ratioVerdict(r),
      detail: `Cari oran ${cr.toFixed(2)}`,
    });
  }

  // Temettü — verim varsa küçük bonus sütun.
  const dy = raw.dividend?.yield ?? null;
  if (isNum(dy)) {
    let r: number;
    if (dy >= 4) r = 1;
    else if (dy >= 2) r = 0.6;
    else r = 0.3;
    pillars.push({
      key: "dividend",
      label: "Temettü",
      weight: 5,
      ratio: r,
      verdict: ratioVerdict(r),
      detail: `Verim %${dy.toFixed(1)}`,
    });
  }

  const totalWeight = pillars.reduce((s, p) => s + p.weight, 0);
  let score: number | null = null;
  if (totalWeight > 0) {
    const weighted = pillars.reduce((s, p) => s + (p.ratio ?? 0) * p.weight, 0);
    score = Math.round((weighted / totalWeight) * 100);
  }

  let label: FundamentalScore["label"] = "—";
  if (score != null) {
    if (score >= 70) label = "Güçlü";
    else if (score >= 45) label = "Orta";
    else label = "Zayıf";
  }

  return {
    score,
    label,
    pillars: pillars.map((p) => ({
      key: p.key,
      label: p.label,
      verdict: p.verdict,
      weight: p.weight,
      detail: p.detail,
    })),
  };
}

/** Ham endpoint verisini türetilmiş metrik + skor ile zenginleştir. */
export function enrichFundamentals(raw: FundamentalsRaw): Fundamentals {
  const derived = deriveMetrics(raw);
  const score = scoreFundamentals(raw, derived);
  return { raw, derived, score };
}

/** firstNum'u dışarıya da aç — UI bazı yedek alanlar için kullanır. */
export { firstNum };

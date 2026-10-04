/* ============================================================
   Birikim ve hisse karşılaştırması — saf hesap ("use server" YOK).

   Soru: "Bu yıl ne kazandım, ne harcadım, servetim neden şu kadar
   arttı, hisse yatırımı bana kazandırdı mı?"
   - Gelir / gider / net birikim (kategori kırılımı, aylık)
   - Hiç harcama yapılmasaydı servet = bugünkü servet + gider
   - Servet köprüsü: değişim = birikim + piyasa etkisi (+ kayıt dışı)
   - Yatırım portföyü (hisse + fon): aynı tarihlerdeki aynı nakit
     akışları BIST 100, gram altın, dolar ve mevduata konsaydı?
   ============================================================ */

import { periodReturn, xirr } from "@/lib/finance/xirr";

export interface SavingsTxn {
  occurred_on: string;
  direction: "inflow" | "outflow" | "transfer";
  /** TRY */
  amount: number;
  category: string | null;
}

export interface DailyPoint {
  date: string;
  total_wealth: number;
  equity_mv: number;
}

export interface WealthAnchor {
  date: string;
  value: number;
  /** "daily": günlük kayıt; "manual": elle girilen yıl sonu */
  source: "daily" | "manual";
}

/** Yatırım portföyüne giren (-) / çıkan (+) nakit, TRY. */
export interface PortfolioFlow {
  date: string;
  amount: number;
}

export type AltKey = "XU100" | "XAUTRY" | "USDTRY";

export interface SavingsInputs {
  year: number;
  /** "YYYY-MM-DD" (İstanbul) */
  today: string;
  /** committed, transfer olmayan, TRY'ye çevrilmiş hareketler */
  txns: SavingsTxn[];
  /** Artan sıralı günlük snapshot'lar (yıl başından ve öncesinden) */
  daily: DailyPoint[];
  /** Yıl başı serveti: önceki yıl sonu günlük kaydı ya da elle girilen değer */
  yearStart: WealthAnchor | null;
  /** Portföy nakit akışları (alım −, satış +), tarih artan */
  flows: PortfolioFlow[];
  /** Temettü tahsilatları (portföyden çıkan nakit) */
  dividends: PortfolioFlow[];
  /** Artan sıralı [tarih, değer] */
  series: Record<AltKey, Array<[string, number]>>;
}

export interface CategoryAmount {
  name: string;
  amount: number;
  share: number;
}

export interface MonthRow {
  month: string;
  income: number;
  expense: number;
  savings: number;
  /** Ay sonu (ya da bugüne kadarki son) servet; günlük kayıt yoksa null */
  wealthEnd: number | null;
  /** Servet değişimi − birikim; önceki ay sonu bilinmiyorsa null */
  market: number | null;
}

export interface Alternative {
  key: AltKey | "DEPOSIT";
  label: string;
  endValue: number;
  /** Gerçek portföy − alternatif (negatif: alternatif daha iyiydi) */
  diff: number;
}

export interface PortfolioComparison {
  start: { date: string; value: number };
  end: { date: string; value: number };
  /** Başlangıç değeri + sonradan eklenen net para */
  netInvested: number;
  /** Temettü dahil */
  pnl: number;
  periodReturn: number | null;
  xirrAnnual: number | null;
  alternatives: Alternative[];
  /** Portföyün toplam servetteki payı (son gün) */
  shareOfWealth: number | null;
  /** Mevduat karşılaştırması istemcide yapılır (faiz kullanıcı girişi) */
  cashflows: PortfolioFlow[];
}

export interface SavingsReport {
  year: number;
  start: string;
  end: string;
  income: { total: number; byCategory: CategoryAmount[] };
  expense: { total: number; byCategory: CategoryAmount[] };
  net: number;
  savingsRate: number | null;
  wealthStart: WealthAnchor | null;
  wealthEnd: { date: string; value: number } | null;
  noSpendWealth: number | null;
  bridge: { delta: number; savings: number; market: number } | null;
  monthly: MonthRow[];
  portfolio: PortfolioComparison | null;
}

const ALT_LABEL: Record<AltKey, string> = {
  XU100: "BIST 100",
  XAUTRY: "Gram altın",
  USDTRY: "Dolar",
};

function valueOnOrBefore(series: Array<[string, number]>, date: string): number | null {
  let lo = 0;
  let hi = series.length - 1;
  let ans: number | null = null;
  while (lo <= hi) {
    const mid = (lo + hi) >> 1;
    if (series[mid][0] <= date) {
      ans = series[mid][1];
      lo = mid + 1;
    } else hi = mid - 1;
  }
  return ans;
}

function byCategory(rows: SavingsTxn[]): CategoryAmount[] {
  const m = new Map<string, number>();
  for (const r of rows) {
    const k = r.category ?? "Kategorisiz";
    m.set(k, (m.get(k) ?? 0) + r.amount);
  }
  const total = [...m.values()].reduce((a, b) => a + b, 0);
  return [...m.entries()]
    .map(([name, amount]) => ({ name, amount, share: total > 0 ? amount / total : 0 }))
    .sort((a, b) => b.amount - a.amount);
}

/** Akışları birime çevirip son güne taşı: Σ (−akış) × P_son / P_akış. */
export function unitAlternativeValue(
  flows: PortfolioFlow[],
  series: Array<[string, number]>,
  endDate: string,
): number | null {
  const pEnd = valueOnOrBefore(series, endDate);
  if (pEnd == null || !(pEnd > 0)) return null;
  let units = 0;
  for (const f of flows) {
    const p = valueOnOrBefore(series, f.date);
    if (p == null || !(p > 0)) return null;
    units += -f.amount / p;
  }
  return units * pEnd;
}

/** Aynı akışlar yıllık bileşik faizle (gün bazında) büyüseydi. */
export function depositAlternativeValue(flows: PortfolioFlow[], annualRate: number, endDate: string): number {
  const end = Date.parse(`${endDate}T00:00:00Z`);
  let v = 0;
  for (const f of flows) {
    const days = (end - Date.parse(`${f.date}T00:00:00Z`)) / 86_400_000;
    v += -f.amount * Math.pow(1 + annualRate, days / 365);
  }
  return v;
}

export function computeSavingsReport(input: SavingsInputs): SavingsReport {
  const { year, today } = input;
  const start = `${year}-01-01`;
  const end = today.slice(0, 4) === String(year) ? today : `${year}-12-31`;
  const inYear = (d: string) => d >= start && d <= end;

  // ---- Gelir / gider --------------------------------------------------
  const txns = input.txns.filter((t) => inYear(t.occurred_on) && t.direction !== "transfer");
  const incomeRows = txns.filter((t) => t.direction === "inflow");
  const expenseRows = txns.filter((t) => t.direction === "outflow");
  const incomeTotal = incomeRows.reduce((s, t) => s + t.amount, 0);
  const expenseTotal = expenseRows.reduce((s, t) => s + t.amount, 0);
  const net = incomeTotal - expenseTotal;

  // ---- Servet -----------------------------------------------------------
  const dailyInYear = input.daily.filter((d) => inYear(d.date));
  const last = dailyInYear.length > 0 ? dailyInYear[dailyInYear.length - 1] : null;
  const wealthEnd = last ? { date: last.date, value: last.total_wealth } : null;
  const wealthStart = input.yearStart;
  const bridge =
    wealthStart && wealthEnd
      ? { delta: wealthEnd.value - wealthStart.value, savings: net, market: wealthEnd.value - wealthStart.value - net }
      : null;

  // ---- Aylık --------------------------------------------------------------
  const lastMonth = Number(end.slice(5, 7));
  const monthly: MonthRow[] = [];
  let prevWealth: number | null = wealthStart?.value ?? null;
  for (let m = 1; m <= lastMonth; m++) {
    const key = `${year}-${String(m).padStart(2, "0")}`;
    const rows = txns.filter((t) => t.occurred_on.startsWith(key));
    const income = rows.filter((t) => t.direction === "inflow").reduce((s, t) => s + t.amount, 0);
    const expense = rows.filter((t) => t.direction === "outflow").reduce((s, t) => s + t.amount, 0);
    const monthPoints = dailyInYear.filter((d) => d.date.startsWith(key));
    const wealthEndM = monthPoints.length > 0 ? monthPoints[monthPoints.length - 1].total_wealth : null;
    // Piyasa etkisi = ay içi servet değişimi − birikim; önceki ay sonu (ya da
    // yıl başı) bilinmiyorsa hesaplanamaz.
    monthly.push({
      month: key,
      income,
      expense,
      savings: income - expense,
      wealthEnd: wealthEndM,
      market: wealthEndM != null && prevWealth != null ? wealthEndM - prevWealth - (income - expense) : null,
    });
    prevWealth = wealthEndM;
  }

  // ---- Portföy karşılaştırması --------------------------------------------
  let portfolio: PortfolioComparison | null = null;
  // Başlangıç: yıl başına ≤ son günlük kayıt varsa o, yoksa yıl içindeki ilk kayıt
  const startPoint =
    [...input.daily].reverse().find((d) => d.date <= `${year - 1}-12-31` && d.date >= `${year - 1}-12-01`) ??
    dailyInYear[0] ??
    null;
  if (startPoint && last && startPoint.equity_mv > 0 && last.date > startPoint.date) {
    const s = startPoint.date;
    const e = last.date;
    const window = (d: string) => d > s && d <= e;
    const cashflows: PortfolioFlow[] = [
      { date: s, amount: -startPoint.equity_mv },
      ...input.flows.filter((f) => window(f.date)),
      ...input.dividends.filter((f) => window(f.date)),
    ].sort((a, b) => (a.date < b.date ? -1 : a.date > b.date ? 1 : 0));
    const netInvested = -cashflows.reduce((acc, f) => acc + f.amount, 0);
    const pnl = last.equity_mv - netInvested;
    const ann = xirr([...cashflows, { date: e, amount: last.equity_mv }]);
    const days = Math.round((Date.parse(`${e}T00:00:00Z`) - Date.parse(`${s}T00:00:00Z`)) / 86_400_000);
    const alternatives: Alternative[] = [];
    for (const key of ["XU100", "XAUTRY", "USDTRY"] as AltKey[]) {
      const v = unitAlternativeValue(cashflows, input.series[key] ?? [], e);
      if (v != null) alternatives.push({ key, label: ALT_LABEL[key], endValue: v, diff: last.equity_mv - v });
    }
    portfolio = {
      start: { date: s, value: startPoint.equity_mv },
      end: { date: e, value: last.equity_mv },
      netInvested,
      pnl,
      periodReturn: ann == null ? null : periodReturn(ann, days),
      xirrAnnual: ann,
      alternatives,
      shareOfWealth: last.total_wealth > 0 ? last.equity_mv / last.total_wealth : null,
      cashflows,
    };
  }

  return {
    year,
    start,
    end,
    income: { total: incomeTotal, byCategory: byCategory(incomeRows) },
    expense: { total: expenseTotal, byCategory: byCategory(expenseRows) },
    net,
    savingsRate: incomeTotal > 0 ? net / incomeTotal : null,
    wealthStart,
    wealthEnd,
    noSpendWealth: wealthEnd ? wealthEnd.value + expenseTotal : null,
    bridge,
    monthly,
    portfolio,
  };
}

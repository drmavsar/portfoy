/* ============================================================
   Para ağırlıklı getiri (XIRR) raporu — saf hesap çekirdeği.
   "use server" YOK: testler ve server action buradan import eder.

   Her alım NEGATİF, her satış POZİTİF nakit akışıdır; bugünkü piyasa değeri
   son (pozitif) akıştır. Aynı akışlar işlem günündeki USD kuru, gram altın
   fiyatı ve TÜFE endeksiyle bölünerek dört ölçüde getiri hesaplanır:
     TL (nominal) · TÜFE'ye göre reel · USD bazında · gram altın bazında
   Tasarruf eklemek (yeni alım) getiriyi şişirmez — basit "değer artışı"
   ölçülerinin aksine para ağırlıklıdır.
   ============================================================ */

import { cpiPeriodFor } from "@/app/(app)/_lib/backtest/dates";
import { periodReturn, xirr, type CashFlow } from "@/lib/finance/xirr";

export interface XirrTrade {
  portfolio_id: string;
  side: "buy" | "sell";
  executed_at: string;
  quantity: number;
  price: number;
  fees: number;
  currency: string;
  fx_rate_to_try?: number | null;
}

export interface XirrGroup {
  key: string;
  label: string;
  kind: "total" | "person" | "portfolio";
  portfolioIds: string[];
}

export interface XirrInputs {
  trades: XirrTrade[];
  groups: XirrGroup[];
  /** Portföy başına bugünkü piyasa değeri (TRY) */
  mvByPortfolio: Record<string, number>;
  /** "YYYY-MM-DD" (İstanbul) */
  today: string;
  /** Artan sıralı [tarih, TRY/birim] */
  usdtry: Array<[string, number]>;
  goldTryPerGram: Array<[string, number]>;
  /** "YYYY-MM" → TÜFE endeksi */
  cpi: Record<string, number>;
}

export interface XirrMeasure {
  /** yıllık oran (0.25 = %25) */
  annual: number;
  /** ilk akıştan bugüne dönem getirisi */
  period: number;
}

export interface XirrRow {
  key: string;
  label: string;
  kind: XirrGroup["kind"];
  firstDate: string | null;
  days: number;
  /** Σ alım (TRY, masraf dahil) */
  invested: number;
  /** Σ satış (TRY, masraf düşülmüş) */
  withdrawn: number;
  currentMv: number;
  /** currentMv + withdrawn − invested */
  profit: number;
  tl: XirrMeasure | null;
  real: XirrMeasure | null;
  usd: XirrMeasure | null;
  gold: XirrMeasure | null;
}

/** FIFO'nun eşleştiremediği satış — veri girişi sorunu (alım eksik/fazla satış). */
export interface UnmatchedSell {
  symbol: string;
  portfolio: string;
  date: string;
  soldQty: number;
  /** Bu satıştan önce (aynı portföyde) alınmış toplam − satılmış toplam */
  availableQty: number;
  proceedsTry: number;
}

export interface XirrReport {
  rows: XirrRow[];
  /** Akışları çarpıtan, gerçekleşen K/Z'ye girmeyen satışlar */
  unmatchedSells: UnmatchedSell[];
  today: string;
  /** Son TÜFE dönemi; işlem dönemini kapsamıyorsa reel sütun boş */
  cpiLatest: string | null;
  cpiStale: boolean;
}

const DAY_MS = 86_400_000;

/** Artan sıralı seride tarihe ≤ en yakın değer (ikili arama). */
export function valueOnOrBefore(series: Array<[string, number]>, date: string): number | null {
  let lo = 0;
  let hi = series.length - 1;
  let ans: number | null = null;
  while (lo <= hi) {
    const mid = (lo + hi) >> 1;
    if (series[mid][0] <= date) {
      ans = series[mid][1];
      lo = mid + 1;
    } else {
      hi = mid - 1;
    }
  }
  return ans;
}

/** "YYYY-MM" dönemine ≤ en yakın TÜFE endeksi. */
function cpiOnOrBefore(cpi: Record<string, number>, period: string): number | null {
  let best: string | null = null;
  for (const p of Object.keys(cpi)) {
    if (p <= period && (best == null || p > best)) best = p;
  }
  return best ? cpi[best] : null;
}

function shiftPeriod(period: string, months: number): string {
  const [y, m] = period.split("-").map(Number);
  const idx = y * 12 + (m - 1) + months;
  return `${Math.floor(idx / 12)}-${String((idx % 12) + 1).padStart(2, "0")}`;
}

function tradeCashTry(t: XirrTrade): number {
  const fx = t.currency === "TRY" ? 1 : Number(t.fx_rate_to_try ?? 1) || 1;
  const gross = Number(t.quantity) * Number(t.price) * fx;
  const fees = Number(t.fees) * fx;
  return t.side === "buy" ? -(gross + fees) : gross - fees;
}

/** Akışları birim fiyatına bölerek o birim cinsinden XIRR; fiyat eksikse null. */
function measureIn(
  flows: CashFlow[],
  priceAt: (date: string) => number | null,
  days: number,
): XirrMeasure | null {
  const converted: CashFlow[] = [];
  for (const f of flows) {
    const p = priceAt(f.date);
    if (p == null || !(p > 0)) return null;
    converted.push({ date: f.date, amount: f.amount / p });
  }
  const annual = xirr(converted);
  if (annual == null) return null;
  return { annual, period: periodReturn(annual, days) };
}

export function computeXirrReport(input: XirrInputs): XirrReport {
  const cpiPeriods = Object.keys(input.cpi).sort();
  const cpiLatest = cpiPeriods.length > 0 ? cpiPeriods[cpiPeriods.length - 1] : null;
  // TÜİK bir önceki ayı ayın ~3'ünde yayımlar; bugünün "gereken" dönemi
  // cpiPeriodFor(today). Bir ay daha gecikmeye tolerans; daha eskiyse reel
  // getiri tüm akışları aynı endeksle bölüp nominale eşitlenir → gösterme.
  const cpiStale = !cpiLatest || cpiLatest < shiftPeriod(cpiPeriodFor(input.today), -1);

  const rows: XirrRow[] = [];
  for (const g of input.groups) {
    const ids = new Set(g.portfolioIds);
    const flows: CashFlow[] = [];
    let invested = 0;
    let withdrawn = 0;
    for (const t of input.trades) {
      if (!ids.has(t.portfolio_id)) continue;
      const cash = tradeCashTry(t);
      if (cash < 0) invested += -cash;
      else withdrawn += cash;
      flows.push({ date: t.executed_at.slice(0, 10), amount: cash });
    }
    const currentMv = g.portfolioIds.reduce((s, id) => s + (input.mvByPortfolio[id] ?? 0), 0);
    if (flows.length === 0) continue;
    if (currentMv > 0) flows.push({ date: input.today, amount: currentMv });

    flows.sort((a, b) => (a.date < b.date ? -1 : a.date > b.date ? 1 : 0));
    const firstDate = flows[0].date;
    const days = Math.max(
      0,
      Math.round((Date.parse(`${input.today}T00:00:00Z`) - Date.parse(`${firstDate}T00:00:00Z`)) / DAY_MS),
    );

    const tlAnnual = xirr(flows);
    const tl = tlAnnual == null ? null : { annual: tlAnnual, period: periodReturn(tlAnnual, days) };
    const usd = measureIn(flows, (d) => valueOnOrBefore(input.usdtry, d), days);
    const gold = measureIn(flows, (d) => valueOnOrBefore(input.goldTryPerGram, d), days);
    const real = cpiStale
      ? null
      : measureIn(flows, (d) => cpiOnOrBefore(input.cpi, cpiPeriodFor(d)), days);

    rows.push({
      key: g.key,
      label: g.label,
      kind: g.kind,
      firstDate,
      days,
      invested,
      withdrawn,
      currentMv,
      profit: currentMv + withdrawn - invested,
      tl,
      real,
      usd,
      gold,
    });
  }

  return { rows, unmatchedSells: [], today: input.today, cpiLatest, cpiStale };
}

export interface SellCheckTrade extends XirrTrade {
  id: string;
  asset_id: string;
}

/**
 * FIFO'nun eşleştiremediği satışları bul: gerçekleşen lotu yok VE satıştan
 * önce aynı portföyde yeterli alım yok (alım hiç girilmemiş, başka portföye
 * girilmiş ya da bedelsiz/yazım hatası nedeniyle fazla satış). Bu satışlar
 * Raporlar'daki gerçekleşen K/Z'ye girmez ve XIRR'ı çarpıtır.
 */
export function findUnmatchedSells(
  trades: SellCheckTrade[],
  hasLots: (sellTradeId: string) => boolean,
  symbolOf: (assetId: string) => string,
  portfolioName: (portfolioId: string) => string,
): UnmatchedSell[] {
  const sorted = [...trades].sort((a, b) =>
    a.executed_at < b.executed_at ? -1 : a.executed_at > b.executed_at ? 1 : a.id < b.id ? -1 : 1,
  );
  const held = new Map<string, number>(); // portföy|varlık → adet
  const out: UnmatchedSell[] = [];
  for (const t of sorted) {
    const key = `${t.portfolio_id}|${t.asset_id}`;
    const before = held.get(key) ?? 0;
    const qty = Number(t.quantity);
    if (t.side === "buy") {
      held.set(key, before + qty);
      continue;
    }
    held.set(key, before - qty);
    // Lotu olan ya da önceden yeterli alımı olan (yalnız işlenmeyi bekleyen)
    // satış sorun değil; yalnız gerçek eksik alımı işaretle.
    if (hasLots(t.id) || before + 1e-9 >= qty) continue;
    out.push({
      symbol: symbolOf(t.asset_id),
      portfolio: portfolioName(t.portfolio_id),
      date: t.executed_at.slice(0, 10),
      soldQty: qty,
      availableQty: Math.max(0, before),
      proceedsTry: tradeCashTry(t),
    });
  }
  return out;
}

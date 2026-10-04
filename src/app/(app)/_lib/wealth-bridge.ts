/* ============================================================
   Servet köprüsü — saf hesap ("use server" YOK).

   Soru: "Zenginleşmemin sebebi tasarruf etmem mi, yatırım yapmam mı?"

   Bir dönemin servet değişimi parçalara ayrılır:
     Δservet = tasarruf + hisse & fon + döviz + altın + diğer
   - tasarruf      gelir − gider (temettü hariç; temettü yatırım getirisidir)
   - hisse & fon   Δpiyasa değeri + net satış (alım −, satış +) + temettü
   - döviz / altın her gün: önceki günün TL değeri × kurun günlük değişimi
                   (alım-satım gibi akışlar kur etkisine girmez)
   - diğer         kalan fark: kayda girmemiş harcama/gelir, faiz, bakiye
                   düzeltmesi, kart borcu zamanlaması, kripto
   Günlük kayıt (daily_snapshots) başlamadan önceki kısım sınıflara
   ayrılamaz: yalnız tasarruf ve "ayrıştırılamayan" olarak gösterilir.
   ============================================================ */

export interface BridgeSnapshot {
  date: string;
  total: number;
  fx: number;
  metal: number;
  /** Hisse + fon piyasa değeri (snapshot equity_mv) */
  invest: number;
  usdtry: number | null;
  xau: number | null;
}

export interface BridgeTxn {
  date: string;
  direction: "inflow" | "outflow";
  /** TRY */
  amount: number;
  dividend: boolean;
}

/** Portföy nakit akışı (TRY): alım −, satış + */
export interface BridgeFlow {
  date: string;
  amount: number;
}

export interface BridgeAnchor {
  date: string;
  value: number;
  source: "daily" | "manual";
}

export interface BridgeInputs {
  today: string;
  /** Artan tarih sıralı */
  daily: BridgeSnapshot[];
  /** Elle girilen yıl sonu servetleri ("YYYY-12-31") */
  manual: Array<{ date: string; value: number }>;
  txns: BridgeTxn[];
  flows: BridgeFlow[];
}

export interface BridgeParts {
  savings: number;
  invest: number;
  fx: number;
  metal: number;
  other: number;
  /** Takip öncesi: piyasa + diğer, sınıflara ayrılamadı */
  untracked: number;
}

export interface BridgeWindow {
  start: BridgeAnchor;
  end: { date: string; value: number };
  delta: number;
  parts: BridgeParts;
  income: number;
  expense: number;
  dividends: number;
  /** Ayrıştırılamayan kısım bu tarihte biter (ilk günlük kayıt); yoksa null */
  untrackedUntil: string | null;
}

const ZERO: BridgeParts = { savings: 0, invest: 0, fx: 0, metal: 0, other: 0, untracked: 0 };

/** Tarihe ≤ en son dayanak: günlük kayıt ya da elle girilen yıl sonu (eşitlikte günlük). */
export function anchorOnOrBefore(input: BridgeInputs, date: string): BridgeAnchor | null {
  let daily: BridgeSnapshot | null = null;
  for (const d of input.daily) {
    if (d.date <= date) daily = d;
    else break;
  }
  let manual: { date: string; value: number } | null = null;
  for (const m of input.manual) if (m.date <= date && (!manual || m.date > manual.date)) manual = m;
  if (daily && (!manual || daily.date >= manual.date)) return { date: daily.date, value: daily.total, source: "daily" };
  if (manual) return { date: manual.date, value: manual.value, source: "manual" };
  return null;
}

function cashflows(input: BridgeInputs, from: string, to: string) {
  let income = 0;
  let expense = 0;
  let dividends = 0;
  for (const t of input.txns) {
    if (t.date <= from || t.date > to) continue;
    if (t.direction === "inflow") {
      income += t.amount;
      if (t.dividend) dividends += t.amount;
    } else expense += t.amount;
  }
  return { income, expense, dividends, savings: income - expense - dividends };
}

/** Önceki geçerli kurla devam et: eksik gün kur etkisini sıfırlamasın. */
function rateOr(prev: number | null, v: number | null): number | null {
  return v != null && v > 0 ? v : prev;
}

/** İki günlük kayıt arasını ayrıştır (ikisi de günlük olmalı). */
function trackedParts(input: BridgeInputs, a: BridgeSnapshot, e: BridgeSnapshot) {
  const cf = cashflows(input, a.date, e.date);
  let flow = 0;
  for (const f of input.flows) if (f.date > a.date && f.date <= e.date) flow += f.amount;
  let fx = 0;
  let metal = 0;
  let prev: BridgeSnapshot | null = null;
  let usd: number | null = null;
  let xau: number | null = null;
  for (const d of input.daily) {
    if (d.date < a.date) continue;
    if (d.date > e.date) break;
    const nUsd = rateOr(usd, d.usdtry);
    const nXau = rateOr(xau, d.xau);
    if (prev) {
      if (usd && nUsd) fx += prev.fx * (nUsd / usd - 1);
      if (xau && nXau) metal += prev.metal * (nXau / xau - 1);
    }
    prev = d;
    usd = nUsd;
    xau = nXau;
  }
  const invest = e.invest - a.invest + flow + cf.dividends;
  const delta = e.total - a.total;
  return {
    ...cf,
    parts: { savings: cf.savings, invest, fx, metal, other: delta - cf.savings - invest - fx - metal, untracked: 0 },
  };
}

function add(a: BridgeParts, b: BridgeParts): BridgeParts {
  return {
    savings: a.savings + b.savings,
    invest: a.invest + b.invest,
    fx: a.fx + b.fx,
    metal: a.metal + b.metal,
    other: a.other + b.other,
    untracked: a.untracked + b.untracked,
  };
}

/**
 * (from, to] dönemi: başlangıç = from'a ≤ son dayanak, bitiş = to'ya ≤ son
 * günlük kayıt. Başlangıç elle girilmiş yıl sonuysa ilk günlük kayda kadarki
 * kısım "ayrıştırılamayan" olur.
 */
export function bridgeWindow(input: BridgeInputs, from: string, to: string): BridgeWindow | null {
  const start = anchorOnOrBefore(input, from);
  let end: BridgeSnapshot | null = null;
  for (const d of input.daily) {
    if (d.date <= to) end = d;
    else break;
  }
  if (!start || !end || end.date <= start.date) return null;

  let parts = ZERO;
  let income = 0;
  let expense = 0;
  let dividends = 0;
  let trackedFrom: BridgeSnapshot | null = null;
  let untrackedUntil: string | null = null;

  if (start.source === "daily") {
    trackedFrom = input.daily.find((d) => d.date === start.date) ?? null;
  } else {
    // Elle girilmiş yıl sonu → ilk günlük kayda kadar sınıf kırılımı yok
    const first = input.daily.find((d) => d.date > start.date) ?? null;
    if (!first) return null;
    const cf = cashflows(input, start.date, first.date);
    parts = { ...ZERO, savings: cf.savings, untracked: first.total - start.value - cf.savings };
    income += cf.income;
    expense += cf.expense;
    dividends += cf.dividends;
    trackedFrom = first;
    untrackedUntil = first.date;
  }
  if (trackedFrom && end.date > trackedFrom.date) {
    const t = trackedParts(input, trackedFrom, end);
    parts = add(parts, t.parts);
    income += t.income;
    expense += t.expense;
    dividends += t.dividends;
  }
  return {
    start,
    end: { date: end.date, value: end.total },
    delta: end.total - start.value,
    parts,
    income,
    expense,
    dividends,
    untrackedUntil,
  };
}

function monthEnd(ym: string): string {
  const [y, m] = ym.split("-").map(Number);
  return new Date(Date.UTC(y, m, 0)).toISOString().slice(0, 10);
}

function prevMonthEnd(ym: string): string {
  const [y, m] = ym.split("-").map(Number);
  return new Date(Date.UTC(y, m - 1, 0)).toISOString().slice(0, 10);
}

export interface BridgeRow {
  key: string;
  window: BridgeWindow;
  /** Takip öncesi satırı (yıl sonu → ilk günlük kayıt) */
  pre: boolean;
}

/**
 * Ay ay köprü: yalnız günlük kayıtla ölçülen kısım. Elle girilen yıl
 * sonundan ilk günlük kayda kadarki dönem ayrı bir "takip öncesi" satırıdır.
 * Yeni → eski sıralı.
 */
export function monthlyBridge(input: BridgeInputs): BridgeRow[] {
  if (input.daily.length === 0) return [];
  const first = input.daily[0];
  const rows: BridgeRow[] = [];
  const pre = input.manual.filter((m) => m.date < first.date).sort((a, b) => (a.date < b.date ? 1 : -1))[0];
  if (pre) {
    const w = bridgeWindow({ ...input, daily: [first] }, pre.date, first.date);
    if (w) rows.push({ key: `pre-${pre.date}`, window: w, pre: true });
  }
  const tracked = { ...input, manual: [] };
  let ym = first.date.slice(0, 7);
  const last = input.daily[input.daily.length - 1].date.slice(0, 7);
  while (ym <= last) {
    const from = prevMonthEnd(ym) < first.date ? first.date : prevMonthEnd(ym);
    const w = bridgeWindow(tracked, from, monthEnd(ym));
    if (w) rows.push({ key: ym, window: w, pre: false });
    const [y, m] = ym.split("-").map(Number);
    ym = m === 12 ? `${y + 1}-01` : `${y}-${String(m + 1).padStart(2, "0")}`;
  }
  return rows.reverse();
}

export type VerdictKind = "both-up" | "savings-carried" | "market-carried" | "both-down";

export interface Verdict {
  kind: VerdictKind;
  savings: number;
  /** Tasarruf dışı her şey: yatırım, kur, altın, diğer, ayrıştırılamayan */
  market: number;
  /** Yalnız "both-up" için: artışın tasarruftan gelen payı (0-1) */
  savingsShare: number | null;
}

export function bridgeVerdict(w: BridgeWindow): Verdict {
  const savings = w.parts.savings;
  const market = w.delta - savings;
  if (savings >= 0 && market >= 0) {
    return { kind: "both-up", savings, market, savingsShare: w.delta > 0 ? savings / w.delta : null };
  }
  if (savings >= 0) return { kind: "savings-carried", savings, market, savingsShare: null };
  if (market >= 0) return { kind: "market-carried", savings, market, savingsShare: null };
  return { kind: "both-down", savings, market, savingsShare: null };
}

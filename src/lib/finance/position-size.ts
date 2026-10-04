/* ============================================================
   Risk bazlı pozisyon büyüklüğü (lot hesabı) — saf hesap.

   Stopa gelinirse kaybedilecek tutar = hesap × risk%. Hisse başına risk
   yalnız (giriş − stop) değildir: alışta ve stopta satışta komisyon +
   BSMV (komisyonun %5'i) da ödenir. BIST'te 1 lot = 1 hisse.
   ============================================================ */

/** Aracı kurum komisyonlarında BSMV oranı. */
export const BSMV_RATE = 0.05;

export interface PositionSizeInput {
  /** Hesap büyüklüğü (TRY) */
  equity: number;
  /** İşlem başına risk (0.01 = %1) */
  riskPct: number;
  entry: number;
  stop: number;
  target?: number | null;
  /** Komisyon oranı, BSMV hariç (0.0017 = binde 1,7) */
  commissionRate: number;
  /** false ise BSMV eklenmez */
  includeBsmv?: boolean;
  /** Tek pozisyon hesabın en fazla bu kadarı olabilir (0.2 = %20); null = sınırsız */
  maxPositionPct?: number | null;
  /** Kullanılabilir nakit (TRY); null = sınırsız */
  cash?: number | null;
}

export type SizeLimit = "risk" | "maxPosition" | "cash";

export interface PositionSizeResult {
  ok: true;
  qty: number;
  limitedBy: SizeLimit;
  /** Risk bütçesi = equity × riskPct */
  riskBudget: number;
  /** Hisse başına toplam risk (fiyat farkı + iki yön masraf) */
  riskPerShare: number;
  /** qty × riskPerShare — bütçeyi aşmaz */
  actualRisk: number;
  positionValue: number;
  positionPct: number;
  /** Alış masrafı (komisyon + BSMV) */
  buyCost: number;
  /** Stopta satış masrafı */
  sellCostAtStop: number;
  /** Masraflar sonrası başabaş fiyatı */
  breakeven: number;
  /** Hedefte net kâr (iki yön masraf düşülmüş) */
  netRewardAtTarget: number | null;
  /** Net kâr / net risk */
  rr: number | null;
  /** Efektif komisyon oranı (BSMV dahil) */
  effectiveRate: number;
}

export type PositionSizeOutcome = PositionSizeResult | { ok: false; error: string };

export function sizePosition(input: PositionSizeInput): PositionSizeOutcome {
  const { equity, riskPct, entry, stop } = input;
  if (!(equity > 0)) return { ok: false, error: "Hesap büyüklüğü pozitif olmalı." };
  if (!(riskPct > 0 && riskPct <= 0.2)) return { ok: false, error: "Risk %0 ile %20 arasında olmalı." };
  if (!(entry > 0) || !(stop > 0)) return { ok: false, error: "Giriş ve stop fiyatı pozitif olmalı." };
  if (stop >= entry) return { ok: false, error: "Stop girişin altında olmalı (uzun pozisyon)." };
  if (!(input.commissionRate >= 0 && input.commissionRate < 0.05)) {
    return { ok: false, error: "Komisyon oranı geçersiz." };
  }

  const c = input.commissionRate * (input.includeBsmv === false ? 1 : 1 + BSMV_RATE);
  const riskPerShare = entry - stop + entry * c + stop * c;
  const riskBudget = equity * riskPct;
  const costPerShare = entry * (1 + c);

  let qty = Math.floor(riskBudget / riskPerShare);
  let limitedBy: SizeLimit = "risk";
  if (input.maxPositionPct != null && input.maxPositionPct > 0) {
    const cap = Math.floor((equity * input.maxPositionPct) / costPerShare);
    if (cap < qty) {
      qty = cap;
      limitedBy = "maxPosition";
    }
  }
  if (input.cash != null && input.cash >= 0) {
    const cap = Math.floor(input.cash / costPerShare);
    if (cap < qty) {
      qty = cap;
      limitedBy = "cash";
    }
  }
  qty = Math.max(0, qty);

  const positionValue = qty * entry;
  const target = input.target != null && input.target > entry ? input.target : null;
  const netRewardPerShare = target != null ? target - entry - entry * c - target * c : null;

  return {
    ok: true,
    qty,
    limitedBy,
    riskBudget,
    riskPerShare,
    actualRisk: qty * riskPerShare,
    positionValue,
    positionPct: positionValue / equity,
    buyCost: positionValue * c,
    sellCostAtStop: qty * stop * c,
    breakeven: (entry * (1 + c)) / (1 - c),
    netRewardAtTarget: netRewardPerShare != null ? qty * netRewardPerShare : null,
    rr: netRewardPerShare != null ? netRewardPerShare / riskPerShare : null,
    effectiveRate: c,
  };
}

/** Kullanıcının geçmiş işlemlerinden efektif komisyon (BSMV dahil) medyanı. */
export function medianFeeRate(trades: Array<{ quantity: number; price: number; fees: number }>): number | null {
  const rates = trades
    .filter((t) => t.fees > 0 && t.quantity > 0 && t.price > 0)
    .map((t) => t.fees / (t.quantity * t.price))
    .filter((r) => r > 0 && r < 0.01)
    .sort((a, b) => a - b);
  if (rates.length === 0) return null;
  const mid = rates.length >> 1;
  return rates.length % 2 ? rates[mid] : (rates[mid - 1] + rates[mid]) / 2;
}

/**
 * Serbest sayı girişi: "1.234,5" (TR), "1.500.000" (binlik), "95.5" (ondalık
 * nokta — ön doldurulan fiyatlar böyle gelir) → sayı. Geçersizse NaN.
 */
export function parseLooseNumber(v: string): number {
  const s = v.trim().replace(/\s/g, "");
  if (s.includes(",")) return Number(s.replace(/\./g, "").replace(",", "."));
  if ((s.match(/\./g) ?? []).length > 1) return Number(s.replace(/\./g, ""));
  return Number(s);
}

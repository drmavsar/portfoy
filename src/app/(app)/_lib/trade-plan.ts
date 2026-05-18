/**
 * Trade plan calculator — açık pozisyonlar için T1/T2 hedef + S1/S2 stop
 * + sağlık durumu rozeti. bt_v18 projesindeki core/risk.py mantığının
 * existing-position varyantı.
 *
 * Fikir:
 * - T1 = current + 2 × ATR (sonraki kâr realize seviyesi)
 * - T2 = current + 4 × ATR (final swing hedef)
 * - S1 = current − 1.5 × ATR (teknik stop)
 * - S2 = max(WAC × 0.95, current − 2.5 × ATR) (felaket stop, en az WAC altı %5)
 *
 * Mevcut pozisyon için ATR/MA bazlı dinamik — yeni sinyalde değil.
 */

export interface TradePlan {
  wac: number;             // pozisyon giriş fiyatı (info)
  current: number;
  atr14: number;

  t1: number;              // hedef 1 (TL fiyat)
  t2: number;              // hedef 2
  s1: number;              // stop 1
  s2: number;              // stop 2

  delta_t1_pct: number;    // current → T1 mesafesi %
  delta_t2_pct: number;
  delta_s1_pct: number;    // current → S1 mesafesi % (negatif)
  delta_s2_pct: number;

  rr1: number;             // (T1-current) / (current-S1)
  rr2: number;

  high_52w_distance_pct: number | null;  // 52W high'a uzaklık %
  ma20_extension_pct: number | null;     // MA20 üstünde % extension

  health: "healthy" | "near_target" | "warn_stop" | "below_stop" | "extended" | "below_wac";
  health_label: string;
  health_color: string;
}

const TARGET_1_ATR_MULT = 2.0;
const TARGET_2_ATR_MULT = 4.0;
const STOP_1_ATR_MULT = 1.5;
const STOP_2_ATR_MULT = 2.5;
const WAC_FLOOR_PCT = 0.95;       // S2 en az WAC × 0.95 olmalı
const NEAR_THRESHOLD_ATR = 0.5;   // T1/S1'e 0.5 ATR'den yakınsa "yakın"
const EXTENDED_MA20_PCT = 10;     // MA20'nin %10 üzerinde ise extended

export function buildTradePlan(
  wac: number,
  current: number,
  atr14: number,
  high_52w: number | null,
  ma20: number | null,
): TradePlan {
  const t1 = current + TARGET_1_ATR_MULT * atr14;
  const t2 = current + TARGET_2_ATR_MULT * atr14;
  const s1 = current - STOP_1_ATR_MULT * atr14;
  const s2 = Math.max(wac * WAC_FLOOR_PCT, current - STOP_2_ATR_MULT * atr14);

  const delta_t1_pct = ((t1 - current) / current) * 100;
  const delta_t2_pct = ((t2 - current) / current) * 100;
  const delta_s1_pct = ((s1 - current) / current) * 100;
  const delta_s2_pct = ((s2 - current) / current) * 100;

  const risk1 = current - s1;
  const reward1 = t1 - current;
  const reward2 = t2 - current;
  const rr1 = risk1 > 0 ? reward1 / risk1 : 0;
  const rr2 = risk1 > 0 ? reward2 / risk1 : 0;

  const high_52w_distance_pct =
    high_52w && high_52w > 0 ? ((high_52w - current) / current) * 100 : null;
  const ma20_extension_pct =
    ma20 && ma20 > 0 ? ((current - ma20) / ma20) * 100 : null;

  // Sağlık durumu sırası önemli: en kötüden en iyiye doğru bak
  let health: TradePlan["health"];
  let health_label: string;
  let health_color: string;

  if (current < s1) {
    health = "below_stop";
    health_label = "Stop Altı";
    health_color = "var(--negative)";
  } else if (current < wac) {
    health = "below_wac";
    health_label = "Maliyet Altı";
    health_color = "var(--warning)";
  } else if ((current - s1) / atr14 < NEAR_THRESHOLD_ATR) {
    health = "warn_stop";
    health_label = "Stop Yakın";
    health_color = "var(--warning)";
  } else if ((t1 - current) / atr14 < NEAR_THRESHOLD_ATR) {
    health = "near_target";
    health_label = "Hedef Yakın";
    health_color = "var(--positive)";
  } else if (ma20_extension_pct !== null && ma20_extension_pct > EXTENDED_MA20_PCT) {
    health = "extended";
    health_label = "Extended";
    health_color = "var(--warning)";
  } else {
    health = "healthy";
    health_label = "Sağlıklı";
    health_color = "var(--positive)";
  }

  return {
    wac,
    current,
    atr14,
    t1: round2(t1),
    t2: round2(t2),
    s1: round2(s1),
    s2: round2(s2),
    delta_t1_pct: round2(delta_t1_pct),
    delta_t2_pct: round2(delta_t2_pct),
    delta_s1_pct: round2(delta_s1_pct),
    delta_s2_pct: round2(delta_s2_pct),
    rr1: round2(rr1),
    rr2: round2(rr2),
    high_52w_distance_pct: high_52w_distance_pct !== null ? round2(high_52w_distance_pct) : null,
    ma20_extension_pct: ma20_extension_pct !== null ? round2(ma20_extension_pct) : null,
    health,
    health_label,
    health_color,
  };
}

function round2(n: number): number {
  return Math.round(n * 100) / 100;
}

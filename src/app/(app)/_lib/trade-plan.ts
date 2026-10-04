/**
 * Trade plan calculator — açık pozisyonlar için T1/T2 hedef + S1/S2 stop
 * + sağlık durumu rozeti. bt_v18 projesindeki core/risk.py mantığının
 * existing-position varyantı.
 *
 * Seviyeler POZİSYONA çapalıdır (giriş = WAC), anlık fiyata değil:
 * - T1 = WAC + 2 × ATR, T2 = WAC + 4 × ATR (girişten R katları)
 * - S1 (teknik stop) = WAC − 1.5 × ATR; trend fiyatı taşıyıp MA20 maliyetin
 *   üstüne çıktıysa MA20 − 1 × ATR'ye yükselir (iz süren stop)
 * - S2 (felaket stop) = min(WAC − 2.5 × ATR, WAC × 0.95), her zaman ≤ S1
 *
 * Eskiden tüm seviyeler `current ± k×ATR` idi: (current − S1)/ATR hep 1.5,
 * (T1 − current)/ATR hep 2 olduğundan "Stop Altı", "Stop Yakın" ve "Hedef
 * Yakın" matematiksel olarak hiç oluşamıyordu (fiyat düştükçe stop da
 * düşüyordu); %5'ten fazla zarardaki pozisyonda S2 fiyatın ÜSTÜNDE kalıyordu.
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

  rr1: number;             // kalan ödül/risk: (T1-current) / (current-S1); hedef aşıldıysa 0
  rr2: number;

  trailing: boolean;       // S1 MA20'ye göre yukarı izliyor mu

  high_52w_distance_pct: number | null;  // 52W high'a uzaklık %
  ma20_extension_pct: number | null;     // MA20 üstünde % extension

  health:
    | "healthy"
    | "near_target"
    | "target_hit"
    | "warn_stop"
    | "below_stop"
    | "extended"
    | "below_wac";
  health_label: string;
  health_color: string;
}

const TARGET_1_ATR_MULT = 2.0;
const TARGET_2_ATR_MULT = 4.0;
const STOP_1_ATR_MULT = 1.5;
const STOP_2_ATR_MULT = 2.5;
const TRAIL_MA20_ATR_MULT = 1.0;  // iz süren stop: MA20 − 1 × ATR
const WAC_FLOOR_PCT = 0.95;       // S2 en az WAC'ın %5 altında olmalı
const NEAR_THRESHOLD_ATR = 0.5;   // T1/S1'e 0.5 ATR'den yakınsa "yakın"
const EXTENDED_MA20_PCT = 10;     // MA20'nin %10 üzerinde ise extended

export function buildTradePlan(
  wac: number,
  current: number,
  atr14: number,
  high_52w: number | null,
  ma20: number | null,
): TradePlan {
  // Hedefler girişten (WAC) R katları.
  const t1 = wac + TARGET_1_ATR_MULT * atr14;
  const t2 = wac + TARGET_2_ATR_MULT * atr14;

  // Teknik stop: giriş riski; trend MA20'yi maliyetin üstüne taşıdıysa izler.
  const initialStop = wac - STOP_1_ATR_MULT * atr14;
  const trailStop =
    ma20 != null && ma20 > wac ? ma20 - TRAIL_MA20_ATR_MULT * atr14 : -Infinity;
  const trailing = trailStop > initialStop;
  const s1 = Math.max(initialStop, trailStop);

  // Felaket stop: maliyetin en az %5 altında ve teknik stopun altında.
  const s2 = Math.min(wac - STOP_2_ATR_MULT * atr14, wac * WAC_FLOOR_PCT, s1);

  const delta_t1_pct = ((t1 - current) / current) * 100;
  const delta_t2_pct = ((t2 - current) / current) * 100;
  const delta_s1_pct = ((s1 - current) / current) * 100;
  const delta_s2_pct = ((s2 - current) / current) * 100;

  // Kalan ödül / kalan risk (anlık fiyattan). Hedef aşıldıysa ya da fiyat
  // stopun altındaysa anlamsız → 0.
  const risk1 = current - s1;
  const rr1 = risk1 > 0 && t1 > current ? (t1 - current) / risk1 : 0;
  const rr2 = risk1 > 0 && t2 > current ? (t2 - current) / risk1 : 0;

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
  } else if ((current - s1) / atr14 < NEAR_THRESHOLD_ATR) {
    // Stop yakınlığı maliyet altından önce: iz süren stop maliyetin üstünde
    // olabilir ve "kârı koru" uyarısı daha acildir.
    health = "warn_stop";
    health_label = "Stop Yakın";
    health_color = "var(--warning)";
  } else if (current < wac) {
    health = "below_wac";
    health_label = "Maliyet Altı";
    health_color = "var(--warning)";
  } else if (current >= t2) {
    health = "target_hit";
    health_label = "Hedef 2 Aşıldı";
    health_color = "var(--positive)";
  } else if (current >= t1 || (t1 - current) / atr14 < NEAR_THRESHOLD_ATR) {
    health = "near_target";
    health_label = current >= t1 ? "Hedef 1 Aşıldı" : "Hedef Yakın";
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
    trailing,
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

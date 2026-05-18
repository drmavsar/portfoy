/**
 * Pattern detection — bt_v18 patterns/ modülünden uyarlanmıştır.
 *
 * Şimdilik 3 pattern: ATH Breakout, Double Bottom, Cup & Handle.
 * Saf compute, dış bağımlılık yok. /tarama BIST 100 ölçeğinde her sembol
 * için OHLC + ATR + MA20 verisiyle çağrılır.
 */

export type PatternKind = "ath_breakout" | "double_bottom" | "cup_handle";

export type SetupType = "breakout" | "near_breakout" | "watchlist";

export interface PatternSignal {
  pattern: PatternKind;
  pattern_label: string;
  setup_type: SetupType;
  entry: number;
  stop: number;
  target: number;
  rr: number;
  pattern_quality: number; // 0-1
  breakout_confirmed: boolean;
  entry_rule: string;
  comment: string;
}

export interface OHLC {
  high: number[];
  low: number[];
  close: number[];
}

// ============================================================
// Konstantlar (bt_v18 config'ten uyarlandı)
// ============================================================
const BREAKOUT_PROXIMITY = 0.03; // 3% near-breakout eşiği
const ATR_STOP_MULTIPLIER = 1.5;
const MAX_EXTENSION_MA20 = 0.15; // %15 üstündeyse extended

// ATH
const ATH_LOOKBACK = 252;
const ATH_TARGET_ATR_MULT = 3.0;

// Double bottom
const DB_LOOKBACK = 90;
const DB_MIN_SEP = 5;
const DB_MAX_SEP = 60;
const DB_TOLERANCE = 0.05; // 2 dip aynı seviye toleransı

// Cup & handle
const CUP_LOOKBACK = 120;
const CUP_HANDLE_LOOKBACK = 15;
const CUP_RIM_TOLERANCE = 0.05;
const CUP_MIN_DEPTH = 0.10;
const CUP_MAX_DEPTH = 0.35;
const CUP_HANDLE_MAX_DROP = 0.12;

// ============================================================
// Yardımcılar
// ============================================================

function classifySetup(
  breakoutConfirmed: boolean,
  nearBreakout: boolean,
  extended: boolean,
): SetupType | null {
  if (breakoutConfirmed && !extended) return "breakout";
  if (breakoutConfirmed && extended) return "watchlist"; // teyit var ama uzaklaşmış
  if (nearBreakout) return "near_breakout";
  return null;
}

function buildStop(entry: number, atr: number, invalidationStop: number, recentSwingLow: number | null): number {
  const candidates: number[] = [];
  if (invalidationStop > 0 && invalidationStop < entry) candidates.push(invalidationStop);
  const atrStop = entry - atr * ATR_STOP_MULTIPLIER;
  if (atrStop > 0 && atrStop < entry) candidates.push(atrStop);
  if (recentSwingLow !== null && recentSwingLow > 0 && recentSwingLow < entry) candidates.push(recentSwingLow);
  if (candidates.length === 0) return round2(entry * 0.97);
  return round2(Math.max(...candidates)); // en sıkı stop = en yüksek değer
}

function recentSwingLow(lows: number[], window = 20): number | null {
  if (lows.length < window) return null;
  return Math.min(...lows.slice(-window));
}

function calcRR(entry: number, stop: number, target: number): number {
  const risk = entry - stop;
  const reward = target - entry;
  if (risk <= 0 || reward <= 0) return 0;
  return round2(reward / risk);
}

function round2(n: number): number {
  return Math.round(n * 100) / 100;
}

/** Bir nokta yerel minimum mu? (basit swing low) */
function swingLowIndices(lows: number[], window = 2): number[] {
  const out: number[] = [];
  for (let i = window; i < lows.length - window; i++) {
    let isLow = true;
    for (let k = 1; k <= window; k++) {
      if (lows[i] >= lows[i - k] || lows[i] >= lows[i + k]) {
        isLow = false;
        break;
      }
    }
    if (isLow) out.push(i);
  }
  return out;
}

// ============================================================
// Pattern detector'ları
// ============================================================

/** ATH Breakout — 252 günlük en yükseği aşma */
export function detectATHBreakout(
  ohlc: OHLC,
  atr14: number,
  ma20: number | null,
): PatternSignal | null {
  const { high, close } = ohlc;
  if (close.length < 80 || atr14 <= 0) return null;

  const lastClose = close[close.length - 1];
  if (!Number.isFinite(lastClose) || lastClose <= 0) return null;

  // Bir önceki bara kadar 252 gün max (current bar dahil değil)
  const start = Math.max(0, close.length - 1 - ATH_LOOKBACK);
  const prevHigh = Math.max(...high.slice(start, close.length - 1));
  if (!Number.isFinite(prevHigh) || prevHigh <= 0) return null;

  const breakoutConfirmed = lastClose > prevHigh;
  const nearBreakout = lastClose >= prevHigh * (1 - BREAKOUT_PROXIMITY);
  if (!breakoutConfirmed && !nearBreakout) return null;

  const extension = ma20 && ma20 > 0 ? (lastClose - ma20) / ma20 : 0;
  const extended = extension > MAX_EXTENSION_MA20;
  const setup = classifySetup(breakoutConfirmed, nearBreakout, extended);
  if (!setup) return null;

  const entry = round2(Math.max(lastClose, prevHigh));
  const invalidationStop = round2(prevHigh * 0.985);
  const stop = buildStop(entry, atr14, invalidationStop, recentSwingLow(ohlc.low, 20));
  const target = round2(entry + atr14 * ATH_TARGET_ATR_MULT);
  const rr = calcRR(entry, stop, target);

  return {
    pattern: "ath_breakout",
    pattern_label: "ATH Breakout",
    setup_type: setup,
    entry,
    stop,
    target,
    rr,
    pattern_quality: breakoutConfirmed ? 1.0 : 0.75,
    breakout_confirmed: breakoutConfirmed,
    entry_rule: "Close > 252-gün yüksek",
    comment: breakoutConfirmed
      ? extended
        ? "Yeni zirve teyitli — extended, watchlist"
        : "Yeni zirve teyitli, momentum güçlü"
      : "Zirveye yakın, breakout izlenmeli",
  };
}

/** Double Bottom (Çift Dip) — 2 dip + neckline kırılımı */
export function detectDoubleBottom(
  ohlc: OHLC,
  atr14: number,
  ma20: number | null,
): PatternSignal | null {
  const { high, low, close } = ohlc;
  if (close.length < DB_LOOKBACK || atr14 <= 0) return null;

  const startIdx = close.length - DB_LOOKBACK;
  const wHigh = high.slice(startIdx);
  const wLow = low.slice(startIdx);
  const lastClose = close[close.length - 1];

  const lowsIdx = swingLowIndices(wLow, 2);
  if (lowsIdx.length < 2) return null;

  const extension = ma20 && ma20 > 0 ? (lastClose - ma20) / ma20 : 0;
  const extended = extension > MAX_EXTENSION_MA20;

  let best: (PatternSignal & { _rank: number }) | null = null;

  for (let i = 0; i < lowsIdx.length - 1; i++) {
    for (let j = i + 1; j < lowsIdx.length; j++) {
      const a = lowsIdx[i];
      const b = lowsIdx[j];
      const separation = b - a;
      if (separation < DB_MIN_SEP || separation > DB_MAX_SEP) continue;

      const low1 = wLow[a];
      const low2 = wLow[b];
      const avgLow = (low1 + low2) / 2;
      if (avgLow <= 0) continue;

      const tolerance = Math.abs(low1 - low2) / avgLow;
      if (tolerance > DB_TOLERANCE) continue;

      const neckline = Math.max(...wHigh.slice(a, b + 1));
      if (neckline <= avgLow) continue;

      const breakoutConfirmed = lastClose > neckline;
      const nearBreakout = lastClose >= neckline * (1 - BREAKOUT_PROXIMITY);
      if (!breakoutConfirmed && !nearBreakout) continue;

      const setup = classifySetup(breakoutConfirmed, nearBreakout, extended);
      if (!setup) continue;

      const dip = Math.min(low1, low2);
      const entry = round2(neckline);
      const invalidationStop = round2(dip * 0.985);
      const stop = buildStop(entry, atr14, invalidationStop, recentSwingLow(low, 20));
      const target = round2(entry + (entry - dip));
      const rr = calcRR(entry, stop, target);
      const quality = Math.max(0, 1 - tolerance / DB_TOLERANCE);
      const rank = quality * rr;

      if (!best || rank > best._rank) {
        best = {
          pattern: "double_bottom",
          pattern_label: "Double Bottom",
          setup_type: setup,
          entry,
          stop,
          target,
          rr,
          pattern_quality: round2(quality),
          breakout_confirmed: breakoutConfirmed,
          entry_rule: "Close > neckline",
          comment: breakoutConfirmed ? "Çift dip neckline teyitli" : "Neckline'a yakın, kırılım izlenmeli",
          _rank: rank,
        };
      }
    }
  }

  if (!best) return null;
  const { _rank: _rank, ...rest } = best;
  void _rank;
  return rest;
}

/** Cup & Handle (Fincan & Kulp) */
export function detectCupHandle(
  ohlc: OHLC,
  atr14: number,
  ma20: number | null,
): PatternSignal | null {
  const { high, low, close } = ohlc;
  if (close.length < CUP_LOOKBACK || atr14 <= 0) return null;

  const start = close.length - CUP_LOOKBACK;
  const wHigh = high.slice(start);
  const wLow = low.slice(start);
  const lastClose = close[close.length - 1];

  const cupEnd = wHigh.length - CUP_HANDLE_LOOKBACK;
  if (cupEnd < 40) return null;

  const cupHigh = wHigh.slice(0, cupEnd);
  const cupLow = wLow.slice(0, cupEnd);
  const handleHigh = wHigh.slice(cupEnd);
  const handleLow = wLow.slice(cupEnd);

  const leftRim = Math.max(...cupHigh.slice(0, 10));
  const rightRim = Math.max(...cupHigh.slice(-10));
  const cupBottom = Math.min(...cupLow);
  const avgRim = (leftRim + rightRim) / 2;
  if (avgRim <= 0) return null;

  const rimDiff = Math.abs(leftRim - rightRim) / avgRim;
  if (rimDiff > CUP_RIM_TOLERANCE) return null;

  const cupDepth = (avgRim - cupBottom) / avgRim;
  if (cupDepth < CUP_MIN_DEPTH || cupDepth > CUP_MAX_DEPTH) return null;

  // U şekli kabası: orta kısım dipte
  const midStart = Math.floor(cupLow.length / 4);
  const midEnd = Math.floor((3 * cupLow.length) / 4);
  const midLow = Math.min(...cupLow.slice(midStart, midEnd));
  if (midLow > avgRim * (1 - CUP_MIN_DEPTH / 2)) return null;

  const hHigh = Math.max(...handleHigh);
  const hLow = Math.min(...handleLow);
  const handleDrop = hHigh > 0 ? (hHigh - hLow) / hHigh : 1;
  if (handleDrop > CUP_HANDLE_MAX_DROP) return null;
  if (hHigh < avgRim * 0.95) return null;

  const cupRim = Math.max(avgRim, hHigh);
  const breakoutConfirmed = lastClose > cupRim;
  const nearBreakout = lastClose >= cupRim * (1 - BREAKOUT_PROXIMITY);
  if (!breakoutConfirmed && !nearBreakout) return null;

  const extension = ma20 && ma20 > 0 ? (lastClose - ma20) / ma20 : 0;
  const extended = extension > MAX_EXTENSION_MA20;
  const setup = classifySetup(breakoutConfirmed, nearBreakout, extended);
  if (!setup) return null;

  const entry = round2(cupRim);
  const invalidationStop = round2(hLow * 0.985);
  const stop = buildStop(entry, atr14, invalidationStop, recentSwingLow(low, 20));
  const target = round2(entry + (avgRim - cupBottom));
  const rr = calcRR(entry, stop, target);
  const quality = Math.max(
    0,
    1 - (rimDiff / CUP_RIM_TOLERANCE) * 0.5 - (handleDrop / CUP_HANDLE_MAX_DROP) * 0.3,
  );

  return {
    pattern: "cup_handle",
    pattern_label: "Cup & Handle",
    setup_type: setup,
    entry,
    stop,
    target,
    rr,
    pattern_quality: round2(Math.min(1, quality)),
    breakout_confirmed: breakoutConfirmed,
    entry_rule: "Close > cup rim",
    comment: breakoutConfirmed ? "Fincan kulp teyitli — momentum güçlü" : "Cup rim'e yakın, breakout izlenmeli",
  };
}

/** Tüm pattern'ları çalıştırır, kalitesiyle sıralar */
export function scanAllPatterns(
  ohlc: OHLC,
  atr14: number,
  ma20: number | null,
): PatternSignal[] {
  const out: PatternSignal[] = [];
  const ath = detectATHBreakout(ohlc, atr14, ma20);
  if (ath) out.push(ath);
  const db = detectDoubleBottom(ohlc, atr14, ma20);
  if (db) out.push(db);
  const cup = detectCupHandle(ohlc, atr14, ma20);
  if (cup) out.push(cup);
  // Quality * RR ile sırala — en iyi setup en başta
  out.sort((a, b) => b.pattern_quality * b.rr - a.pattern_quality * a.rr);
  return out;
}

/** ATR14 hesaplama (Wilder smoothing) — pattern detection için ortak helper */
export function computeATR14(highs: number[], lows: number[], closes: number[]): number | null {
  if (highs.length < 15 || lows.length < 15 || closes.length < 15) return null;
  const trs: number[] = [];
  for (let i = 1; i < closes.length; i++) {
    const tr = Math.max(
      highs[i] - lows[i],
      Math.abs(highs[i] - closes[i - 1]),
      Math.abs(lows[i] - closes[i - 1]),
    );
    trs.push(tr);
  }
  if (trs.length < 14) return null;
  let atr = trs.slice(0, 14).reduce((s, v) => s + v, 0) / 14;
  for (let i = 14; i < trs.length; i++) {
    atr = (atr * 13 + trs[i]) / 14;
  }
  return Number.isFinite(atr) && atr > 0 ? atr : null;
}

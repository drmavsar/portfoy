"use server";

// BIST hisse taraması — Yahoo Finance 1 yıllık günlük close array'i üzerinden
// teknik indikatörler hesaplar (SMA20/50/200, RSI14, momentum, 52h mesafe).
// Tek bir Composite Score ile sıralanabilir hâle getirir.

export interface ScreeningRow {
  symbol: string;
  price: number;
  prev_close: number | null;
  daily_pct: number | null;
  week_pct: number | null;     // 5 trading day
  month_pct: number | null;    // 22 trading day
  quarter_pct: number | null;  // 66 trading day
  ytd_pct: number | null;      // yıl başından
  high_52w: number | null;
  low_52w: number | null;
  high_distance_pct: number | null;   // (price - 52h) / 52h × 100 (negatif)
  low_distance_pct: number | null;    // (price - 52l) / 52l × 100 (pozitif)
  sma20: number | null;
  sma50: number | null;
  sma200: number | null;
  sma20_dist: number | null; // %
  sma50_dist: number | null;
  sma200_dist: number | null;
  rsi14: number | null;
  vol_20d: number | null;    // ortalama hacim son 20 gün
  rs_20: number | null;      // 20 gün symbol/XU100 oran değişimi (% outperformance)
  rs_60: number | null;      // 60 gün
  score: number | null;      // composite 0-100
}

interface YahooResponse {
  chart?: {
    result?: Array<{
      meta?: {
        regularMarketPrice?: number;
        previousClose?: number;
        chartPreviousClose?: number;
        regularMarketTime?: number;
      };
      timestamp?: number[];
      indicators?: {
        quote?: Array<{
          close?: Array<number | null>;
          volume?: Array<number | null>;
        }>;
      };
    }>;
  };
}

function sma(arr: number[], n: number): number | null {
  if (arr.length < n) return null;
  let sum = 0;
  for (let i = arr.length - n; i < arr.length; i++) sum += arr[i];
  return sum / n;
}

function rsi(arr: number[], n = 14): number | null {
  if (arr.length < n + 1) return null;
  // Wilder's smoothing
  let gainSum = 0;
  let lossSum = 0;
  // İlk N gün
  for (let i = 1; i <= n; i++) {
    const d = arr[i] - arr[i - 1];
    if (d >= 0) gainSum += d;
    else lossSum += -d;
  }
  let avgGain = gainSum / n;
  let avgLoss = lossSum / n;
  // Sonraki günler için Wilder smoothing
  for (let i = n + 1; i < arr.length; i++) {
    const d = arr[i] - arr[i - 1];
    const gain = d > 0 ? d : 0;
    const loss = d < 0 ? -d : 0;
    avgGain = (avgGain * (n - 1) + gain) / n;
    avgLoss = (avgLoss * (n - 1) + loss) / n;
  }
  if (avgLoss === 0) return 100;
  const rs = avgGain / avgLoss;
  return 100 - 100 / (1 + rs);
}

function pctChange(cur: number, ref: number | null | undefined): number | null {
  if (ref == null || ref === 0) return null;
  return ((cur - ref) / ref) * 100;
}

/** RS (relative strength) vs index: lookback gün önce ile şimdi arasında
 *  symbol/index oranındaki değişim. Pozitif → outperform. */
function computeRS(
  symbolCloses: number[],
  indexCloses: number[],
  lookback: number,
): number | null {
  if (symbolCloses.length < lookback + 1) return null;
  if (indexCloses.length < lookback + 1) return null;
  const sNow = symbolCloses[symbolCloses.length - 1];
  const sBack = symbolCloses[symbolCloses.length - 1 - lookback];
  const iNow = indexCloses[indexCloses.length - 1];
  const iBack = indexCloses[indexCloses.length - 1 - lookback];
  if (!sBack || !iBack || sBack <= 0 || iBack <= 0) return null;
  const ratioNow = sNow / iNow;
  const ratioBack = sBack / iBack;
  if (ratioBack <= 0) return null;
  return (ratioNow / ratioBack - 1) * 100;
}

async function fetchIndexCloses(symbol: string): Promise<number[]> {
  try {
    const res = await fetch(
      `https://query1.finance.yahoo.com/v8/finance/chart/${symbol}.IS?interval=1d&range=1y`,
      {
        next: { revalidate: 1800 },
        headers: { "User-Agent": "Mozilla/5.0 (compatible; MehmetsAssets/1.0)" },
      },
    );
    if (!res.ok) return [];
    const json = (await res.json()) as YahooResponse;
    const arr = json.chart?.result?.[0]?.indicators?.quote?.[0]?.close ?? [];
    return arr.filter((x): x is number => typeof x === "number" && Number.isFinite(x));
  } catch {
    return [];
  }
}

async function fetchOne(
  symbol: string,
  indexCloses: number[] = [],
): Promise<ScreeningRow | null> {
  const url = `https://query1.finance.yahoo.com/v8/finance/chart/${symbol}.IS?interval=1d&range=1y`;
  try {
    const res = await fetch(url, {
      next: { revalidate: 1800 },
      headers: { "User-Agent": "Mozilla/5.0 (compatible; MehmetsAssets/1.0)" },
    });
    if (!res.ok) return null;
    const json = (await res.json()) as YahooResponse;
    const r = json.chart?.result?.[0];
    const meta = r?.meta;
    const closesRaw = r?.indicators?.quote?.[0]?.close ?? [];
    const volumesRaw = r?.indicators?.quote?.[0]?.volume ?? [];
    const timestamps = r?.timestamp ?? [];
    const closes: number[] = [];
    const vols: number[] = [];
    const ts: number[] = [];
    for (let i = 0; i < closesRaw.length; i++) {
      const c = closesRaw[i];
      if (typeof c === "number" && Number.isFinite(c)) {
        closes.push(c);
        vols.push(typeof volumesRaw[i] === "number" ? (volumesRaw[i] as number) : 0);
        if (timestamps[i]) ts.push(timestamps[i]);
      }
    }
    if (closes.length < 30 || !meta?.regularMarketPrice) return null;

    const price = meta.regularMarketPrice;
    const prev = meta.previousClose ?? meta.chartPreviousClose ?? closes[closes.length - 2] ?? null;

    const lookback = (n: number) =>
      closes.length > n ? closes[closes.length - 1 - n] : null;

    // YTD: yıl başından bu yana
    const yearStartIdx = ts.findIndex((t) => {
      const d = new Date(t * 1000);
      return d.getUTCFullYear() === new Date().getUTCFullYear();
    });
    const ytdRef = yearStartIdx > 0 ? closes[yearStartIdx] : null;

    // 52 hafta yüksek/düşük (son ~252 trading day)
    const oneYr = closes.slice(-252);
    const high52 = Math.max(...oneYr);
    const low52 = Math.min(...oneYr);

    const s20 = sma(closes, 20);
    const s50 = sma(closes, 50);
    const s200 = sma(closes, 200);
    const r14 = rsi(closes, 14);
    const vol20 = vols.length >= 20
      ? vols.slice(-20).reduce((a, b) => a + b, 0) / 20
      : null;

    return {
      symbol,
      price,
      prev_close: prev,
      daily_pct: pctChange(price, prev),
      week_pct: pctChange(price, lookback(5)),
      month_pct: pctChange(price, lookback(22)),
      quarter_pct: pctChange(price, lookback(66)),
      ytd_pct: pctChange(price, ytdRef),
      high_52w: high52,
      low_52w: low52,
      high_distance_pct: pctChange(price, high52),
      low_distance_pct: pctChange(price, low52),
      sma20: s20,
      sma50: s50,
      sma200: s200,
      sma20_dist: pctChange(price, s20),
      sma50_dist: pctChange(price, s50),
      sma200_dist: pctChange(price, s200),
      rsi14: r14,
      vol_20d: vol20,
      rs_20: indexCloses.length > 0 ? computeRS(closes, indexCloses, 20) : null,
      rs_60: indexCloses.length > 0 ? computeRS(closes, indexCloses, 60) : null,
      score: null, // composite skor sonradan hesaplanır
    };
  } catch (err) {
    console.error("screening fetchOne", symbol, err);
    return null;
  }
}

/** Composite score 0-100 — multi-factor:
 *  - Trend (35%): SMA20/50/200 üstünde olma puanı
 *  - Momentum (35%): ay + 3 ay değişim (clamp ±30%)
 *  - 52h yakınlık (20%): -high_distance bonus
 *  - RSI sağlık (10%): 40-70 arası optimum, 70+ aşırı alım, 30- aşırı satım
 */
function computeScore(r: ScreeningRow): number {
  let trend = 0;
  if (r.sma20_dist != null && r.price > (r.sma20 ?? 0)) trend += 33;
  if (r.sma50_dist != null && r.price > (r.sma50 ?? 0)) trend += 33;
  if (r.sma200_dist != null && r.price > (r.sma200 ?? 0)) trend += 34;
  trend = trend / 100; // 0-1

  const clamp = (v: number | null, max: number) => {
    if (v == null) return 0;
    const c = Math.max(-max, Math.min(max, v));
    return (c + max) / (2 * max); // 0-1
  };
  const momentum = 0.5 * clamp(r.month_pct, 30) + 0.5 * clamp(r.quarter_pct, 50);

  // 52h yakınlık: -high_distance pozitif değer (0% = zirvede iyi)
  const highScore = r.high_distance_pct != null
    ? Math.max(0, Math.min(1, 1 + r.high_distance_pct / 30)) // -30% = 0, 0% = 1
    : 0.5;

  let rsiScore = 0.5;
  if (r.rsi14 != null) {
    if (r.rsi14 >= 50 && r.rsi14 <= 70) rsiScore = 1;
    else if (r.rsi14 > 70) rsiScore = Math.max(0, 1 - (r.rsi14 - 70) / 30);
    else if (r.rsi14 >= 30) rsiScore = (r.rsi14 - 30) / 20;
    else rsiScore = 0;
  }

  const score = 100 * (0.35 * trend + 0.35 * momentum + 0.2 * highScore + 0.1 * rsiScore);
  return Math.round(score * 10) / 10;
}

export async function getScreeningData(symbols: string[]): Promise<ScreeningRow[]> {
  if (symbols.length === 0) return [];
  const uniq = Array.from(new Set(symbols));
  // XU100 endeks closes'unu bir kez çek → her sembol için RS hesabında kullan
  const indexCloses = await fetchIndexCloses("XU100");
  // 10'arlı batch'lerle paralel (Yahoo rate limit)
  const out: ScreeningRow[] = [];
  for (let i = 0; i < uniq.length; i += 10) {
    const batch = uniq.slice(i, i + 10);
    const results = await Promise.all(batch.map((s) => fetchOne(s, indexCloses)));
    for (const r of results) if (r) out.push(r);
  }
  for (const r of out) r.score = computeScore(r);
  return out;
}

// ============================================================
// Sector momentum — sector bazlı ortalama skor ve sıralama
// ============================================================

export interface SectorMomentumInfo {
  sector_rank: number;          // 1 = en iyi
  sector_momentum_score: number; // 0-100
  sector_avg_score: number;
  sector_size: number;
}

/** Sektör bazlı momentum: avg(score) %70 + avg(month_pct clamp ±30) %30.
 *  Sembol sayısı 3'ten az olan sektörler "UNDERSAMPLED" olarak işaretlenir
 *  (sector_rank = 999), ranking dışı kalır. */
export async function computeSectorMomentum(
  rows: Array<{ symbol: string; sector: string | null; score: number | null; month_pct: number | null }>,
): Promise<Map<string, SectorMomentumInfo>> {
  const bySector = new Map<string, Array<{ score: number; month: number | null }>>();
  for (const r of rows) {
    if (!r.sector || r.score == null) continue;
    const arr = bySector.get(r.sector) ?? [];
    arr.push({ score: r.score, month: r.month_pct });
    bySector.set(r.sector, arr);
  }

  const sectorScores = new Map<string, number>();
  const sectorSize = new Map<string, number>();
  for (const [sector, items] of bySector) {
    if (items.length < 3) continue;
    const avgScore = items.reduce((s, x) => s + x.score, 0) / items.length;
    const avgMonth =
      items.reduce((s, x) => s + clamp(x.month ?? 0, -30, 30), 0) / items.length;
    // Normalize avgMonth (-30..30) → 0..1
    const monthNorm = (avgMonth + 30) / 60;
    const momentum = 0.7 * (avgScore / 100) + 0.3 * monthNorm;
    sectorScores.set(sector, Math.round(momentum * 100 * 10) / 10);
    sectorSize.set(sector, items.length);
  }

  const ranked = Array.from(sectorScores.entries()).sort((a, b) => b[1] - a[1]);
  const out = new Map<string, SectorMomentumInfo>();
  ranked.forEach(([sector, momScore], i) => {
    const items = bySector.get(sector) ?? [];
    const avgScore =
      items.reduce((s, x) => s + x.score, 0) / Math.max(1, items.length);
    out.set(sector, {
      sector_rank: i + 1,
      sector_momentum_score: momScore,
      sector_avg_score: Math.round(avgScore * 10) / 10,
      sector_size: sectorSize.get(sector) ?? 0,
    });
  });
  return out;
}

function clamp(v: number, lo: number, hi: number): number {
  return Math.max(lo, Math.min(hi, v));
}

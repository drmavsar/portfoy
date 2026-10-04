// BIST endeks günlük kapanış geçmişi — /api/bist-history (borsapy, İş Yatırım).
//
// benchmark-daily cron'u XU100 için yalnız TradingView'in "bugünkü" kapanışını
// yazıyordu: cron bir gün kaçarsa boşluk kalıcı oluyordu (20 Tem–3 Ağu 2026, 11
// iş günü) ve 18:30'daki gecikmeli TradingView değeri bazen kapanış seansı
// bitmeden alınıyordu (12 günde %0,1–0,9 sapma). Resmi günlük kapanış geçmişi
// her çalışmada son pencereyi yeniden yazarak ikisini de kendiliğinden düzeltir.

import { istanbulDateFromUnix } from "@/lib/finance/istanbul-date";

import type { BenchmarkPoint } from "./types";

interface HistoryResponse {
  status?: string;
  series?: Record<string, { ts?: number[]; close?: Array<number | null> }>;
}

/** /api/bist-history yanıtından tarihli kapanışlar (İstanbul günü, artan, tekil). */
export function parseBistHistoryPoints(json: HistoryResponse, symbol: string): BenchmarkPoint[] {
  const s = json.series?.[symbol];
  if (json.status !== "ok" || !s?.ts || !s.close) return [];
  const byDate = new Map<string, number>();
  const n = Math.min(s.ts.length, s.close.length);
  for (let i = 0; i < n; i++) {
    const t = s.ts[i];
    const c = s.close[i];
    if (!Number.isFinite(t) || typeof c !== "number" || !Number.isFinite(c) || c <= 0) continue;
    byDate.set(istanbulDateFromUnix(t), c);
  }
  return [...byDate.entries()]
    .map(([as_of, value]) => ({ as_of, value }))
    .sort((a, b) => (a.as_of < b.as_of ? -1 : 1));
}

function bistHistoryHost(): string {
  // stock-screening.ts ile aynı: korumasız production alias tercih edilir.
  const host = process.env.VERCEL_PROJECT_PRODUCTION_URL || process.env.VERCEL_URL;
  return host ? `https://${host}` : "http://localhost:3000";
}

/** Endeksin günlük kapanışları; hata/boş yanıtta []. */
export async function fetchBistIndexHistory(
  symbol: string,
  period: "1mo" | "3mo" | "6mo" | "1y" = "3mo",
): Promise<BenchmarkPoint[]> {
  try {
    const url = `${bistHistoryHost()}/api/bist-history?index=${encodeURIComponent(symbol)}&period=${period}`;
    const res = await fetch(url, { cache: "no-store" });
    if (!res.ok) return [];
    return parseBistHistoryPoints((await res.json()) as HistoryResponse, symbol);
  } catch (err) {
    console.error("[bist-index-history]", symbol, err);
    return [];
  }
}

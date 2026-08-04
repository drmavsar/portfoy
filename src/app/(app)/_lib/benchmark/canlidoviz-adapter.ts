// canlidoviz adaptörü — benchmark serileri için günlük OHLC (token gerektirmez).
//
// EVDS gram altın (TP.MK.F.GA) ve döviz için günlük veri güvenilir gelmiyordu;
// canlidoviz aynı veriyi token'sız, günlük çözünürlükte verir. Yalnızca kapanış
// (close) benchmark_points'e yazılır.
//
// Endpoint (borsapy _providers/canlidoviz.py ile aynı):
//   GET https://a.canlidoviz.com/items/history
//       ?period=DAILY&itemDataId={id}&startDate={ISO}&endDate={ISO}
//   Yanıt: { "<unix_ts>": "open|high|low|close", ... }

import type { BenchmarkPoint } from "./types";

const UA =
  "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36";
const API_BASE = "https://a.canlidoviz.com";

/** benchmark_series kodu → canlidoviz itemDataId. */
export const CANLIDOVIZ_ITEM_IDS: Record<string, number> = {
  XAUTRY: 32, // gram-altin (TRY)
  USDTRY: 1, // ABD Doları
  EURTRY: 50, // Euro
};

export interface CanlidovizFetchResult {
  ok: boolean;
  points: BenchmarkPoint[];
  error?: string;
  body_snippet?: string;
}

/**
 * canlidoviz /items/history yanıtını ({ "<unix_ts>": "open|high|low|close" })
 * benchmark noktalarına (kapanış) çevirir. Tarih başına tekilleştirir (aynı gün
 * birden fazla ts gelirse sonuncu kazanır), UTC tarih, artan sıralı.
 */
export function parseCanlidovizHistory(raw: Record<string, unknown>): BenchmarkPoint[] {
  const byDate = new Map<string, number>();
  for (const [ts, ohlc] of Object.entries(raw)) {
    const tsNum = Number(ts);
    if (!Number.isFinite(tsNum)) continue;
    const parts = String(ohlc).split("|");
    const close = Number(parts[3]);
    if (!Number.isFinite(close) || close <= 0) continue;
    const date = new Date(tsNum * 1000).toISOString().slice(0, 10);
    byDate.set(date, close);
  }
  return [...byDate.entries()]
    .map(([as_of, value]) => ({ as_of, value }))
    .sort((a, b) => (a.as_of < b.as_of ? -1 : 1));
}

function pad(n: number): string {
  return String(n).padStart(2, "0");
}
/** canlidoviz startDate/endDate formatı: "YYYY-MM-DDTHH:MM:SS" (yerel değil, UTC). */
function fmtDate(d: Date): string {
  return `${d.getUTCFullYear()}-${pad(d.getUTCMonth() + 1)}-${pad(d.getUTCDate())}T${pad(d.getUTCHours())}:${pad(d.getUTCMinutes())}:${pad(d.getUTCSeconds())}`;
}

/**
 * Bir benchmark serisi için [startDate, endDate] aralığında günlük kapanışları
 * canlidoviz'den çeker. Tarihler YYYY-MM-DD (UTC gün) olarak döner, artan sıralı.
 */
export async function fetchCanlidovizSeries(opts: {
  code: string;
  startDate: string; // YYYY-MM-DD
  endDate: string; // YYYY-MM-DD
}): Promise<CanlidovizFetchResult> {
  const itemId = CANLIDOVIZ_ITEM_IDS[opts.code];
  if (itemId == null) {
    return { ok: false, points: [], error: `canlidoviz item id yok: ${opts.code}` };
  }
  const start = new Date(`${opts.startDate}T00:00:00Z`);
  const end = new Date(`${opts.endDate}T23:59:59Z`);
  const url = `${API_BASE}/items/history?period=DAILY&itemDataId=${itemId}&startDate=${encodeURIComponent(
    fmtDate(start),
  )}&endDate=${encodeURIComponent(fmtDate(end))}`;

  try {
    const res = await fetch(url, {
      headers: { "User-Agent": UA, Origin: "https://canlidoviz.com", Referer: "https://canlidoviz.com/" },
      cache: "no-store",
    });
    const text = await res.text();
    if (!res.ok) {
      return { ok: false, points: [], error: `HTTP ${res.status}`, body_snippet: text.slice(0, 200) };
    }
    let raw: Record<string, unknown>;
    try {
      raw = JSON.parse(text) as Record<string, unknown>;
    } catch {
      return { ok: false, points: [], error: "JSON parse", body_snippet: text.slice(0, 200) };
    }
    return { ok: true, points: parseCanlidovizHistory(raw) };
  } catch (e) {
    return { ok: false, points: [], error: String(e) };
  }
}

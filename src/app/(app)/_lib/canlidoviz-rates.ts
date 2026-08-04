// canlidoviz — FX + altın için güncel kur ve günlük değişim (token'sız).
//
// asset-rates.ts'teki birincil kaynak Truncgil zaman zaman boş/bozuk JSON
// döndürüyor; özellikle getAssetChanges'in fallback'i olmadığından altın/döviz
// günlük değişimi "+0" görünüyordu. canlidoviz'in günlük OHLC serisinden son
// kapanış (güncel kur) ve son iki kapanıştan günlük % değişim hesaplanır.
//
// Endpoint doğrulandı (Vercel runtime): USD/EUR/gram-altın değerleri benchmark
// cron'unda üretilenlerle tutarlı.

import { parseCanlidovizHistory } from "./benchmark/canlidoviz-adapter";

const UA =
  "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36";
const API_BASE = "https://a.canlidoviz.com";

// Uygulama currency kodu → canlidoviz itemDataId (borsapy _providers/canlidoviz).
// TRY-bazlı tek-birim varlıklarla sınırlı (JPY per-100 gibi birim tuzakları hariç).
export const CANLIDOVIZ_RATE_IDS: Record<string, number> = {
  USD: 1,
  EUR: 50,
  GBP: 100,
  CHF: 51,
  XAU: 32, // gram altın
  XAG: 20, // gram gümüş
  XAU_OZ: 81, // ons altın (TRY)
  CEYREK: 11,
  YARIM: 47,
  TAM: 14,
  CUMHURIYET: 27,
  ATA: 43,
};

// Kod-başına makul TRY aralığı (2026). USD/EUR/XAU canlı doğrulandı; coin altın
// id'leri aynı endpoint ama doğrulanmadı — birim tuzağına karşı aralık dışını
// reddet (o kod Truncgil'e düşer). [min, max]
const RATE_BOUNDS: Record<string, [number, number]> = {
  USD: [10, 500],
  EUR: [10, 600],
  GBP: [10, 800],
  CHF: [10, 600],
  XAU: [1_000, 100_000], // gram altın
  XAG: [10, 5_000], // gram gümüş
  XAU_OZ: [30_000, 3_000_000], // ons
  CEYREK: [3_000, 500_000],
  YARIM: [6_000, 1_000_000],
  TAM: [12_000, 2_000_000],
  CUMHURIYET: [12_000, 2_000_000],
  ATA: [12_000, 2_000_000],
};

function pad(n: number): string {
  return String(n).padStart(2, "0");
}
function fmtDate(d: Date): string {
  return `${d.getUTCFullYear()}-${pad(d.getUTCMonth() + 1)}-${pad(d.getUTCDate())}T${pad(d.getUTCHours())}:${pad(d.getUTCMinutes())}:${pad(d.getUTCSeconds())}`;
}

async function fetchOne(
  code: string,
  id: number,
  start: string,
  end: string,
): Promise<{ code: string; rate: number; change: number | null } | null> {
  const url = `${API_BASE}/items/history?period=DAILY&itemDataId=${id}&startDate=${encodeURIComponent(start)}&endDate=${encodeURIComponent(end)}`;
  try {
    const res = await fetch(url, {
      next: { revalidate: 600, tags: ["asset-rates"] },
      headers: { "User-Agent": UA, Origin: "https://canlidoviz.com", Referer: "https://canlidoviz.com/" },
    });
    if (!res.ok) return null;
    const raw = (await res.json()) as Record<string, unknown>;
    const pts = parseCanlidovizHistory(raw);
    if (pts.length === 0) return null;
    const rate = pts[pts.length - 1].value;
    const bounds = RATE_BOUNDS[code];
    if (bounds && (rate < bounds[0] || rate > bounds[1])) return null; // birim tuzağı
    const prev = pts.length >= 2 ? pts[pts.length - 2].value : null;
    const change = prev && prev > 0 ? ((rate - prev) / prev) * 100 : null;
    return { code, rate, change };
  } catch {
    return null;
  }
}

/**
 * Verilen kodlar (varsayılan: desteklenen tümü) için canlidoviz'den güncel kur
 * (son günlük kapanış) ve günlük % değişim. Her kod bağımsız; biri patlarsa
 * diğerleri döner. 10 dk cache.
 */
export async function fetchCanlidovizRates(
  codes?: string[],
): Promise<{ rates: Record<string, number>; changes: Record<string, number> }> {
  const targets = (codes ?? Object.keys(CANLIDOVIZ_RATE_IDS)).filter(
    (c) => CANLIDOVIZ_RATE_IDS[c] != null,
  );
  const end = new Date();
  const start = new Date(end.getTime() - 8 * 24 * 3600 * 1000);
  const startStr = fmtDate(start);
  const endStr = fmtDate(end);

  const results = await Promise.all(
    targets.map((code) => fetchOne(code, CANLIDOVIZ_RATE_IDS[code], startStr, endStr)),
  );

  const rates: Record<string, number> = {};
  const changes: Record<string, number> = {};
  for (const r of results) {
    if (!r) continue;
    rates[r.code] = r.rate;
    if (r.change != null) changes[r.code] = r.change;
  }
  return { rates, changes };
}

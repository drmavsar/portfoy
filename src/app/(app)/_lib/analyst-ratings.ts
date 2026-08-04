"use server";

// BIST analist tavsiye + hedef fiyat — /api/analyst-ratings (borsapy) toplu
// endpoint'i. /radar için sembol başına hedef fiyat, yükseliş potansiyeli ve
// AL/TUT/SAT dağılımı. Per-sembol /api/bist-fundamentals çok pahalı olduğundan
// bu toplu endpoint chunk'lı çekilir (bist-history ile aynı desen).

export interface AnalystRating {
  symbol: string;
  recommendation: string | null;
  target_mean: number | null;
  upside_pct: number | null;
  strong_buy: number | null;
  buy: number | null;
  hold: number | null;
  sell: number | null;
  strong_sell: number | null;
  num_analysts: number | null;
}

interface RawRating {
  symbol: string;
  recommendation?: string | null;
  target_price?: number | null;
  target_mean?: number | null;
  upside_pct?: number | null;
  strong_buy?: number | null;
  buy?: number | null;
  hold?: number | null;
  sell?: number | null;
  strong_sell?: number | null;
  num_analysts?: number | null;
}

function host(): string {
  const prodHost = process.env.VERCEL_PROJECT_PRODUCTION_URL || process.env.VERCEL_URL;
  return prodHost ? `https://${prodHost}` : "http://localhost:3000";
}

const toNum = (v: unknown): number | null =>
  typeof v === "number" && Number.isFinite(v) ? v : null;

async function fetchBatch(symbols: string[]): Promise<Record<string, RawRating>> {
  if (symbols.length === 0) return {};
  try {
    const res = await fetch(
      `${host()}/api/analyst-ratings?symbols=${encodeURIComponent(symbols.join(","))}`,
      { next: { revalidate: 21600, tags: ["analyst-ratings"] } },
    );
    if (!res.ok) return {};
    const json = (await res.json()) as { status: string; ratings?: Record<string, RawRating> };
    if (json.status !== "ok" || !json.ratings) return {};
    return json.ratings;
  } catch (err) {
    console.error("[analyst-ratings] batch error", err);
    return {};
  }
}

/** BIST sembolleri için analist tavsiye/hedef fiyat — 20'lik batch'ler paralel. */
export async function getAnalystRatings(
  symbols: string[],
): Promise<Record<string, AnalystRating>> {
  if (symbols.length === 0) return {};
  const uniq = Array.from(new Set(symbols));
  const BATCH = 20;
  const batches: string[][] = [];
  for (let i = 0; i < uniq.length; i += BATCH) batches.push(uniq.slice(i, i + BATCH));
  const results = await Promise.all(batches.map((b) => fetchBatch(b)));

  const out: Record<string, AnalystRating> = {};
  for (const chunk of results) {
    for (const [sym, r] of Object.entries(chunk)) {
      out[sym] = {
        symbol: sym,
        recommendation: r.recommendation ?? null,
        target_mean: toNum(r.target_mean ?? r.target_price),
        upside_pct: toNum(r.upside_pct),
        strong_buy: toNum(r.strong_buy),
        buy: toNum(r.buy),
        hold: toNum(r.hold),
        sell: toNum(r.sell),
        strong_sell: toNum(r.strong_sell),
        num_analysts: toNum(r.num_analysts),
      };
    }
  }
  return out;
}

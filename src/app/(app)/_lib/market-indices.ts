"use server";

// BIST endeksleri — Yahoo Finance public endpoint
// XU100.IS, XU030.IS, XBANK.IS, XGIDA.IS, XUSIN.IS, XHOLD.IS, XKMYA.IS, XULAS.IS, XMANA.IS

export interface IndexQuote {
  symbol: string;
  label: string;
  price: number;
  previous_close: number | null;
  change_pct: number | null;
  closes_1mo: number[]; // son ~22 trading day close array'i (sparkline için)
}

const BIST_INDICES: Array<{ symbol: string; label: string; group: "main" | "sector" }> = [
  { symbol: "XU100", label: "BIST 100",      group: "main" },
  { symbol: "XU030", label: "BIST 30",       group: "main" },
  { symbol: "XBANK", label: "Banka",         group: "sector" },
  { symbol: "XGIDA", label: "Gıda",          group: "sector" },
  { symbol: "XUSIN", label: "Sanayi",        group: "sector" },
  { symbol: "XHOLD", label: "Holding",       group: "sector" },
  { symbol: "XKMYA", label: "Kimya",         group: "sector" },
  { symbol: "XULAS", label: "Ulaştırma",     group: "sector" },
  { symbol: "XMANA", label: "Madencilik",    group: "sector" },
  { symbol: "XELKT", label: "Elektrik",      group: "sector" },
  { symbol: "XILTM", label: "İletişim",      group: "sector" },
  { symbol: "XTEKS", label: "Tekstil",       group: "sector" },
];

async function fetchYahoo(symbol: string): Promise<IndexQuote | null> {
  try {
    // range=1mo → previousClose hâlâ T-1; ayrıca son ~22 günün close array'i ile sparkline
    const res = await fetch(
      `https://query1.finance.yahoo.com/v8/finance/chart/${symbol}.IS?interval=1d&range=1mo`,
      {
        next: { revalidate: 600, tags: ["stock-prices"] },
        headers: { "User-Agent": "Mozilla/5.0 (compatible; MehmetsAssets/1.0)" },
      },
    );
    if (!res.ok) return null;
    const json = (await res.json()) as {
      chart?: {
        result?: Array<{
          meta?: {
            regularMarketPrice?: number;
            chartPreviousClose?: number;
            previousClose?: number;
          };
          indicators?: { quote?: Array<{ close?: Array<number | null> }> };
        }>;
      };
    };
    const r = json.chart?.result?.[0];
    const meta = r?.meta;
    if (!meta?.regularMarketPrice) return null;
    const price = meta.regularMarketPrice;
    const prev = meta.previousClose ?? meta.chartPreviousClose ?? null;
    const chg = prev ? ((price - prev) / prev) * 100 : null;
    const closes = (r?.indicators?.quote?.[0]?.close ?? [])
      .filter((x): x is number => typeof x === "number" && Number.isFinite(x));
    const item = BIST_INDICES.find((x) => x.symbol === symbol);
    return {
      symbol,
      label: item?.label ?? symbol,
      price,
      previous_close: prev,
      change_pct: chg,
      closes_1mo: closes,
    };
  } catch (err) {
    console.error("fetchYahoo index", symbol, err);
    return null;
  }
}

async function fetchBistSectorsFromPython(baseUrl?: string): Promise<IndexQuote[] | null> {
  try {
    // İlk önce relative URL (Vercel/Next.js içinde aynı host), Node fetch
    // mutlak URL ister; window olmadığı için absolute gerek.
    const host = baseUrl ?? process.env.VERCEL_URL
      ? `https://${process.env.VERCEL_URL}`
      : "http://localhost:3000";
    const res = await fetch(`${host}/api/bist-sectors`, {
      next: { revalidate: 600, tags: ["stock-prices"] },
    });
    if (!res.ok) {
      console.error(`[bist-sectors] HTTP ${res.status}`);
      return null;
    }
    const json = (await res.json()) as {
      status: string;
      sectors?: Array<{
        symbol: string;
        label?: string;
        price?: number | null;
        previous_close?: number | null;
        change_pct?: number | null;
        closes_1mo?: number[];
        error?: string;
      }>;
      message?: string;
    };
    if (json.status !== "ok" || !json.sectors) {
      console.error("[bist-sectors] error:", json.message);
      return null;
    }
    const out: IndexQuote[] = [];
    for (const s of json.sectors) {
      if (s.error || s.price == null) continue;
      out.push({
        symbol: s.symbol,
        label: s.label ?? s.symbol,
        price: s.price,
        previous_close: s.previous_close ?? null,
        change_pct: s.change_pct ?? null,
        closes_1mo: s.closes_1mo ?? [],
      });
    }
    return out;
  } catch (err) {
    console.error("[bist-sectors] fetch error", err);
    return null;
  }
}

export async function getBistIndices(): Promise<{
  main: IndexQuote[];
  sectors: IndexQuote[];
}> {
  // Ana endeksleri Yahoo'dan al
  const mainSymbols = BIST_INDICES.filter((x) => x.group === "main");
  const yahooMain = await Promise.all(mainSymbols.map((x) => fetchYahoo(x.symbol)));
  const main = yahooMain.filter((q): q is IndexQuote => !!q);

  // Sektör endekslerini Python (borsapy) endpoint'ten al
  const pythonSectors = await fetchBistSectorsFromPython();

  let sectors: IndexQuote[];
  if (pythonSectors && pythonSectors.length > 0) {
    sectors = pythonSectors.sort((a, b) => (b.change_pct ?? 0) - (a.change_pct ?? 0));
  } else {
    // Fallback: Yahoo (eksik veri olabilir, filter ile sıkı)
    const sectorSymbols = BIST_INDICES.filter((x) => x.group === "sector");
    const yahooSectors = await Promise.all(sectorSymbols.map((x) => fetchYahoo(x.symbol)));
    sectors = yahooSectors
      .filter((q): q is IndexQuote => !!q)
      .filter((q) => q.closes_1mo.length >= 5)
      .sort((a, b) => (b.change_pct ?? 0) - (a.change_pct ?? 0));
  }

  return { main, sectors };
}

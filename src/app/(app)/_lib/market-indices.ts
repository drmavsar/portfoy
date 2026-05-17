"use server";

// BIST endeksleri — Yahoo Finance public endpoint
// XU100.IS, XU030.IS, XBANK.IS, XGIDA.IS, XUSIN.IS, XHOLD.IS, XKMYA.IS, XULAS.IS, XMANA.IS

export interface IndexQuote {
  symbol: string;
  label: string;
  price: number;
  previous_close: number | null;
  change_pct: number | null;
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
    const res = await fetch(
      `https://query1.finance.yahoo.com/v8/finance/chart/${symbol}.IS?interval=1d&range=5d`,
      {
        next: { revalidate: 300 },
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
        }>;
      };
    };
    const meta = json.chart?.result?.[0]?.meta;
    if (!meta?.regularMarketPrice) return null;
    const price = meta.regularMarketPrice;
    const prev = meta.chartPreviousClose ?? meta.previousClose ?? null;
    const chg = prev ? ((price - prev) / prev) * 100 : null;
    const item = BIST_INDICES.find((x) => x.symbol === symbol);
    return {
      symbol,
      label: item?.label ?? symbol,
      price,
      previous_close: prev,
      change_pct: chg,
    };
  } catch (err) {
    console.error("fetchYahoo index", symbol, err);
    return null;
  }
}

export async function getBistIndices(): Promise<{
  main: IndexQuote[];
  sectors: IndexQuote[];
}> {
  const all = await Promise.all(BIST_INDICES.map((x) => fetchYahoo(x.symbol)));
  const valid = all.filter((q): q is IndexQuote => !!q);
  const main = valid.filter((q) => {
    const item = BIST_INDICES.find((x) => x.symbol === q.symbol);
    return item?.group === "main";
  });
  const sectors = valid
    .filter((q) => {
      const item = BIST_INDICES.find((x) => x.symbol === q.symbol);
      return item?.group === "sector";
    })
    .sort((a, b) => (b.change_pct ?? 0) - (a.change_pct ?? 0));
  return { main, sectors };
}

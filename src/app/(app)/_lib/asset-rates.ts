"use server";

// Birim fiyat çözücü — TRY cinsinden, hesap currency koduna karşı.
// Kaynaklar:
//   FX (USD/EUR/GBP/CHF/...)  → TCMB today.xml (1 saat cache)
//   XAU (gram altın)          → Yahoo XAUUSD=X × TCMB USD/TRY / 31.1035
//   BTC/ETH/SOL (kripto)      → CoinGecko simple/price (5 dk cache)

import { getTcmbRates } from "./fx-rates";

const COINGECKO_IDS: Record<string, string> = {
  BTC: "bitcoin",
  ETH: "ethereum",
  SOL: "solana",
  USDT: "tether",
  BNB: "binancecoin",
};

interface YahooMeta {
  regularMarketPrice?: number;
}

async function fetchYahooPrice(symbol: string): Promise<number | null> {
  try {
    const res = await fetch(
      `https://query1.finance.yahoo.com/v8/finance/chart/${symbol}?interval=1d&range=2d`,
      {
        next: { revalidate: 600 },
        headers: { "User-Agent": "Mozilla/5.0 (compatible; MehmetsAssets/1.0)" },
      },
    );
    if (!res.ok) return null;
    const json = (await res.json()) as { chart?: { result?: Array<{ meta?: YahooMeta }> } };
    return json.chart?.result?.[0]?.meta?.regularMarketPrice ?? null;
  } catch {
    return null;
  }
}

async function fetchCoingeckoPrices(): Promise<Record<string, number>> {
  try {
    const ids = Object.values(COINGECKO_IDS).join(",");
    const res = await fetch(
      `https://api.coingecko.com/api/v3/simple/price?ids=${ids}&vs_currencies=try`,
      { next: { revalidate: 300 } },
    );
    if (!res.ok) return {};
    const json = (await res.json()) as Record<string, { try?: number }>;
    const out: Record<string, number> = {};
    for (const [code, cgId] of Object.entries(COINGECKO_IDS)) {
      const v = json[cgId]?.try;
      if (typeof v === "number" && v > 0) out[code] = v;
    }
    return out;
  } catch {
    return {};
  }
}

/** Tüm desteklenen para birimi → TRY birim fiyat map'i. Hata durumunda eksik döner. */
export async function getAssetRates(): Promise<Record<string, number>> {
  const [fx, xauUsd, crypto] = await Promise.all([
    getTcmbRates(),
    fetchYahooPrice("XAUUSD=X"), // ons altın USD
    fetchCoingeckoPrices(),
  ]);

  const out: Record<string, number> = {};

  // FX (USD, EUR, GBP, ...)
  for (const [k, v] of Object.entries(fx)) {
    if (typeof v === "number" && v > 0) out[k] = v;
  }

  // Gram altın: ons × USD/TRY / 31.1035
  // Hesap currency 'XAU' kullanıcının balance_native'ı GRAM cinsinden
  if (xauUsd && out.USD) {
    out.XAU = (xauUsd * out.USD) / 31.1035;
  }

  // Crypto (zaten TRY)
  for (const [k, v] of Object.entries(crypto)) out[k] = v;

  return out;
}

"use server";

// Birim fiyat çözücü — TRY cinsinden, hesap currency koduna karşı.
//
// Primer kaynak: Truncgil v4 today.json
//   FX (USD/EUR/GBP/CHF/...)        → Selling
//   Türk altın türleri (gram/çeyrek/yarım/tam/cumhuriyet/ata/ons/gümüş) → Selling
//   Cache: 10 dakika
//
// Fallback'ler (Truncgil bir nedenle dönmezse):
//   FX  → TCMB today.xml
//   XAU → Yahoo XAUUSD=X × USD/TRY / 31.1035
//
// Kripto:
//   CoinGecko simple/price?vs_currencies=try (BTC/ETH/SOL/USDT/BNB), 5 dk cache

import { getTcmbRates } from "./fx-rates";

const TRUNCGIL_URL = "https://finans.truncgil.com/v4/today.json";

const COINGECKO_IDS: Record<string, string> = {
  BTC: "bitcoin",
  ETH: "ethereum",
  SOL: "solana",
  USDT: "tether",
  BNB: "binancecoin",
};

interface TruncgilEntry {
  Buying?: number | string;
  Selling?: number | string;
  Type?: string;
  Name?: string;
}

function parseNum(v: unknown): number | null {
  if (typeof v === "number" && Number.isFinite(v) && v > 0) return v;
  if (typeof v === "string") {
    const n = parseFloat(v.replace(/,/g, "."));
    return Number.isFinite(n) && n > 0 ? n : null;
  }
  return null;
}

// Truncgil anahtar alias'ları (v3 dash, v4 UPPER, varyantlar) → bizim currency code
// `normalizeKey` aşağıda anahtarı küçük-harf + non-alnum sil yaparak eşler.
const TRUNCGIL_ALIASES: Record<string, string[]> = {
  USD: ["usd"],
  EUR: ["eur"],
  GBP: ["gbp"],
  CHF: ["chf"],
  JPY: ["jpy"],
  AUD: ["aud"],
  CAD: ["cad"],
  SEK: ["sek"],
  NOK: ["nok"],
  DKK: ["dkk"],
  XAU: [
    "gramaltin",
    "gramaltn",
    "altin",
    "altn",
    "gramalt",
    "onlinegramaltin",
    "onlinegram",
    "gram",
    "saataltini",
  ],
  XAU_OZ: ["ons", "onsaltin"],
  XAG: ["gumus", "gramgumus", "xag"],
  CEYREK: ["ceyrekaltin", "ceyrekyenialtin", "ceyrekyeni", "ceyrekeskialtin"],
  YARIM: ["yarimaltin", "yarimyenialtin"],
  TAM: ["tamaltin", "tamyenialtin"],
  CUMHURIYET: ["cumhuriyetaltini", "cumhuriyetaltn", "cumhuraltin"],
  ATA: ["ataaltini", "ataaltin"],
  RESAT: ["resataltini", "resataltin"],
  BILEZIK22: ["yia", "22ayarbilezik", "ayarbilezik22"],
  BILEZIK14: ["14ayarbilezik", "ayarbilezik14"],
  BILEZIK18: ["18ayarbilezik", "ayarbilezik18"],
};

function normalizeKey(k: string): string {
  return k.toLowerCase().replace(/[^a-z0-9]/g, "");
}

async function fetchTruncgil(): Promise<Record<string, number>> {
  try {
    const res = await fetch(TRUNCGIL_URL, {
      next: { revalidate: 600 },
      headers: {
        "User-Agent": "Mozilla/5.0 (compatible; MehmetsAssets/1.0)",
        Accept: "application/json",
      },
    });
    if (!res.ok) throw new Error(`Truncgil HTTP ${res.status}`);
    const json = (await res.json()) as Record<string, unknown>;

    // Reverse lookup: normalized truncgil key → currency code
    const lookup = new Map<string, string>();
    for (const [code, aliases] of Object.entries(TRUNCGIL_ALIASES)) {
      for (const a of aliases) lookup.set(a, code);
    }

    const out: Record<string, number> = {};
    const unmatched: string[] = [];

    for (const [key, val] of Object.entries(json)) {
      if (typeof val !== "object" || val === null) continue;
      const e = val as TruncgilEntry;
      const selling = parseNum(e.Selling) ?? parseNum(e.Buying);
      if (selling == null) continue;

      const code = lookup.get(normalizeKey(key));
      if (code) out[code] = selling;
      else unmatched.push(key);
    }

    if (unmatched.length > 0) {
      console.log("[truncgil] eşleşmeyen key'ler (tüm):", unmatched.join(", "));
    }

    if (Object.keys(out).length === 0) throw new Error("Truncgil boş yanıt");
    return out;
  } catch (err) {
    console.error("fetchTruncgil error", err);
    return {};
  }
}

async function fetchYahooXauUsd(): Promise<number | null> {
  try {
    const res = await fetch(
      "https://query1.finance.yahoo.com/v8/finance/chart/XAUUSD=X?interval=1d&range=2d",
      {
        next: { revalidate: 600 },
        headers: { "User-Agent": "Mozilla/5.0 (compatible; MehmetsAssets/1.0)" },
      },
    );
    if (!res.ok) return null;
    const json = (await res.json()) as {
      chart?: { result?: Array<{ meta?: { regularMarketPrice?: number } }> };
    };
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

export interface FxTicker {
  symbol: string;
  label: string;
  price: number;
  chgPct: number | null;
}

/** Topbar canlı şerit için: USD/EUR/GBP + gram altın. Truncgil'den günlük değişim de gelir. */
export async function getFxTickers(): Promise<FxTicker[]> {
  try {
    const res = await fetch(TRUNCGIL_URL, {
      next: { revalidate: 600 },
      headers: {
        "User-Agent": "Mozilla/5.0 (compatible; MehmetsAssets/1.0)",
        Accept: "application/json",
      },
    });
    if (!res.ok) throw new Error(`Truncgil HTTP ${res.status}`);
    const json = (await res.json()) as Record<string, unknown>;

    const pickPct = (raw: unknown): number | null => {
      if (typeof raw !== "string") return null;
      const m = raw.replace("%", "").replace(",", ".").trim();
      const n = parseFloat(m);
      return Number.isFinite(n) ? n : null;
    };

    const extract = (key: string, label: string): FxTicker | null => {
      const entry = json[key];
      if (typeof entry !== "object" || entry === null) return null;
      const e = entry as TruncgilEntry & { Change?: string };
      const price = parseNum(e.Selling) ?? parseNum(e.Buying);
      if (price == null) return null;
      return { symbol: label, label, price, chgPct: pickPct(e.Change) };
    };

    const out: FxTicker[] = [];
    const usd = extract("USD", "USD/TRY"); if (usd) out.push(usd);
    const eur = extract("EUR", "EUR/TRY"); if (eur) out.push(eur);
    const xau = extract("gram-altin", "GRAM ALTIN"); if (xau) out.push(xau);

    // BIST100 — Yahoo Finance XU100.IS
    const bist = await fetchBist100();
    if (bist) out.push(bist);

    return out;
  } catch (err) {
    console.error("getFxTickers error", err);
    return [];
  }
}

async function fetchBist100(): Promise<FxTicker | null> {
  try {
    const res = await fetch(
      "https://query1.finance.yahoo.com/v8/finance/chart/XU100.IS?interval=1d&range=2d",
      {
        next: { revalidate: 300 },
        headers: { "User-Agent": "Mozilla/5.0 (compatible; MehmetsAssets/1.0)" },
      },
    );
    if (!res.ok) return null;
    const json = (await res.json()) as {
      chart?: {
        result?: Array<{
          meta?: { regularMarketPrice?: number; chartPreviousClose?: number; previousClose?: number };
        }>;
      };
    };
    const meta = json.chart?.result?.[0]?.meta;
    if (!meta?.regularMarketPrice) return null;
    const price = meta.regularMarketPrice;
    const prev = meta.chartPreviousClose ?? meta.previousClose ?? null;
    const chg = prev ? ((price - prev) / prev) * 100 : null;
    return { symbol: "BIST100", label: "BIST 100", price, chgPct: chg };
  } catch {
    return null;
  }
}

/** Tüm desteklenen para birimi → TRY birim fiyat map'i. */
export async function getAssetRates(): Promise<Record<string, number>> {
  const [truncgil, fxFallback, crypto] = await Promise.all([
    fetchTruncgil(),
    getTcmbRates(),
    fetchCoingeckoPrices(),
  ]);

  const out: Record<string, number> = {};

  // 1) TCMB FX fallback
  for (const [k, v] of Object.entries(fxFallback)) {
    if (typeof v === "number" && v > 0) out[k] = v;
  }

  // 2) Truncgil — FX'i override eder, altın türlerini ekler
  for (const [k, v] of Object.entries(truncgil)) out[k] = v;

  // 3) XAU yoksa Yahoo fallback (ons × USD/TRY / 31.1035)
  if (out.XAU == null) {
    const xauUsd = await fetchYahooXauUsd();
    if (xauUsd && out.USD) out.XAU = (xauUsd * out.USD) / 31.1035;
  }

  // 4) Kripto
  for (const [k, v] of Object.entries(crypto)) out[k] = v;

  return out;
}

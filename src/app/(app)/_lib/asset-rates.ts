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
  RUB: ["rub"],
  AED: ["aed"],
  SAR: ["sar"],
  KWD: ["kwd"],
  GEL: ["gel"],
  TND: ["tnd"],
  BGN: ["bgn"],
  XAU: ["gra", "has", "gramaltin", "onlinegramaltin"],
  XAU_OZ: ["ons", "onsaltin"],
  XAG: ["gumus", "gramgumus", "xag"],
  CEYREK: ["ceyrekaltin", "ceyrekyenialtin", "ceyrekyeni", "ceyrekeskialtin"],
  YARIM: ["yarimaltin", "yarimyenialtin"],
  TAM: ["tamaltin", "tamyenialtin"],
  CUMHURIYET: ["cumhuriyetaltini", "cumhuriyetaltn", "cumhuraltin"],
  ATA: ["ataaltini", "ataaltin"],
  RESAT: ["resataltini", "resataltin"],
  BILEZIK22: ["yia", "22ayarbilezik", "ayarbilezik22", "22ayaraltin"],
  BILEZIK14: ["14ayarbilezik", "ayarbilezik14", "14ayaraltin"],
  BILEZIK18: ["18ayarbilezik", "ayarbilezik18", "18ayaraltin"],
};

function normalizeKey(k: string): string {
  return k.toLowerCase().replace(/[^a-z0-9]/g, "");
}

async function fetchTruncgil(): Promise<Record<string, number>> {
  try {
    const res = await fetch(TRUNCGIL_URL, {
      next: { revalidate: 300, tags: ["asset-rates"] },
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

    for (const [key, val] of Object.entries(json)) {
      if (typeof val !== "object" || val === null) continue;
      const e = val as TruncgilEntry;
      const selling = parseNum(e.Selling) ?? parseNum(e.Buying);
      if (selling == null) continue;

      const code = lookup.get(normalizeKey(key));
      if (code) out[code] = selling;
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
        next: { revalidate: 300, tags: ["asset-rates"] },
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
      next: { revalidate: 300, tags: ["asset-rates"] },
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

/** Truncgil yanıtının Update_Date alanı (string olarak: '17-05-2026 10:30' veya ISO). */
export async function getTruncgilUpdateDate(): Promise<string | null> {
  try {
    const res = await fetch(TRUNCGIL_URL, {
      next: { revalidate: 300, tags: ["asset-rates"] },
      headers: {
        "User-Agent": "Mozilla/5.0 (compatible; MehmetsAssets/1.0)",
        Accept: "application/json",
      },
    });
    if (!res.ok) return null;
    const json = (await res.json()) as Record<string, unknown>;
    const ud = json.Update_Date ?? json.update_date ?? json.updateDate;
    return typeof ud === "string" ? ud : null;
  } catch {
    return null;
  }
}

/** Currency → günlük % değişim (sadece Truncgil + CoinGecko 24h). */
export async function getAssetChanges(): Promise<Record<string, number>> {
  try {
    const res = await fetch(TRUNCGIL_URL, {
      next: { revalidate: 300, tags: ["asset-rates"] },
      headers: {
        "User-Agent": "Mozilla/5.0 (compatible; MehmetsAssets/1.0)",
        Accept: "application/json",
      },
    });
    if (!res.ok) return {};
    const json = (await res.json()) as Record<string, unknown>;

    const lookup = new Map<string, string>();
    for (const [code, aliases] of Object.entries(TRUNCGIL_ALIASES)) {
      for (const a of aliases) lookup.set(a, code);
    }

    const out: Record<string, number> = {};
    for (const [key, val] of Object.entries(json)) {
      if (typeof val !== "object" || val === null) continue;
      const e = val as TruncgilEntry & { Change?: number | string };
      let chg: number | null = null;
      if (typeof e.Change === "number" && Number.isFinite(e.Change)) chg = e.Change;
      else if (typeof e.Change === "string") {
        const n = parseFloat(e.Change.replace("%", "").replace(",", "."));
        if (Number.isFinite(n)) chg = n;
      }
      if (chg == null) continue;
      const code = lookup.get(normalizeKey(key));
      if (code) out[code] = chg;
    }
    return out;
  } catch {
    return {};
  }
}

/** Persist edilen kur/altın snapshot'u DB'den oku — kaynaklar fail ederse fallback. */
async function loadFallbackRates(): Promise<Record<string, number>> {
  try {
    const { createClient } = await import("@/lib/supabase/server");
    const supabase = await createClient();
    const { data } = await supabase
      .from("rate_snapshots")
      .select("rates")
      .eq("id", 1)
      .maybeSingle();
    if (data && typeof data === "object" && data !== null && "rates" in data) {
      const r = (data as { rates?: unknown }).rates;
      if (r && typeof r === "object") return r as Record<string, number>;
    }
  } catch {
    /* Supabase yoksa veya migration çalışmamışsa sessizce geç */
  }
  return {};
}

/** Başarılı fetch sonrası DB'ye snapshot yaz — bir sonraki failde fallback kaynak. */
async function persistRates(rates: Record<string, number>): Promise<void> {
  try {
    const { createClient } = await import("@/lib/supabase/server");
    const supabase = await createClient();
    await supabase
      .from("rate_snapshots")
      .upsert(
        { id: 1, rates, updated_at: new Date().toISOString() } as never,
        { onConflict: "id" },
      );
  } catch {
    /* sessizce yut */
  }
}

const EXPECTED_KEYS = [
  "USD", "EUR", "GBP", "CHF", "JPY", "AUD", "CAD",
  "XAU", "XAG", "CEYREK", "YARIM", "TAM", "CUMHURIYET",
  "ATA", "RESAT", "BILEZIK14", "BILEZIK18", "BILEZIK22",
  "BTC", "ETH", "SOL", "USDT", "BNB",
] as const;

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

  // 5) Eksik kalanları DB'deki son iyi snapshot'tan doldur
  const missing = EXPECTED_KEYS.filter((k) => out[k] == null);
  if (missing.length > 0) {
    const fallback = await loadFallbackRates();
    for (const k of missing) {
      if (fallback[k] != null && fallback[k] > 0) out[k] = fallback[k];
    }
  }

  // 6) Sağlıklı bir response yakaladıysak (USD + XAU varsa) snapshot'u güncelle
  if (out.USD && out.XAU) {
    // fire-and-forget; render'ı bloklamasın
    void persistRates(out);
  }

  return out;
}

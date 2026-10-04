"use server";

// Birim fiyat çözücü — TRY cinsinden, hesap currency koduna karşı.
//
// Altın türlerinde (gram/çeyrek/yarım/tam/cumhuriyet/ata/gümüş/ons) BİRİNCİL
// kaynak canlidoviz'dir; Truncgil bu türleri ezmez (Truncgil coin primleri
// canlidoviz'den ~%1,5-2,5 yüksekti ve kullanıcı canlidoviz'i referans alıyor).
// Bilezik (22/18/14 ayar) canlidoviz gram altınından türetilir (canlidoviz'de
// ayrı kalem yok; Truncgil bilezik primi canlidoviz gram referansıyla ~%0,8
// sapıyordu). Truncgil yalnızca reşat + canlidoviz'in düştüğü boşlukları doldurur
// ve FX'i override eder.
//   FX  → Truncgil Selling (override) · taban canlidoviz · son çare TCMB
//   Altın → canlidoviz (satış) · boşluk için Truncgil · gram yoksa Yahoo XAUUSD
//   Ons (XAU_OZ) → gram × 31.1035 (türetilir; ham ons değerleri tutarsızdı)
//   Bilezik → canlidoviz gram × (ayar/24) × işçilik primi (canlidoviz kalibreli)
//   Cache: 10 dakika
//
// Kripto:
//   CoinGecko simple/price?vs_currencies=try (BTC/ETH/SOL/USDT/BNB), 5 dk cache

import { getTcmbRates } from "./fx-rates";
import { normalizeTruncgilDate } from "@/lib/finance/truncgil-date";
import { fetchCanlidovizRates } from "./canlidoviz-rates";
import { fetchTradingViewQuotes } from "./tradingview-quotes";
import { BILEZIK_ISCILIK, bidRatiosFromQuotes, type BidAskQuote } from "@/lib/finance/liquidation";

const TRUNCGIL_URL = "https://finans.truncgil.com/v4/today.json";

/** Fiyatı canlidoviz'den gelen altın türleri — Truncgil bunları ezmez. */
const CANLI_GOLD = new Set([
  "XAU", "XAG", "XAU_OZ", "CEYREK", "YARIM", "TAM", "CUMHURIYET", "ATA",
]);
/** canlidoviz gram altından türetilen kodlar (aynı % değişime sahip). */
const DERIVED_FROM_GRAM = ["XAU_OZ", "BILEZIK22", "BILEZIK18", "BILEZIK14"] as const;

const COINGECKO_URL = (ids: string) =>
  `https://api.coingecko.com/api/v3/simple/price?ids=${ids}&vs_currencies=try&include_24hr_change=true`;

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

/** Truncgil satış fiyatları (değerleme kaynağı). */
async function fetchTruncgil(): Promise<Record<string, number>> {
  const quotes = await fetchTruncgilQuotes();
  const out: Record<string, number> = {};
  for (const [code, q] of Object.entries(quotes)) out[code] = q.selling;
  return out;
}

/** Truncgil alış + satış (aynı istek; fetch önbelleği paylaşılır). */
async function fetchTruncgilQuotes(): Promise<Record<string, BidAskQuote>> {
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

    const out: Record<string, BidAskQuote> = {};

    for (const [key, val] of Object.entries(json)) {
      if (typeof val !== "object" || val === null) continue;
      const e = val as TruncgilEntry;
      const buying = parseNum(e.Buying);
      const selling = parseNum(e.Selling) ?? buying;
      if (selling == null) continue;

      const code = lookup.get(normalizeKey(key));
      if (code) out[code] = { buying: parseNum(e.Selling) != null ? buying : null, selling };
    }

    if (Object.keys(out).length === 0) throw new Error("Truncgil boş yanıt");
    return out;
  } catch (err) {
    console.error("fetchTruncgil error", err);
    return {};
  }
}

/**
 * Bozdurma oranları (alış / satış) — Truncgil kotasyonlarından. Uygulamadaki
 * değer × oran = bozdurulursa eline geçecek tutar. Truncgil düşerse boş döner
 * (bozdurma değeri "makas verisi yok" gösterilir; tahmini makas uydurulmaz).
 */
export async function getAssetBidRatios(): Promise<Record<string, number>> {
  return bidRatiosFromQuotes(await fetchTruncgilQuotes());
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
    const res = await fetch(COINGECKO_URL(ids), {
      next: { revalidate: 300, tags: ["asset-rates"] },
    });
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

/** CoinGecko 24 saatlik % değişim (fiyatla aynı istek — fetch önbelleği paylaşılır). */
async function fetchCoingeckoChanges(): Promise<Record<string, number>> {
  try {
    const ids = Object.values(COINGECKO_IDS).join(",");
    const res = await fetch(COINGECKO_URL(ids), {
      next: { revalidate: 300, tags: ["asset-rates"] },
    });
    if (!res.ok) return {};
    const json = (await res.json()) as Record<string, { try_24h_change?: number }>;
    const out: Record<string, number> = {};
    for (const [code, cgId] of Object.entries(COINGECKO_IDS)) {
      const v = json[cgId]?.try_24h_change;
      if (typeof v === "number" && Number.isFinite(v)) out[code] = v;
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

/**
 * Topbar canlı şerit: USD/EUR + gram altın + BIST 100.
 *
 * Kur/değişim kanonik hibrit kaynaklardan gelir (getAssetRates + getAssetChanges
 * = Truncgil canlı + canlidoviz güvenilir fallback), böylece şerit uygulamanın
 * geri kalanıyla tutarlı ve Truncgil düşse de dolu kalır. BIST 100 TradingView'den
 * (Yahoo'nun BIST'te eksik-mum/429 sorunu vardı).
 */
export async function getFxTickers(): Promise<FxTicker[]> {
  try {
    const [rates, changes, tv] = await Promise.all([
      getAssetRates(),
      getAssetChanges(),
      fetchTradingViewQuotes(["XU100"]),
    ]);

    const out: FxTicker[] = [];
    const push = (code: string, label: string) => {
      const price = rates[code];
      if (typeof price === "number" && price > 0) {
        out.push({ symbol: label, label, price, chgPct: changes[code] ?? null });
      }
    };
    push("USD", "USD/TRY");
    push("EUR", "EUR/TRY");
    push("XAU", "GRAM ALTIN");

    const xu = tv["XU100"];
    if (xu) out.push({ symbol: "BIST100", label: "BIST 100", price: xu.close, chgPct: xu.changePct });

    return out;
  } catch (err) {
    console.error("getFxTickers error", err);
    return [];
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
    return typeof ud === "string" ? normalizeTruncgilDate(ud) : null;
  } catch {
    return null;
  }
}


/**
 * Currency → günlük % değişim.
 *
 * Taban: canlidoviz (FX + altın; güvenilir, son iki günlük kapanıştan hesaplanır).
 * Truncgil canlı (intraday) değişimi döndürdüğünde onun üzerine yazılır — böylece
 * Truncgil çalışırken taze intraday değişim, düştüğünde canlidoviz'in güvenilir
 * günlük değişimi gösterilir (eskiden Truncgil boşsa altın/döviz "+0" kalıyordu).
 */
export async function getAssetChanges(): Promise<Record<string, number>> {
  // Kural: günlük değişim, FİYATIN geldiği kaynaktan gelir (getAssetRates ile
  // aynı öncelik). Eskiden Truncgil değişimi altın türlerinde de canlidoviz'in
  // üstüne yazıyordu → fiyat canlidoviz, değişim Truncgil (tutarsız); bilezik
  // ve ons değişimi Truncgil düşünce tamamen kayboluyordu.

  // 1) Güvenilir taban — canlidoviz
  let out: Record<string, number> = {};
  try {
    const { changes } = await fetchCanlidovizRates();
    out = { ...changes };
  } catch {
    /* canlidoviz başarısızsa Truncgil'e düş */
  }
  const canliChanges = { ...out };

  // 2) Truncgil intraday değişimi — FX'te taban üzerine yazar (FX fiyatı
  //    Truncgil'den); fiyatı canlidoviz'den gelen altınlarda yazmaz.
  try {
    const res = await fetch(TRUNCGIL_URL, {
      next: { revalidate: 300, tags: ["asset-rates"] },
      headers: {
        "User-Agent": "Mozilla/5.0 (compatible; MehmetsAssets/1.0)",
        Accept: "application/json",
      },
    });
    if (res.ok) {
      const json = (await res.json()) as Record<string, unknown>;
      const lookup = new Map<string, string>();
      for (const [code, aliases] of Object.entries(TRUNCGIL_ALIASES)) {
        for (const a of aliases) lookup.set(a, code);
      }
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
        if (!code) continue;
        if (CANLI_GOLD.has(code) && typeof canliChanges[code] === "number") continue;
        out[code] = chg;
      }
    }
  } catch {
    /* Truncgil başarısızsa canlidoviz tabanı kalır */
  }

  // 3) Gramdan türetilen kodlar (ons = gram × 31.1035, bilezik = gram × ayar
  //    × işçilik) gramla aynı % değişime sahiptir — fiyatla tutarlı.
  if (typeof canliChanges.XAU === "number") {
    for (const code of DERIVED_FROM_GRAM) out[code] = canliChanges.XAU;
  }

  // 4) Kripto — CoinGecko 24 saatlik değişim (eskiden hiç yoktu → "Bugün" 0).
  Object.assign(out, await fetchCoingeckoChanges());

  return out;
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

/** Sanity check: dönen rate'ler "rezonable" aralıkta mı?
 *  Truncgil bir kez veri kirletirse rate_snapshots'a yanlış değer yazılmasın.
 *  Eşikler 2026 piyasa şartlarına göre kabaca konuldu. */
function ratesLookSane(rates: Record<string, number>): boolean {
  const checks: Array<[string, number, number]> = [
    ["USD", 10, 200],
    ["EUR", 10, 250],
    ["XAU", 1000, 50_000],     // gram altın TL
    ["CEYREK", 3000, 200_000], // çeyrek altın TL
    ["BTC", 100_000, 50_000_000],
    // JPY tek yen başına (TCMB 100 yen kotar) — 100× hata snapshot'a yazılmasın
    ["JPY", 0.05, 5],
  ];
  for (const [k, lo, hi] of checks) {
    const v = rates[k];
    if (v == null) continue; // değer yoksa kontrol atla (partial OK)
    if (!Number.isFinite(v) || v < lo || v > hi) {
      console.warn(`[asset-rates] sanity failed for ${k}: ${v} (range ${lo}-${hi})`);
      return false;
    }
  }
  // EUR > USD invariant (genelde)
  if (rates.EUR && rates.USD && rates.EUR < rates.USD * 0.9) {
    console.warn(`[asset-rates] EUR(${rates.EUR}) < USD(${rates.USD}) — şüpheli`);
    return false;
  }
  return true;
}

/** Başarılı fetch sonrası DB'ye snapshot yaz — bir sonraki failde fallback kaynak. */
async function persistRates(rates: Record<string, number>): Promise<void> {
  if (!ratesLookSane(rates)) {
    console.warn("[asset-rates] sanity check failed, snapshot persist atlandı");
    return;
  }
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
  const [truncgil, fxFallback, crypto, canli] = await Promise.all([
    fetchTruncgil(),
    getTcmbRates(),
    fetchCoingeckoPrices(),
    fetchCanlidovizRates().catch(
      () => ({ rates: {} as Record<string, number>, changes: {} as Record<string, number> }),
    ),
  ]);

  const out: Record<string, number> = {};

  // 1) TCMB FX fallback
  for (const [k, v] of Object.entries(fxFallback)) {
    if (typeof v === "number" && v > 0) out[k] = v;
  }

  // 1.5) canlidoviz — FX + altın (güvenilir günlük kapanış). Truncgil canlıysa
  //      bir sonraki adımda bunun üzerine yazar; Truncgil düştüğünde bu kalır.
  for (const [k, v] of Object.entries(canli.rates)) {
    if (typeof v === "number" && v > 0) out[k] = v;
  }

  // 2) Truncgil — FX'i override eder; ancak ALTIN türlerinde canlidoviz değeri
  //    varsa onu EZMEZ. (Truncgil coin primleri canlidoviz serbest piyasadan
  //    ~%1,5-2,5 yüksek geliyordu; kullanıcı canlidoviz'i referans alıyor.)
  //    Truncgil yalnızca canlidoviz'in vermediği altınları doldurur — reşat ve
  //    (canlidoviz gram düşerse) bilezik — artı FX override. Bilezik canlidoviz
  //    gram varken 2.6'da türetilir (Truncgil bilezik değeri ezilir).
  for (const [k, v] of Object.entries(truncgil)) {
    if (CANLI_GOLD.has(k) && typeof canli.rates[k] === "number" && canli.rates[k] > 0) {
      continue; // canlidoviz altın değeri korunur (Truncgil ezmez)
    }
    out[k] = v;
  }

  // 2.5) Ons altın (XAU_OZ) = gram × 31.1035. canlidoviz item 81 ve Truncgil'in
  //      ons değerleri tutarsız (gerçeğin ~yarısı) geliyordu; ons uluslararası
  //      1 troy ons = 31.1035 gram olduğundan gramdan türetmek en sağlamı.
  if (typeof out.XAU === "number" && out.XAU > 0) {
    out.XAU_OZ = out.XAU * 31.1035;
  }

  // 2.6) Bilezik (22/18/14 ayar) — canlidoviz'de ayrı kalem YOK. Truncgil bilezik
  //      kotasyonu canlidoviz gram referansıyla ~%0,8 sapıyordu (kullanıcı
  //      canlidoviz'i baz alıyor). canlidoviz gram altın satışından türet:
  //        bilezik = gram × (ayar/24) × işçilik primi
  //      (ayar/24 = has altın içeriği; işçilik primi işleme/etiket farkı).
  //      İşçilik primi canlidoviz "22 ayar bilezik / gram altın" oranından
  //      kalibre edildi (≈0,9403 / (22/24) ≈ 1,0258); 18/14 ayar aynı primi
  //      kullanır. Böylece bilezik gram ile birlikte hareket eder ve tek
  //      kaynaktan (canlidoviz) türer. canlidoviz gram yoksa yukarıdaki Truncgil
  //      bilezik değeri korunur.
  const canliGram = canli.rates.XAU;
  if (typeof canliGram === "number" && canliGram > 0) {
    // canlidoviz bilezik primi (22 ayar kalibrasyonu)
    out.BILEZIK22 = canliGram * (22 / 24) * BILEZIK_ISCILIK;
    out.BILEZIK18 = canliGram * (18 / 24) * BILEZIK_ISCILIK;
    out.BILEZIK14 = canliGram * (14 / 24) * BILEZIK_ISCILIK;
  }

  // 3) XAU yoksa Yahoo fallback (ons × USD/TRY / 31.1035)
  if (out.XAU == null) {
    const xauUsd = await fetchYahooXauUsd();
    if (xauUsd && out.USD) {
      out.XAU = (xauUsd * out.USD) / 31.1035;
      out.XAU_OZ = xauUsd * out.USD; // ons doğrudan
    }
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

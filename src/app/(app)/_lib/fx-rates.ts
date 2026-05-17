"use server";

// TCMB günlük döviz kurları (Forex Selling — vatandaş satış)
// XML kaynağı: https://www.tcmb.gov.tr/kurlar/today.xml
// Next.js fetch cache 1 saat (TCMB günde bir kez ~15:30 günceller).

const TCMB_URL = "https://www.tcmb.gov.tr/kurlar/today.xml";

interface RateMap {
  USD?: number;
  EUR?: number;
  GBP?: number;
  CHF?: number;
  JPY?: number;
  AUD?: number;
  CAD?: number;
  [key: string]: number | undefined;
}

let lastSuccess: { ts: number; data: RateMap } | null = null;

export async function getTcmbRates(): Promise<RateMap> {
  try {
    const res = await fetch(TCMB_URL, {
      next: { revalidate: 3600 },
      headers: { "User-Agent": "MehmetsAssets/1.0" },
    });
    if (!res.ok) throw new Error(`TCMB HTTP ${res.status}`);
    const xml = await res.text();

    const out: RateMap = {};
    // <Currency ... Kod="USD" ...><ForexSelling>38.9234</ForexSelling></Currency>
    const re = /<Currency[^>]+Kod="([A-Z]{3})"[\s\S]*?<ForexSelling>([\d.]+)<\/ForexSelling>[\s\S]*?<\/Currency>/g;
    let m: RegExpExecArray | null;
    while ((m = re.exec(xml)) !== null) {
      const code = m[1];
      const rate = parseFloat(m[2]);
      if (Number.isFinite(rate) && rate > 0) out[code] = rate;
    }

    if (Object.keys(out).length === 0) throw new Error("TCMB XML parse boş");

    lastSuccess = { ts: Date.now(), data: out };
    return out;
  } catch (err) {
    console.error("getTcmbRates error", err);
    // Eski başarılı veri varsa onu döndür
    if (lastSuccess) return lastSuccess.data;
    return {};
  }
}

/** Belirli bir para birimi için TRY karşılığını döndür. Bilinmiyorsa null. */
export async function getTryRate(currency: string): Promise<number | null> {
  if (currency === "TRY") return 1;
  const rates = await getTcmbRates();
  return rates[currency] ?? null;
}

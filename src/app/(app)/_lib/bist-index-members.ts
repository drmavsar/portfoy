"use server";

// BIST endeks üye listeleri — Borsa İstanbul public CSV
// Sandbox'tan test edemediğimiz için Vercel logs'ta hata sebebi yazılır.

const CSV_URLS = [
  "https://www.borsaistanbul.com/datum/hisse_endeks_ds.csv",
  "https://borsaistanbul.com/datum/hisse_endeks_ds.csv",
];

// CSV çekilemezse son çare statik liste (Mayıs 2026 yaklaşık BIST 100).
// Gerçek üye değişikliğinde 1-2 sembol fark edebilir; CSV başarılı olunca
// otomatik güncel veri kullanılır.
const BIST_100_FALLBACK = [
  "AEFES", "AGHOL", "AKBNK", "AKFGY", "AKFYE", "AKSEN", "AKSA", "ALARK", "ALBRK",
  "ANSGR", "ARCLK", "ASELS", "ASTOR", "AYDEM", "BERA", "BIMAS", "BIENY",
  "BRSAN", "BRYAT", "CANTE", "CCOLA", "CIMSA", "DOAS", "DOHOL", "ECILC",
  "EGEEN", "EKGYO", "ENERY", "ENJSA", "ENKAI", "EREGL", "EUPWR", "FROTO",
  "GARAN", "GESAN", "GLYHO", "GUBRF", "HALKB", "HEKTS", "ISCTR", "ISDMR",
  "ISGYO", "ISMEN", "IZMDC", "KCAER", "KCHOL", "KLKIM", "KMPUR", "KONTR",
  "KONYA", "KORDS", "KOZAL", "KOZAA", "KRDMD", "MAVI", "MGROS", "MIATK",
  "MPARK", "ODAS", "OTKAR", "OYAKC", "PETKM", "PGSUS", "PSGYO", "QUAGR",
  "REEDR", "SAHOL", "SASA", "SISE", "SKBNK", "SMRTG", "SNGYO", "TAVHL",
  "TCELL", "THYAO", "TKFEN", "TOASO", "TRGYO", "TSKB", "TTKOM", "TTRAK",
  "TUKAS", "TUPRS", "ULKER", "VAKBN", "VESBE", "VESTL", "YKBNK", "YEOTK",
  "ZOREN", "TURSG", "PEKGY", "AKCNS", "ALCTL", "AHGAZ", "BTCIM", "GENIL",
  "JANTS", "KZBGY", "TABGD", "AGESA", "ENERY",
];

export interface IndexMember {
  index_code: string;
  index_name: string;
  symbol: string;
  name: string;
}

let lastSuccess: { ts: number; data: IndexMember[] } | null = null;

async function tryFetch(url: string): Promise<string | null> {
  try {
    const res = await fetch(url, {
      next: { revalidate: 3600 },
      headers: {
        // Tarayıcı taklidi — Borsa İstanbul bot-block uygulayabiliyor
        "User-Agent":
          "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0 Safari/537.36",
        Accept: "text/csv,text/plain,*/*",
        "Accept-Language": "tr-TR,tr;q=0.9,en;q=0.8",
      },
    });
    if (!res.ok) {
      console.error(`[bist-csv] ${url} → HTTP ${res.status}`);
      return null;
    }
    return await res.text();
  } catch (err) {
    console.error(`[bist-csv] ${url} → fetch error:`, err);
    return null;
  }
}

export async function getBistIndexMembers(): Promise<IndexMember[]> {
  for (const url of CSV_URLS) {
    const text = await tryFetch(url);
    if (!text) continue;
    try {
      const lines = text.split(/\r?\n/).filter((l) => l.trim().length > 0);
      if (lines.length < 2) {
        console.error("[bist-csv] CSV satır sayısı yetersiz:", lines.length);
        continue;
      }
      const sep = lines[0].includes(";") ? ";" : ",";
      const out: IndexMember[] = [];
      for (let i = 1; i < lines.length; i++) {
        const cols = lines[i].split(sep).map((c) => c.trim().replace(/^"|"$/g, ""));
        if (cols.length < 4) continue;
        const [index_name, index_code, symbol, name] = cols;
        if (!symbol || !index_code) continue;
        out.push({ index_code, index_name, symbol, name });
      }
      if (out.length > 0) {
        lastSuccess = { ts: Date.now(), data: out };
        return out;
      }
    } catch (err) {
      console.error("[bist-csv] parse error:", err);
    }
  }
  if (lastSuccess) {
    console.log("[bist-csv] fallback: önceki başarılı yanıt");
    return lastSuccess.data;
  }
  // Statik fallback — yaklaşık BIST 100 listesi
  console.log("[bist-csv] fallback: statik BIST 100 listesi (~100 sembol)");
  return BIST_100_FALLBACK.map((s) => ({
    index_code: "XK100",
    index_name: "BIST 100",
    symbol: s,
    name: s,
  }));
}

export async function getXK100Symbols(): Promise<string[]> {
  const all = await getBistIndexMembers();
  const filtered = all
    .filter((m) => {
      const code = (m.index_code ?? "").toUpperCase();
      const name = (m.index_name ?? "").toUpperCase();
      return (
        code.includes("XK100") ||
        code.includes("XU100") ||
        name.includes("BIST 100") ||
        name.includes("BIST100") ||
        name.includes("BİST 100")
      );
    })
    .map((m) => m.symbol)
    .filter(Boolean);
  const uniq = Array.from(new Set(filtered));
  if (uniq.length > 0) return uniq;
  // CSV var ama filter sıfır → statik liste son çare
  console.log("[bist-csv] filter sıfır eşleşti, statik liste kullanılıyor");
  return BIST_100_FALLBACK;
}

// /temel yan sekmeleri için hafif ek veri — ortaklık yapısı + haber akışı.
// Çağrı TARAYICIDAN yapılır (fundamentals.ts ile aynı gerekçe: sunucu→sunucu
// istek Vercel Deployment Protection'a takılıp 401 dönüyor).
//
// Bu veri, core /api/bist-fundamentals'tan AYRI (?mode=extra) çekilir çünkü
// major_holders + news çağrıları yavaş; core payload'a eklendiğinde 60s
// serverless sınırını aşıp HTTP 504'e yol açıyordu. Ayrı ve non-blocking
// olduğu için yavaş/başarısız olsa bile core temel analiz sayfasını bozmaz.

export interface Holder {
  name: string;
  pct: number | null;
}

export interface NewsItem {
  date: string | null;
  title: string;
  url: string | null;
}

export interface FundamentalsExtra {
  holders: Holder[];
  news: NewsItem[];
}

const EMPTY: FundamentalsExtra = { holders: [], news: [] };

export async function fetchFundamentalsExtra(symbol: string): Promise<FundamentalsExtra> {
  const clean = symbol.trim().toUpperCase().replace(/[^A-Z0-9]/g, "").slice(0, 12);
  if (!clean) return EMPTY;
  try {
    const res = await fetch(`/api/bist-fundamentals?symbol=${encodeURIComponent(clean)}&mode=extra`);
    if (!res.ok) return EMPTY;
    const json = (await res.json()) as {
      ok?: boolean;
      holders?: Holder[];
      news?: NewsItem[];
    };
    if (!json || json.ok !== true) return EMPTY;
    return { holders: json.holders ?? [], news: json.news ?? [] };
  } catch {
    return EMPTY;
  }
}

"use server";

// BIST endeks üye listeleri — Borsa İstanbul public CSV
// URL: https://www.borsaistanbul.com/datum/hisse_endeks_ds.csv
//
// Format örneği (semicolon separated):
//   ENDEKS;ENDEKS_KOD;SEMBOL;SEMBOL_ADI
//   BIST 100;XK100;AKBNK;AKBANK
//   ...
// Cache: 1 saat (üye listesi haftalık değişir).

const CSV_URL = "https://www.borsaistanbul.com/datum/hisse_endeks_ds.csv";

export interface IndexMember {
  index_code: string; // XK100, XU030, vs.
  index_name: string;
  symbol: string;
  name: string;
}

let lastSuccess: { ts: number; data: IndexMember[] } | null = null;

export async function getBistIndexMembers(): Promise<IndexMember[]> {
  try {
    const res = await fetch(CSV_URL, {
      next: { revalidate: 3600 },
      headers: {
        "User-Agent": "Mozilla/5.0 (compatible; MehmetsAssets/1.0)",
        Accept: "text/csv,text/plain",
      },
    });
    if (!res.ok) throw new Error(`BIST CSV HTTP ${res.status}`);
    const text = await res.text();
    const lines = text.split(/\r?\n/).filter((l) => l.trim().length > 0);
    if (lines.length < 2) throw new Error("BIST CSV boş");

    // Header'ı atla. Separator semicolon veya comma olabilir, auto-detect.
    const sep = lines[0].includes(";") ? ";" : ",";
    const out: IndexMember[] = [];
    for (let i = 1; i < lines.length; i++) {
      const cols = lines[i].split(sep).map((c) => c.trim().replace(/^"|"$/g, ""));
      if (cols.length < 4) continue;
      const [index_name, index_code, symbol, name] = cols;
      if (!symbol || !index_code) continue;
      out.push({ index_code, index_name, symbol, name });
    }

    if (out.length === 0) throw new Error("CSV parse boş");
    lastSuccess = { ts: Date.now(), data: out };
    return out;
  } catch (err) {
    console.error("getBistIndexMembers error", err);
    if (lastSuccess) return lastSuccess.data;
    return [];
  }
}

export async function getXK100Symbols(): Promise<string[]> {
  const all = await getBistIndexMembers();
  return all
    .filter((m) => m.index_code === "XK100" || m.index_code === "XU100")
    .map((m) => m.symbol);
}

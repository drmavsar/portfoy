"use server";

// BIST hisse temel analiz verisi — api/bist-fundamentals.py (borsapy) endpoint'i.
// Endpoint TradingView + İş Yatırım + KAP + hedeffiyat birleştirir.
// Cache 6 saat (temel veri çeyreklik değişir).

import {
  enrichFundamentals,
  type Fundamentals,
  type FundamentalsRaw,
} from "@/app/(app)/_lib/fundamentals-score";

export type FundamentalsResult =
  | { ok: true; data: Fundamentals }
  | { ok: false; error: string };

function baseUrl(): string {
  // Node fetch mutlak URL ister; tarayıcı yok. Vercel'de VERCEL_URL set olur.
  return process.env.VERCEL_URL
    ? `https://${process.env.VERCEL_URL}`
    : "http://localhost:3000";
}

export async function getFundamentals(symbol: string): Promise<FundamentalsResult> {
  const clean = symbol.trim().toUpperCase().replace(/[^A-Z0-9]/g, "").slice(0, 12);
  if (!clean) return { ok: false, error: "Sembol boş." };

  try {
    const res = await fetch(
      `${baseUrl()}/api/bist-fundamentals?symbol=${encodeURIComponent(clean)}`,
      { next: { revalidate: 21600, tags: ["fundamentals"] } },
    );
    if (!res.ok) {
      console.error(`[bist-fundamentals] ${clean} → HTTP ${res.status}`);
      return { ok: false, error: `Veri servisi yanıt vermedi (HTTP ${res.status}).` };
    }
    const json = (await res.json()) as
      | FundamentalsRaw
      | { ok: false; error: string };

    if (!json || json.ok !== true) {
      const msg = (json as { error?: string })?.error ?? "Bilinmeyen hata";
      console.error(`[bist-fundamentals] ${clean} → ${msg}`);
      return { ok: false, error: `${clean} için temel veri çekilemedi: ${msg}` };
    }
    return { ok: true, data: enrichFundamentals(json) };
  } catch (err) {
    console.error("[bist-fundamentals] fetch error", clean, err);
    return { ok: false, error: "Temel analiz servisine ulaşılamadı." };
  }
}

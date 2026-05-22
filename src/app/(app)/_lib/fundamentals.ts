// BIST hisse temel analiz verisi — /api/bist-fundamentals (borsapy) endpoint'i.
// Endpoint TradingView + İş Yatırım + KAP + hedeffiyat birleştirir.
//
// Çağrı TARAYICIDAN yapılır. Daha önce bu fetch sunucu tarafında (server
// component) çalışıyordu; sunucu→sunucu istek Vercel Deployment Protection
// katmanına takılıp HTTP 401 dönüyordu ("Veri servisi yanıt vermedi").
// Tarayıcı isteği aynı origin'e gider ve oturum çerezini taşıdığı için hem
// dağıtım korumasını hem Supabase proxy kontrolünü sorunsuz geçer.

import {
  enrichFundamentals,
  type Fundamentals,
  type FundamentalsRaw,
} from "@/app/(app)/_lib/fundamentals-score";

export type FundamentalsResult =
  | { ok: true; data: Fundamentals }
  | { ok: false; error: string };

export async function fetchFundamentals(symbol: string): Promise<FundamentalsResult> {
  const clean = symbol.trim().toUpperCase().replace(/[^A-Z0-9]/g, "").slice(0, 12);
  if (!clean) return { ok: false, error: "Sembol boş." };

  try {
    const res = await fetch(
      `/api/bist-fundamentals?symbol=${encodeURIComponent(clean)}`,
    );
    if (!res.ok) {
      return { ok: false, error: `Veri servisi yanıt vermedi (HTTP ${res.status}).` };
    }
    const json = (await res.json()) as
      | FundamentalsRaw
      | { ok: false; error: string };

    if (!json || json.ok !== true) {
      const msg = (json as { error?: string })?.error ?? "Bilinmeyen hata";
      return { ok: false, error: `${clean} için temel veri çekilemedi: ${msg}` };
    }
    return { ok: true, data: enrichFundamentals(json) };
  } catch {
    return { ok: false, error: "Temel analiz servisine ulaşılamadı." };
  }
}

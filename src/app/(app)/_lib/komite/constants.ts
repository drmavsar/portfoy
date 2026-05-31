// Komite · Portföy Sağlığı — kalibrasyon sabitleri.
// Tüm eşikler buradan ayarlanır; saf hesap motorları (gate.ts,
// portfolio-health.ts) bu değerleri tüketir. DB'ye bağlı değildir.

import type { AssetClassBucket } from "./types";

// ── Likidite tabanı ─────────────────────────────────────────────────────
// Ortalama günlük işlem hacmi (TRY) bunun altındaki sembol "tradeable" değil
// sayılır → otomatik 'liq' gate (multiplier 0).
export const LIQ_FLOOR_TRY = 25_000_000;

// ── Gate çarpanları ─────────────────────────────────────────────────────
// Sert kapılar: çarpanı doğrudan zorlar (min alınır).
// SPK severity'e bağlı: sev1=0.3, sev2=0.2, sev3=0.1.
// Yumuşak kapılar: tavan (cap) koyar.
export const GATE_MULTIPLIER = {
  vbts: 0.0,
  ban: 0.2,
  liq: 0.0,
  fin: 0.5, // cap
  vol: 0.7, // cap
} as const;

// Manuel bayrak: severity → tavan
export const MANUAL_CAP_BY_SEVERITY = [0.7, 0.5, 0.3] as const; // sev 1,2,3

// Bu kapılar aktifken sembol KARANTİNAYA girer → teknik kalitesi geçersiz.
export const QUARANTINE_KINDS = new Set(["vbts", "ban", "spk"]);

// ── Portföy Risk skoru alt-ağırlıkları ──────────────────────────────────
export const RISK_WEIGHTS = {
  concentration: 0.4,
  gate: 0.35,
  volatility: 0.25,
} as const;

// Banded normalizasyon eşikleri (lo → 0, hi → 100)
export const HHI_BAND = { lo: 1500, hi: 4000 } as const; // HHI (Σ ağırlık²), 0..10000
export const VOL_BAND = { lo: 2, hi: 8 } as const; // ağırlıklı ATR% (volatilite)

// ── Varsayılan SAA (Stratejik Varlık Tahsisi) ───────────────────────────
// PR-1: persona "Mehmet uzun vade". Sabit/config; PR-2'de saa_targets tablosu.
export const DEFAULT_SAA: Record<AssetClassBucket, number> = {
  equity: 30,
  fund: 35,
  gold: 15,
  cash: 8,
  other: 12,
};

// PR-1: nakit manuel/config bazlı. Holdings'te nakit pozisyonu yoksa bu değer
// portföy toplamına eklenir. Sonraki sürümde hesap entegrasyonu gelecek.
export const MANUAL_CASH_TRY = 0;

// ── Sektör maruziyeti rozetleri ─────────────────────────────────────────
export const SECTOR_TOP_RANK = 3; // momentum sıralamasında ilk N = "güçlü"
export const SECTOR_WEAK_RANK = 7; // rank ≥ bu (sayıca büyük) = "zayıf"
export const SECTOR_OVERWEIGHT_PCT = 12; // portföy ağırlığı bu üstündeyse overweight

// ── Varlık sınıfı eşlemesi ──────────────────────────────────────────────
// assets.asset_class → portföy kovası
export function bucketOf(assetClass: string | null | undefined): AssetClassBucket {
  switch (assetClass) {
    case "equity_tr":
    case "equity":
      return "equity";
    case "fund":
      return "fund";
    case "metal":
    case "gold":
      return "gold";
    case "cash":
    case "deposit":
      return "cash";
    default:
      return "other";
  }
}

export const BUCKET_LABEL: Record<AssetClassBucket, string> = {
  equity: "Hisse",
  fund: "Fon",
  gold: "Altın / Emtia",
  cash: "Nakit",
  other: "Diğer",
};

// Komite · Portföy Sağlığı — paylaşılan tipler.
// Saf hesap motorları ile servis/UI katmanı bu tipler üzerinden konuşur.

import type { RiskFlagKind } from "@/lib/types/database";

export type AssetClassBucket = "equity" | "fund" | "gold" | "cash" | "other";

// Likidite ('liq') otomatik türetilir; manuel bayraklar RiskFlagKind.
export type GateKind = RiskFlagKind | "liq";

export interface ActiveFlag {
  kind: RiskFlagKind;
  severity: number; // 1..3
  note?: string | null;
}

export interface GateReason {
  kind: GateKind;
  severity: number;
  label: string; // insan-okur ("VBTS tedbiri aktif")
}

export interface GateResult {
  multiplier: number; // 0..1
  quarantine: boolean; // teknik skor geçersiz mi
  tier: "ok" | "soft" | "hard";
  reasons: GateReason[];
}

// Saf motorun girdisi (servis katmanı assembler'dan gelir)
export interface RawPosition {
  symbol: string;
  name: string;
  assetClass: string | null;
  sector: string | null;
  quantity: number;
  price: number | null; // canlı (hisse); null → bookValue kullanılır
  bookValue: number; // cost_basis_try (fallback değer)
  qualityRaw: number | null; // 0..100 (skorlanabilir kovalar: hisse/fon)
  gate: GateResult;
  atrPct: number | null; // ATR/price (volatilite); null → katkısız
  healthLabel: string | null; // trade-plan sağlık rozeti (hisse)
  healthColor: string | null;
}

export interface PositionView {
  symbol: string;
  name: string;
  bucket: AssetClassBucket;
  sector: string | null;
  quantity: number;
  price: number | null;
  value: number;
  weight: number; // 0..100
  qualityRaw: number | null;
  effectiveQuality: number | null; // gate sonrası; karantina → 0
  gate: GateResult;
  healthLabel: string | null;
  healthColor: string | null;
}

export interface ScoreTriple {
  quality: number; // 0..100
  risk: number; // 0..100 (yüksek = kötü)
  opportunity: number; // 0..100
  health: number; // 0..100
}

export interface SectorExposureView {
  sector: string;
  weight: number; // 0..100 (skorlanabilir kova içi)
  rank: number | null; // sektör momentum sıralaması
  flag: "ok" | "overweight_weak" | "gap";
}

export interface ClassDriftView {
  bucket: AssetClassBucket;
  label: string;
  currentPct: number;
  targetPct: number;
  deltaPct: number; // current - target
}

export interface PortfolioHealthView {
  totalValue: number;
  scores: ScoreTriple;
  positions: PositionView[];
  sectors: SectorExposureView[];
  classDrift: ClassDriftView[];
  partial: boolean; // canlı veri kısmen eksik (ör. Yahoo down)
  generatedAt: string;
}

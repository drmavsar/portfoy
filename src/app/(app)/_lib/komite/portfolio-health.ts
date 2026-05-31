// Komite · Portföy Sağlığı motoru (saf, DB'siz, testli).
//
// Üç bileşik skor üretir — hepsi POZİSYON AĞIRLIKLI:
//   Kalite  : sahip olduklarım şu an kaliteli mi? (gate sonrası)
//   Risk    : ne kadar kırılganım? (konsantrasyon + gate maruziyeti + volatilite)
//   Fırsat  : iyileştirme alanım var mı? (SAA sapma + boş güçlü sektörler)
// Sağlık = 0.5·Kalite + 0.5·(100−Risk). Fırsat sağlığa girmez (aksiyon sürücüsü).

import {
  BUCKET_LABEL,
  DEFAULT_SAA,
  HHI_BAND,
  RISK_WEIGHTS,
  SECTOR_OVERWEIGHT_PCT,
  SECTOR_TOP_RANK,
  SECTOR_WEAK_RANK,
  VOL_BAND,
  bucketOf,
} from "./constants";
import type {
  AssetClassBucket,
  ClassDriftView,
  PortfolioHealthView,
  PositionView,
  RawPosition,
  ScoreTriple,
  SectorExposureView,
} from "./types";

function clamp(v: number, lo: number, hi: number): number {
  return Math.max(lo, Math.min(hi, v));
}

/** lo → 0, hi → 100 doğrusal bant. */
function band(v: number, lo: number, hi: number): number {
  if (hi <= lo) return 0;
  return clamp(((v - lo) / (hi - lo)) * 100, 0, 100);
}

function round1(n: number): number {
  return Math.round(n * 10) / 10;
}

const SCOREABLE: Set<AssetClassBucket> = new Set(["equity", "fund"]);

export interface PortfolioHealthInput {
  positions: RawPosition[];
  cashTry: number; // PR-1: manuel/config nakit
  sectorRanks: Map<string, number>; // sektör → momentum rank (1 = en iyi)
  topSectors: string[]; // momentum sıralamasında ilk N güçlü sektör
  saaTargets?: Record<AssetClassBucket, number>;
  partial?: boolean;
}

export function computePortfolioHealth(
  input: PortfolioHealthInput,
): PortfolioHealthView {
  const saa = input.saaTargets ?? DEFAULT_SAA;

  // 1) Değerleme — canlı fiyat varsa qty×price, yoksa book.
  const valued = input.positions.map((p) => {
    const value =
      p.price != null && p.price > 0 ? p.quantity * p.price : p.bookValue;
    const bucket = bucketOf(p.assetClass);
    const scoreable = SCOREABLE.has(bucket);
    const effectiveQuality =
      scoreable && p.qualityRaw != null
        ? p.gate.quarantine
          ? 0
          : round1(p.qualityRaw * p.gate.multiplier)
        : null;
    return { p, bucket, value: Math.max(0, value), effectiveQuality, scoreable };
  });

  const positionsValue = valued.reduce((s, v) => s + v.value, 0);
  const cash = Math.max(0, input.cashTry);
  const totalValue = positionsValue + cash;

  // 2) Pozisyon görünümleri (ağırlık %)
  const positions: PositionView[] = valued.map((v) => ({
    symbol: v.p.symbol,
    name: v.p.name,
    bucket: v.bucket,
    sector: v.p.sector,
    quantity: v.p.quantity,
    price: v.p.price,
    value: v.value,
    weight: totalValue > 0 ? round1((v.value / totalValue) * 100) : 0,
    qualityRaw: v.p.qualityRaw,
    effectiveQuality: v.effectiveQuality,
    gate: v.p.gate,
    healthLabel: v.p.healthLabel,
    healthColor: v.p.healthColor,
  }));

  // Nakit'i sentetik pozisyon olarak ekle (tablo + dağılım bütünlüğü)
  if (cash > 0) {
    positions.push({
      symbol: "NAKİT",
      name: "Nakit",
      bucket: "cash",
      sector: null,
      quantity: cash,
      price: 1,
      value: cash,
      weight: totalValue > 0 ? round1((cash / totalValue) * 100) : 0,
      qualityRaw: null,
      effectiveQuality: null,
      gate: { multiplier: 1, quarantine: false, tier: "ok", reasons: [] },
      healthLabel: null,
      healthColor: null,
    });
  }

  positions.sort((a, b) => b.value - a.value);

  // 3) Portföy Kalite — skorlanabilir kova içinde ağırlık-normalize
  const scoredValue = valued
    .filter((v) => v.scoreable && v.effectiveQuality != null)
    .reduce((s, v) => s + v.value, 0);
  const quality =
    scoredValue > 0
      ? round1(
          valued
            .filter((v) => v.scoreable && v.effectiveQuality != null)
            .reduce(
              (s, v) => s + (v.value / scoredValue) * (v.effectiveQuality as number),
              0,
            ),
        )
      : 0;

  // 4) Portföy Risk
  // 4a) Konsantrasyon — HHI (Σ ağırlık²), nakit dahil tüm pozisyonlar
  const hhi = positions.reduce((s, p) => s + p.weight * p.weight, 0);
  const concentration = band(hhi, HHI_BAND.lo, HHI_BAND.hi);
  // 4b) Gate maruziyeti — gate çarpanı < 1 olan pozisyon ağırlığı toplamı
  const gateExposure = clamp(
    positions
      .filter((p) => p.gate.multiplier < 1)
      .reduce((s, p) => s + p.weight, 0),
    0,
    100,
  );
  // 4c) Volatilite — ağırlıklı ATR%
  const weightedAtr = valued.reduce((s, v) => {
    if (v.p.atrPct == null) return s;
    const w = totalValue > 0 ? v.value / totalValue : 0;
    return s + w * v.p.atrPct;
  }, 0);
  const volatility = band(weightedAtr, VOL_BAND.lo, VOL_BAND.hi);
  const risk = round1(
    RISK_WEIGHTS.concentration * concentration +
      RISK_WEIGHTS.gate * gateExposure +
      RISK_WEIGHTS.volatility * volatility,
  );

  // 5) Sınıf sapması (SAA)
  const bucketPct = new Map<AssetClassBucket, number>();
  for (const p of positions) {
    bucketPct.set(p.bucket, (bucketPct.get(p.bucket) ?? 0) + p.weight);
  }
  const allBuckets: AssetClassBucket[] = ["equity", "fund", "gold", "cash", "other"];
  const classDrift: ClassDriftView[] = allBuckets.map((b) => {
    const current = round1(bucketPct.get(b) ?? 0);
    const target = saa[b] ?? 0;
    return {
      bucket: b,
      label: BUCKET_LABEL[b],
      currentPct: current,
      targetPct: target,
      deltaPct: round1(current - target),
    };
  });

  // 6) Sektör maruziyeti (skorlanabilir kova ağırlıkları)
  const sectorWeight = new Map<string, number>();
  for (const v of valued) {
    if (!v.scoreable || !v.p.sector) continue;
    const w = totalValue > 0 ? (v.value / totalValue) * 100 : 0;
    sectorWeight.set(v.p.sector, (sectorWeight.get(v.p.sector) ?? 0) + w);
  }
  const sectors: SectorExposureView[] = Array.from(sectorWeight.entries())
    .map(([sector, weight]) => {
      const rank = input.sectorRanks.get(sector) ?? null;
      let flag: SectorExposureView["flag"] = "ok";
      if (weight >= SECTOR_OVERWEIGHT_PCT && rank != null && rank >= SECTOR_WEAK_RANK) {
        flag = "overweight_weak";
      }
      return { sector, weight: round1(weight), rank, flag };
    })
    .sort((a, b) => b.weight - a.weight);

  // Açık güçlü sektörler: top-N momentum sektöründe portföy ağırlığı ≈ 0
  const sectorGaps: SectorExposureView[] = input.topSectors
    .filter((s) => (sectorWeight.get(s) ?? 0) < 0.5)
    .map((s) => ({
      sector: s,
      weight: 0,
      rank: input.sectorRanks.get(s) ?? null,
      flag: "gap" as const,
    }));
  sectors.push(...sectorGaps);

  // 7) Portföy Fırsat — SAA sapma (active share) + sektör açığı
  const saaDrift =
    classDrift.reduce((s, d) => s + Math.abs(d.deltaPct), 0) / 2; // 0..100
  const driftScore = clamp(saaDrift * 2, 0, 100);
  const gapScore = clamp(
    (sectorGaps.length / Math.max(1, SECTOR_TOP_RANK)) * 100,
    0,
    100,
  );
  const opportunity = round1(0.6 * driftScore + 0.4 * gapScore);

  // 8) Sağlık
  const health = round1(0.5 * quality + 0.5 * (100 - risk));

  const scores: ScoreTriple = { quality, risk, opportunity, health };

  return {
    totalValue,
    scores,
    positions,
    sectors,
    classDrift,
    partial: input.partial ?? false,
    generatedAt: new Date().toISOString(),
  };
}

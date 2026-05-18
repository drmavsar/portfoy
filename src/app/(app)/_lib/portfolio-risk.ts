/**
 * Portfolio risk overlay — bt_v18 core/portfolio_risk.py'den uyarlanmıştır.
 *
 * Mevcut pozisyonları analiz eder ve şu durumlarda uyarı üretir:
 * - Tek pozisyon konsantrasyonu (> 25% portfoy ağırlığı)
 * - Sektör konsantrasyonu (> 40% portfoy ağırlığı)
 * - Kişi konsantrasyonu (tek kişi > 70% — bilgi amaçlı)
 * - Stop altı pozisyonlar (acil)
 * - Maliyet altı pozisyonlar (bilgi)
 * - Extended pozisyonlar (MA20 + %10 üstü, kar realize değerlendirilmeli)
 */

import type { TradePlan } from "./trade-plan";

export type WarningSeverity = "critical" | "warn" | "info";

export interface PortfolioWarning {
  severity: WarningSeverity;
  type: string;
  title: string;
  message: string;
  symbols?: string[];
}

export interface PortfolioRiskInput {
  symbol: string;
  sector: string | null;
  beneficiary_id: string | null;
  beneficiary_name: string | null;
  mv: number;            // market value
  plan?: TradePlan;
}

const SINGLE_POSITION_WARN_PCT = 25;
const SECTOR_WARN_PCT = 40;
const SINGLE_BENEFICIARY_WARN_PCT = 70;

export function auditPortfolio(
  positions: PortfolioRiskInput[],
  totalMv: number,
): PortfolioWarning[] {
  const warnings: PortfolioWarning[] = [];
  if (totalMv <= 0 || positions.length === 0) return warnings;

  // 1) Stop altı pozisyonlar — KRİTİK
  const belowStop = positions.filter((p) => p.plan?.health === "below_stop");
  if (belowStop.length > 0) {
    warnings.push({
      severity: "critical",
      type: "below_stop",
      title: "Stop Altı Pozisyon",
      message: `${belowStop.length} pozisyon teknik stop (S1) seviyesinin altında. Acil gözden geçirme.`,
      symbols: belowStop.map((p) => p.symbol),
    });
  }

  // 2) Tek pozisyon konsantrasyonu
  const byWeight = [...positions].sort((a, b) => b.mv - a.mv);
  const top = byWeight[0];
  if (top) {
    const topPct = (top.mv / totalMv) * 100;
    if (topPct > SINGLE_POSITION_WARN_PCT) {
      warnings.push({
        severity: "warn",
        type: "single_position",
        title: "Tek Pozisyon Konsantrasyonu",
        message: `${top.symbol} portföyün %${topPct.toFixed(1)}'i. Hedef üst sınır: %${SINGLE_POSITION_WARN_PCT}.`,
        symbols: [top.symbol],
      });
    }
  }

  // 3) Sektör konsantrasyonu
  const sectorMv = new Map<string, number>();
  const sectorSymbols = new Map<string, string[]>();
  for (const p of positions) {
    if (!p.sector) continue;
    sectorMv.set(p.sector, (sectorMv.get(p.sector) ?? 0) + p.mv);
    const arr = sectorSymbols.get(p.sector) ?? [];
    arr.push(p.symbol);
    sectorSymbols.set(p.sector, arr);
  }
  for (const [sector, mv] of sectorMv) {
    const pct = (mv / totalMv) * 100;
    if (pct > SECTOR_WARN_PCT) {
      warnings.push({
        severity: "warn",
        type: "sector_concentration",
        title: "Sektör Konsantrasyonu",
        message: `${sector} sektörü portföyün %${pct.toFixed(1)}'i. Hedef üst sınır: %${SECTOR_WARN_PCT}.`,
        symbols: sectorSymbols.get(sector) ?? [],
      });
    }
  }

  // 4) Kişi konsantrasyonu (info)
  const benMv = new Map<string, { name: string; mv: number }>();
  for (const p of positions) {
    if (!p.beneficiary_id || !p.beneficiary_name) continue;
    const cur = benMv.get(p.beneficiary_id) ?? { name: p.beneficiary_name, mv: 0 };
    cur.mv += p.mv;
    benMv.set(p.beneficiary_id, cur);
  }
  for (const { name, mv } of benMv.values()) {
    const pct = (mv / totalMv) * 100;
    if (pct > SINGLE_BENEFICIARY_WARN_PCT) {
      warnings.push({
        severity: "info",
        type: "beneficiary_concentration",
        title: "Kişi Konsantrasyonu",
        message: `Portföyün %${pct.toFixed(1)}'i tek kişide (${name}). Dağılım dengesiz.`,
      });
    }
  }

  // 5) Maliyet altı pozisyonlar — INFO
  const belowWac = positions.filter((p) => p.plan?.health === "below_wac");
  if (belowWac.length > 0) {
    warnings.push({
      severity: "info",
      type: "below_wac",
      title: "Maliyet Altı Pozisyonlar",
      message: `${belowWac.length} pozisyon WAC altında. ATR-bazlı stop hâlâ üstte.`,
      symbols: belowWac.map((p) => p.symbol),
    });
  }

  // 6) Extended pozisyonlar — INFO (kar realize değerlendirilmeli)
  const extended = positions.filter((p) => p.plan?.health === "extended");
  if (extended.length > 0) {
    warnings.push({
      severity: "info",
      type: "extended",
      title: "Aşırı Uzaklaşmış (Extended)",
      message: `${extended.length} pozisyon MA20'den %10+ uzakta. Kısmi kar realize değerlendirilmeli.`,
      symbols: extended.map((p) => p.symbol),
    });
  }

  // 7) Stop yakın — WARN
  const warnStop = positions.filter((p) => p.plan?.health === "warn_stop");
  if (warnStop.length > 0) {
    warnings.push({
      severity: "warn",
      type: "warn_stop",
      title: "Stop Yakın",
      message: `${warnStop.length} pozisyon teknik stop seviyesine yarım ATR'den yakın.`,
      symbols: warnStop.map((p) => p.symbol),
    });
  }

  // Sırala: critical > warn > info
  const order: Record<WarningSeverity, number> = { critical: 0, warn: 1, info: 2 };
  warnings.sort((a, b) => order[a.severity] - order[b.severity]);
  return warnings;
}

export interface ConcentrationStat {
  label: string;
  value: number;
  pct: number;
  color?: string;
}

/** En büyük 5 pozisyon ağırlık özeti — UI'da bar/badge için */
export function topPositionsBreakdown(
  positions: PortfolioRiskInput[],
  totalMv: number,
  limit = 5,
): ConcentrationStat[] {
  if (totalMv <= 0) return [];
  return [...positions]
    .sort((a, b) => b.mv - a.mv)
    .slice(0, limit)
    .map((p) => ({
      label: p.symbol,
      value: p.mv,
      pct: (p.mv / totalMv) * 100,
    }));
}

/** Sektör bazlı ağırlık özeti */
export function sectorBreakdown(
  positions: PortfolioRiskInput[],
  totalMv: number,
): ConcentrationStat[] {
  if (totalMv <= 0) return [];
  const sectorMv = new Map<string, number>();
  for (const p of positions) {
    const key = p.sector ?? "(Sektörsüz)";
    sectorMv.set(key, (sectorMv.get(key) ?? 0) + p.mv);
  }
  return Array.from(sectorMv.entries())
    .map(([label, value]) => ({ label, value, pct: (value / totalMv) * 100 }))
    .sort((a, b) => b.pct - a.pct);
}

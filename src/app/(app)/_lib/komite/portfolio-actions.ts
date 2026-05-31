"use server";

// Komite · Portföy Sağlığı orkestrasyonu (I/O).
//
// Mevcut servisleri yeniden kullanır (yeni boru hattı yok):
//   listHoldings/listAssets   → pozisyonlar + sınıf/sektör + book değer
//   getScreeningData          → canlı fiyat, ATR, vol_20d, 52h, composite skor
//   computeSectorMomentum     → sektör momentum sıralaması
//   buildTradePlan            → hisse sağlık rozeti
//   listActiveRiskFlags       → manuel gate bayrakları
// Saf hesap gate.ts + portfolio-health.ts'te; bu katman yalnız veri toplar.

import { getXK100Symbols } from "@/app/(app)/_lib/bist-index-members";
import {
  computeSectorMomentum,
  getScreeningData,
  type ScreeningRow,
} from "@/app/(app)/_lib/stock-screening";
import { buildTradePlan } from "@/app/(app)/_lib/trade-plan";
import { listAssets, listHoldings } from "@/app/(app)/_lib/wealth-actions";
import { getDefaultPersona } from "@/app/(app)/_lib/tefas/persona-actions";

import { MANUAL_CASH_TRY, SECTOR_TOP_RANK, bucketOf } from "./constants";
import { OPEN_GATE, computeGate } from "./gate";
import { computePortfolioHealth } from "./portfolio-health";
import type { ActiveFlag, PortfolioHealthView, RawPosition } from "./types";
import { listActiveRiskFlags } from "./risk-flags-actions";
import type { RiskFlagRow } from "@/lib/types/database";

export interface KomiteDashboard {
  view: PortfolioHealthView;
  personaName: string | null;
  symbolUniverseCount: number;
  screenedCount: number;
  flags: RiskFlagRow[];
}

export async function getKomiteDashboard(): Promise<KomiteDashboard> {
  const [holdings, assets, persona, riskFlags] = await Promise.all([
    listHoldings(),
    listAssets(),
    getDefaultPersona(),
    listActiveRiskFlags(),
  ]);

  const assetById = new Map(assets.map((a) => [a.id, a]));

  // Sahip olunan hisse sembolleri (equity kovası)
  const ownedEquitySymbols = holdings
    .map((h) => assetById.get(h.asset_id))
    .filter((a): a is NonNullable<typeof a> => !!a && bucketOf(a.asset_class) === "equity")
    .map((a) => a.symbol);

  // Evren = XK100 ∪ sahip olunan hisseler (held isimler XK100 dışı olsa da fiyatlanır)
  let xk100: string[] = [];
  try {
    xk100 = await getXK100Symbols();
  } catch (err) {
    console.error("getKomiteDashboard: getXK100Symbols", err);
  }
  const universe = Array.from(new Set([...xk100, ...ownedEquitySymbols]));

  // Canlı screening — Yahoo down ise boş döner (partial)
  let screening: ScreeningRow[] = [];
  try {
    screening = await getScreeningData(universe);
  } catch (err) {
    console.error("getKomiteDashboard: getScreeningData", err);
  }
  const screenBySymbol = new Map(screening.map((r) => [r.symbol, r]));
  const partial = universe.length > 0 && screening.length === 0;

  // Sektör momentum — screening + asset sektörü
  const sectorRows = screening.map((r) => {
    const a = assets.find((x) => x.symbol === r.symbol);
    return { symbol: r.symbol, sector: a?.sector ?? null, score: r.score, month_pct: r.month_pct };
  });
  const sectorMom = await computeSectorMomentum(sectorRows);
  const sectorRanks = new Map<string, number>();
  for (const [sector, info] of sectorMom) sectorRanks.set(sector, info.sector_rank);
  const topSectors = Array.from(sectorMom.entries())
    .filter(([, i]) => i.sector_rank <= SECTOR_TOP_RANK)
    .sort((a, b) => a[1].sector_rank - b[1].sector_rank)
    .map(([s]) => s);

  // Bayrakları sembol bazında grupla
  const flagsBySymbol = new Map<string, ActiveFlag[]>();
  for (const f of riskFlags) {
    const arr = flagsBySymbol.get(f.symbol) ?? [];
    arr.push({ kind: f.kind, severity: f.severity, note: f.note });
    flagsBySymbol.set(f.symbol, arr);
  }

  // Pozisyonları RawPosition'a çevir
  const rawPositions: RawPosition[] = holdings.map((h) => {
    const a = assetById.get(h.asset_id);
    const symbol = a?.symbol ?? "?";
    const bucket = bucketOf(a?.asset_class);
    const screen = screenBySymbol.get(symbol);
    const qty = Number(h.quantity);
    const bookValue = Number(h.cost_basis_try);
    const wac = Number(h.wac_try);

    const isEquity = bucket === "equity";
    const price = isEquity && screen ? screen.price : null;
    const qualityRaw = isEquity && screen ? screen.score : null;
    const atrPct =
      isEquity && screen && screen.atr14 != null && screen.price > 0
        ? (screen.atr14 / screen.price) * 100
        : null;

    // Gate yalnız hisseler için (likidite + manuel bayrak)
    const flags = flagsBySymbol.get(symbol) ?? [];
    const adtv =
      isEquity && screen && screen.vol_20d != null
        ? screen.vol_20d * screen.price
        : null;
    const gate = isEquity ? computeGate({ flags, adtv }) : OPEN_GATE;

    // Hisse sağlık rozeti (trade-plan)
    let healthLabel: string | null = null;
    let healthColor: string | null = null;
    if (isEquity && screen && screen.atr14 && wac > 0 && !gate.quarantine) {
      const plan = buildTradePlan(wac, screen.price, screen.atr14, screen.high_52w, screen.sma20);
      healthLabel = plan.health_label;
      healthColor = plan.health_color;
    }

    return {
      symbol,
      name: a?.name ?? symbol,
      assetClass: a?.asset_class ?? null,
      sector: a?.sector ?? null,
      quantity: qty,
      price,
      bookValue,
      qualityRaw,
      gate,
      atrPct,
      healthLabel,
      healthColor,
    };
  });

  const view = computePortfolioHealth({
    positions: rawPositions,
    cashTry: MANUAL_CASH_TRY,
    sectorRanks,
    topSectors,
    partial,
  });

  return {
    view,
    personaName: persona?.name ?? null,
    symbolUniverseCount: universe.length,
    screenedCount: screening.length,
    flags: riskFlags,
  };
}

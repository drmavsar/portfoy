/* Portföy nakit akışları — saf dönüşüm ("use server" YOK).
   Birikim & Hisse sekmesi ve servet köprüsü aynı akışı kullanır. */

import type { AssetRow, RealizedBySell, TradeRow } from "@/app/(app)/_lib/wealth-actions";
import { findUnmatchedSells } from "@/app/(app)/_lib/xirr-report";
import { istanbulToday } from "@/lib/finance/istanbul-date";

export interface PortfolioCashFlow {
  /** İstanbul takvim günü */
  date: string;
  /** TRY: alım −(brüt + komisyon), satış +(brüt − komisyon) */
  amount: number;
}

/**
 * Alımı girilmemiş satışlarda yalnız eşleşmeyen kısım dışlanır: o pozisyon
 * portföy değerinde hiç yer almadığı için satış geliri getiri sayılmamalı
 * (KTLEV'de satışın tamamı, BINHO'da 10.011 satışın 11 adedi).
 * `classes` verilirse yalnız o varlık sınıfları.
 */
export function portfolioCashFlows(
  trades: TradeRow[],
  assets: AssetRow[],
  realizedBySell: Record<string, RealizedBySell>,
  classes?: Set<string>,
): PortfolioCashFlow[] {
  const assetMap = new Map(assets.map((a) => [a.id, a]));
  const scoped = classes ? trades.filter((t) => classes.has(assetMap.get(t.asset_id)?.asset_class ?? "")) : trades;
  const matchedShare = new Map(
    findUnmatchedSells(
      scoped,
      (id) => realizedBySell[id] != null,
      (aid) => assetMap.get(aid)?.symbol ?? "?",
      () => "",
    ).map((u) => [u.tradeId, u.soldQty > 0 ? Math.min(1, u.availableQty / u.soldQty) : 0]),
  );
  return scoped
    .map((t) => {
      const fx = t.currency === "TRY" ? 1 : Number(t.fx_rate_to_try ?? 1) || 1;
      const gross = Number(t.quantity) * Number(t.price) * fx;
      const fees = Number(t.fees) * fx;
      const share = matchedShare.get(t.id) ?? 1;
      return {
        date: istanbulToday(new Date(t.executed_at)),
        amount: (t.side === "buy" ? -(gross + fees) : gross - fees) * share,
      };
    })
    .filter((f) => f.amount !== 0)
    .sort((a, b) => (a.date < b.date ? -1 : a.date > b.date ? 1 : 0));
}

import type { TradeRow } from "@/lib/types/database";

export interface Position {
  assetId: string;
  quantity: number;
  wacTry: number;
  costBasisTry: number;
  realizedPnlTry: number;
}

/**
 * Compute weighted-average-cost position across a chronologically
 * ordered list of trades for a single asset.
 *
 * Sells reduce quantity at the current WAC; realized P&L = (sell price − WAC) × qty.
 */
export function computeWAC(trades: TradeRow[]): Position {
  if (trades.length === 0) {
    return { assetId: "", quantity: 0, wacTry: 0, costBasisTry: 0, realizedPnlTry: 0 };
  }
  const sorted = [...trades].sort((a, b) =>
    a.executed_at.localeCompare(b.executed_at),
  );

  let qty = 0;
  let costBasis = 0;
  let realized = 0;

  for (const t of sorted) {
    const fx = t.currency === "TRY" ? 1 : t.fx_rate_to_try ?? 1;
    const unitTry = t.price * fx;
    const fees = t.fees + t.taxes;

    if (t.side === "buy") {
      costBasis += t.quantity * unitTry + fees;
      qty += t.quantity;
    } else {
      const wac = qty > 0 ? costBasis / qty : 0;
      const sellTry = t.quantity * unitTry - fees;
      realized += sellTry - t.quantity * wac;
      costBasis -= t.quantity * wac;
      qty -= t.quantity;
      if (qty <= 0) {
        qty = 0;
        costBasis = 0;
      }
    }
  }

  return {
    assetId: sorted[0].asset_id,
    quantity: qty,
    wacTry: qty > 0 ? costBasis / qty : 0,
    costBasisTry: costBasis,
    realizedPnlTry: realized,
  };
}

export interface MarkedPosition extends Position {
  lastPriceTry: number | null;
  marketValueTry: number;
  unrealizedPnlTry: number;
  unrealizedPnlPct: number | null;
}

export function markToMarket(pos: Position, lastPriceTry: number | null): MarkedPosition {
  const price = lastPriceTry ?? pos.wacTry;
  const mv = pos.quantity * price;
  const upnl = mv - pos.costBasisTry;
  const upnlPct = pos.costBasisTry > 0 ? upnl / pos.costBasisTry : null;
  return {
    ...pos,
    lastPriceTry,
    marketValueTry: mv,
    unrealizedPnlTry: upnl,
    unrealizedPnlPct: upnlPct,
  };
}

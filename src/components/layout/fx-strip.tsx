"use client";

import { ARROW, direction, pct } from "@/lib/design/format";
import { fmt } from "@/lib/finance/fmt";
import type { FxTicker } from "@/app/(app)/_lib/asset-rates";

export function FxStrip({ tickers }: { tickers: FxTicker[] }) {
  if (tickers.length === 0) {
    return (
      <div className="fx-strip">
        <span className="fx-live" style={{ opacity: 0.6 }}>
          <span className="sd" /> KAPALI
        </span>
      </div>
    );
  }

  return (
    <div className="fx-strip">
      <span className="fx-live">
        <span className="sd sd-on" />
        CANLI
      </span>
      {tickers.map((t) => {
        const chg = t.chgPct;
        const dir = direction(chg);
        return (
          <div key={t.symbol} className="fx-tick">
            <span className="fx-pair">{t.label}</span>
            <span className="fx-last">
              {fmt.tr(t.price, t.price > 1000 ? 0 : t.price > 10 ? 2 : 4)}
            </span>
            {chg != null && (
              <span className={`fx-chg ${dir === "up" ? "pos" : dir === "down" ? "neg" : "flat"}`}>
                {ARROW[dir]} {pct(chg, { sign: true, decimals: 2 })}
              </span>
            )}
          </div>
        );
      })}
    </div>
  );
}

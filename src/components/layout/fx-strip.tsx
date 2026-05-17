"use client";

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
        return (
          <div key={t.symbol} className="fx-tick">
            <span className="fx-pair">{t.label}</span>
            <span className="mono fx-last">
              {fmt.tr(t.price, t.price > 1000 ? 0 : t.price > 10 ? 2 : 4)}
            </span>
            {chg != null && (
              <span className={`mono fx-chg ${chg >= 0 ? "pos" : "neg"}`}>
                {chg >= 0 ? "▲" : "▼"} {Math.abs(chg).toFixed(2)}%
              </span>
            )}
          </div>
        );
      })}
    </div>
  );
}

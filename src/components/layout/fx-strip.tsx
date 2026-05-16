"use client";

import { useEffect, useState } from "react";

import { fmt } from "@/lib/finance/fmt";
import { FX_QUOTES } from "@/lib/sample/data";

export function FxStrip() {
  const [quotes, setQuotes] = useState(FX_QUOTES);
  const [flashIdx, setFlashIdx] = useState(-1);

  useEffect(() => {
    const t = setInterval(() => {
      const idx = Math.floor(Math.random() * FX_QUOTES.length);
      setQuotes((prev) =>
        prev.map((q, i) => {
          if (i !== idx) return q;
          const tick = q.last * (Math.random() * 0.0014 - 0.0007);
          const last = q.last + tick;
          const chgPct = q.chgPct + (tick / q.last) * 100;
          return { ...q, last, chgPct };
        }),
      );
      setFlashIdx(idx);
      setTimeout(() => setFlashIdx(-1), 380);
    }, 1400);
    return () => clearInterval(t);
  }, []);

  return (
    <div className="fx-strip">
      <span className="fx-live">
        <span className="sd sd-on" />
        CANLI
      </span>
      {quotes.map((q, i) => (
        <div
          key={q.pair}
          className={`fx-tick ${flashIdx === i ? (q.chgPct >= 0 ? "flash-up" : "flash-dn") : ""}`}
        >
          <span className="fx-pair">{q.pair}</span>
          <span className="mono fx-last">{fmt.tr(q.last, q.last > 1000 ? 0 : q.last > 10 ? 2 : 4)}</span>
          <span className={`mono fx-chg ${q.chgPct >= 0 ? "pos" : "neg"}`}>
            {q.chgPct >= 0 ? "▲" : "▼"} {Math.abs(q.chgPct).toFixed(2)}%
          </span>
        </div>
      ))}
    </div>
  );
}

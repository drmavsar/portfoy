"use client";

import { useState } from "react";

import type { BacktestUiSnapshot } from "@/app/(app)/_lib/backtest/snapshot-loader";

import { SummaryTab } from "./summary-tab";
import { RollingTab } from "./rolling-tab";
import { MatrixTab } from "./matrix-tab";

type TabKey = "summary" | "rolling" | "matrix";

const TABS: Array<{ key: TabKey; label: string }> = [
  { key: "summary", label: "Özet + Sprint-6 GO/NO-GO" },
  { key: "rolling", label: "Rolling Sonuçlar (4 Senaryo)" },
  { key: "matrix", label: "Parametre Optimizasyonu" },
];

export function BacktestClient({ snapshot }: { snapshot: BacktestUiSnapshot }) {
  const [active, setActive] = useState<TabKey>("summary");

  return (
    <div>
      <div
        style={{
          display: "flex",
          gap: 6,
          marginBottom: 16,
          flexWrap: "wrap",
          borderBottom: "1px solid var(--border)",
          paddingBottom: 8,
        }}
      >
        {TABS.map((t) => (
          <button
            key={t.key}
            onClick={() => setActive(t.key)}
            style={{
              fontSize: 12,
              padding: "6px 14px",
              borderRadius: 6,
              border: `1px solid ${active === t.key ? "var(--accent, #6ea8fe)" : "var(--border)"}`,
              background: active === t.key ? "var(--surface-2)" : "transparent",
              color: active === t.key ? "#6ea8fe" : "var(--muted)",
              cursor: "pointer",
              fontWeight: active === t.key ? 600 : 400,
            }}
          >
            {t.label}
          </button>
        ))}
      </div>

      {active === "summary" && <SummaryTab snapshot={snapshot} />}
      {active === "rolling" && <RollingTab snapshot={snapshot} />}
      {active === "matrix" && <MatrixTab snapshot={snapshot} />}
    </div>
  );
}

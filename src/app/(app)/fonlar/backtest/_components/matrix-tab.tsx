"use client";

import { useState } from "react";

import type { BacktestUiSnapshot } from "@/app/(app)/_lib/backtest/snapshot-loader";
import { BEST_CONFIG } from "@/app/(app)/_lib/backtest/snapshot-loader";

const TOP_NS = [5, 10, 20] as const;
const REBALANCE_DAYS = [30, 90, 180, 365] as const;

type Metric = "kat_median" | "cagr" | "sharpe" | "max_dd";

const METRIC_LABELS: Record<Metric, string> = {
  kat_median: "KAT Median Alpha",
  cagr: "CAGR (avg)",
  sharpe: "Sharpe-like (avg)",
  max_dd: "Max Drawdown (avg)",
};

function fmt(v: number | null, m: Metric): string {
  if (v == null || !Number.isFinite(v)) return "—";
  if (m === "sharpe") return v.toFixed(2);
  const sign = v > 0 && m !== "max_dd" ? "+" : "";
  return `${sign}${(v * 100).toFixed(1)}%`;
}

function cellColor(v: number | null, m: Metric): string {
  if (v == null) return "var(--surface-2)";
  if (m === "kat_median") {
    if (v >= 0.05) return "#4cc9b066";
    if (v >= 0.03) return "#4cc9b033";
    if (v > 0) return "#e0b34122";
    return "#e26a8f22";
  }
  if (m === "cagr") {
    if (v >= 0.50) return "#4cc9b066";
    if (v >= 0.45) return "#4cc9b033";
    return "#e0b34122";
  }
  if (m === "max_dd") {
    if (v > -0.05) return "#4cc9b066";
    if (v > -0.08) return "#e0b34122";
    return "#e26a8f22";
  }
  if (m === "sharpe") {
    if (v > 1.0) return "#4cc9b066";
    if (v > 0.5) return "#4cc9b033";
    if (v > 0) return "#e0b34122";
    return "#e26a8f22";
  }
  return "var(--surface-2)";
}

export function MatrixTab({ snapshot }: { snapshot: BacktestUiSnapshot }) {
  const [metric, setMetric] = useState<Metric>("kat_median");
  const [strategy, setStrategy] = useState<"equal_weight" | "score_weighted">("equal_weight");

  // Combo lookup map
  const lookup = new Map<string, typeof snapshot.combos[number]>();
  for (const c of snapshot.combos) {
    lookup.set(`${c.top_n}|${c.rebalance_days}|${c.strategy}`, c);
  }

  function metricValue(top_n: number, rebal: number): number | null {
    const c = lookup.get(`${top_n}|${rebal}|${strategy}`);
    if (!c) return null;
    if (metric === "kat_median") return c.per_benchmark.KAT_FON_SEPETI?.median_alpha ?? null;
    if (metric === "cagr") return c.avg_cagr;
    if (metric === "sharpe") return c.avg_sharpe;
    if (metric === "max_dd") return c.avg_max_dd;
    return null;
  }

  return (
    <div style={{ display: "grid", gap: 16 }}>
      <div className="card" style={{ padding: 14, display: "flex", gap: 16, flexWrap: "wrap", alignItems: "center" }}>
        <div>
          <div style={{ fontSize: 10, color: "var(--muted)", marginBottom: 4, textTransform: "uppercase", letterSpacing: 0.4 }}>Metric</div>
          <select
            value={metric}
            onChange={(e) => setMetric(e.target.value as Metric)}
            style={{ padding: "4px 8px", fontSize: 12 }}
          >
            {(Object.entries(METRIC_LABELS) as Array<[Metric, string]>).map(([k, v]) => (
              <option key={k} value={k}>{v}</option>
            ))}
          </select>
        </div>
        <div>
          <div style={{ fontSize: 10, color: "var(--muted)", marginBottom: 4, textTransform: "uppercase", letterSpacing: 0.4 }}>Strategy</div>
          <div style={{ display: "flex", gap: 4 }}>
            <button
              onClick={() => setStrategy("equal_weight")}
              style={pillStyle(strategy === "equal_weight")}
            >Equal Weight</button>
            <button
              onClick={() => setStrategy("score_weighted")}
              style={pillStyle(strategy === "score_weighted")}
            >Score Weighted</button>
          </div>
        </div>
        <div style={{ marginLeft: "auto", fontSize: 11, color: "var(--muted)" }}>
          ★ = Best config ({BEST_CONFIG.top_n}, {BEST_CONFIG.rebalance_days}g, EW)
        </div>
      </div>

      <div className="card" style={{ padding: 16 }}>
        <div style={{ fontSize: 11, color: "var(--muted)", textTransform: "uppercase", letterSpacing: 0.5, fontWeight: 600, marginBottom: 12 }}>
          Heatmap — TopN × Rebalance ({METRIC_LABELS[metric]})
        </div>
        <table style={{ width: "100%", borderCollapse: "collapse" }}>
          <thead>
            <tr>
              <th style={{ padding: "8px 10px", fontSize: 11, fontWeight: 600, textAlign: "left", color: "var(--muted)" }}>TopN \ Rebal</th>
              {REBALANCE_DAYS.map((r) => (
                <th key={r} style={{ padding: "8px 10px", fontSize: 11, fontWeight: 600, textAlign: "center", color: "var(--muted)" }}>
                  {r} gün
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {TOP_NS.map((tn) => (
              <tr key={tn}>
                <td style={{ padding: "10px", fontSize: 12, fontWeight: 600 }}>{tn}</td>
                {REBALANCE_DAYS.map((r) => {
                  const v = metricValue(tn, r);
                  const isBest = tn === BEST_CONFIG.top_n && r === BEST_CONFIG.rebalance_days && strategy === BEST_CONFIG.strategy;
                  return (
                    <td key={r} style={{
                      padding: "16px 10px",
                      textAlign: "center",
                      background: cellColor(v, metric),
                      fontFamily: "var(--font-mono)",
                      fontSize: 13,
                      fontWeight: 600,
                      border: isBest ? "2px solid #4cc9b0" : "1px solid var(--border-soft)",
                    }}>
                      {fmt(v, metric)} {isBest && <span style={{ color: "#4cc9b0" }}>★</span>}
                    </td>
                  );
                })}
              </tr>
            ))}
          </tbody>
        </table>
        <div style={{ fontSize: 11, color: "var(--muted)", marginTop: 12 }}>
          Renkler: 🟢 yüksek alpha/CAGR/Sharpe veya düşük MaxDD · 🟡 orta · 🔴 zayıf.
          TopN=5×30g (best) → highest KAT median. TopN=20×365g → en kötü.
        </div>
      </div>

      <div className="card" style={{ padding: 14, fontSize: 12, color: "var(--muted)" }}>
        <strong>Yorum:</strong> Equal Weight ile Score Weighted matris çoğu hücrede neredeyse aynı (cap=20%
        TopN=5 doygun, TopN=10/20 marjinal fark). Tek metric&apos;i değiştirip &quot;hangi parametre çiftinde değer
        üretiliyor&quot; kıyaslayın.
      </div>
    </div>
  );
}

function pillStyle(active: boolean): React.CSSProperties {
  return {
    padding: "4px 10px",
    fontSize: 11,
    borderRadius: 4,
    border: `1px solid ${active ? "var(--accent, #6ea8fe)" : "var(--border)"}`,
    background: active ? "var(--surface-2)" : "transparent",
    color: active ? "#6ea8fe" : "var(--muted)",
    cursor: "pointer",
    fontWeight: active ? 600 : 400,
  };
}

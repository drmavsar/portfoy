"use client";

import {
  PolarAngleAxis,
  PolarGrid,
  PolarRadiusAxis,
  Radar,
  RadarChart,
  ResponsiveContainer,
  Tooltip,
} from "recharts";

import type { Fund, FundScores } from "@/app/(app)/_lib/tefas/types";

interface Props {
  funds: Fund[];
  scores: FundScores[];
  colorByCode: Map<string, string>;
}

// Karar #9: 5 ana bileşen (BIST/Gold ayrı eksen değil)
const AXES = [
  { key: "inflation_protection_score", label: "Enflasyon" },
  { key: "tax_advantage_score", label: "Stopaj" },
  { key: "normalized_risk_score", label: "Risk" },
  { key: "long_term_performance_score", label: "Uzun vade" },
  { key: "diversification_score", label: "Çeşitlend." },
] as const;

export function ComponentRadarChart({ funds, scores, colorByCode }: Props) {
  const scoreByCode = new Map(scores.map((s) => [s.fund_code, s]));

  const data = AXES.map((axis) => {
    const point: Record<string, string | number | null> = { axis: axis.label };
    for (const f of funds) {
      const s = scoreByCode.get(f.code);
      const value = s ? (s as unknown as Record<string, number | null>)[axis.key] : null;
      point[f.code] = value ?? 0;
    }
    return point;
  });

  if (funds.length === 0) {
    return (
      <div className="card">
        <div className="card-head">
          <div className="card-title">Bileşen Skor Radar</div>
          <div className="card-sub">veri yok</div>
        </div>
      </div>
    );
  }

  return (
    <div className="card">
      <div className="card-head">
        <div className="card-title">Bileşen Skor Radar</div>
        <div className="card-sub">5 ana bileşen · 0-100</div>
      </div>
      <div style={{ width: "100%", height: 320, padding: 8 }}>
        <ResponsiveContainer width="100%" height="100%">
          <RadarChart data={data} cx="50%" cy="50%" outerRadius="75%">
            <PolarGrid stroke="var(--border-soft)" />
            <PolarAngleAxis
              dataKey="axis"
              tick={{ fill: "var(--muted)", fontSize: 11 }}
            />
            <PolarRadiusAxis
              angle={90}
              domain={[0, 100]}
              tick={{ fill: "var(--muted)", fontSize: 9 }}
              tickCount={5}
            />
            <Tooltip
              contentStyle={{
                background: "var(--bg-elev)",
                border: "1px solid var(--border)",
                borderRadius: 6,
                fontSize: 11,
              }}
            />
            {funds.map((f) => (
              <Radar
                key={f.code}
                name={f.code}
                dataKey={f.code}
                stroke={colorByCode.get(f.code) ?? "#999"}
                fill={colorByCode.get(f.code) ?? "#999"}
                fillOpacity={0.15}
                strokeWidth={2}
              />
            ))}
          </RadarChart>
        </ResponsiveContainer>
      </div>
    </div>
  );
}

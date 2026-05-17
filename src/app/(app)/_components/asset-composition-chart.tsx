"use client";

import {
  Area,
  AreaChart,
  CartesianGrid,
  Legend,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";

import type { DailySnapshotRow } from "@/app/(app)/_lib/daily-snapshots-actions";

interface Props {
  rows: DailySnapshotRow[];
}

function fmtAxis(v: number): string {
  if (v >= 1_000_000) return `${(v / 1_000_000).toFixed(1)}M`;
  if (v >= 1_000) return `${(v / 1_000).toFixed(0)}K`;
  return v.toFixed(0);
}

function fmtDate(iso: string): string {
  const [, m, d] = iso.split("-");
  return `${d}.${m}`;
}

export function AssetCompositionChart({ rows }: Props) {
  if (rows.length === 0) {
    return (
      <div className="empty">
        <div>Henüz günlük snapshot yok</div>
        <div className="hint">
          Sayfa her açıldığında o gün için bir snapshot alınır. Birkaç gün sonra grafik dolar.
        </div>
      </div>
    );
  }

  const data = rows.map((r) => ({
    date: r.snapshot_date,
    label: fmtDate(r.snapshot_date),
    "Nakit (₺)": Number(r.cash_try),
    Döviz: Number(r.fx_try),
    Altın: Number(r.metal_try),
    Hisse: Number(r.equity_mv),
  }));

  return (
    <div style={{ width: "100%", height: 320 }}>
      <ResponsiveContainer width="100%" height="100%">
        <AreaChart data={data} margin={{ top: 8, right: 12, left: 12, bottom: 8 }}>
          <CartesianGrid strokeDasharray="3 3" stroke="var(--border-soft)" />
          <XAxis dataKey="label" stroke="var(--muted)" fontSize={10} tickLine={false} />
          <YAxis stroke="var(--muted)" fontSize={10} tickFormatter={fmtAxis} tickLine={false} />
          <Tooltip
            contentStyle={{
              background: "var(--bg-elev)",
              border: "1px solid var(--border)",
              borderRadius: 6,
              fontSize: 11,
            }}
            labelStyle={{ color: "var(--fg)" }}
            formatter={(value: number) =>
              value.toLocaleString("tr-TR", { maximumFractionDigits: 0 }) + " ₺"
            }
          />
          <Legend wrapperStyle={{ fontSize: 11 }} />
          <Area type="monotone" dataKey="Nakit (₺)" stackId="1" stroke="#4cc9b0" fill="#4cc9b0" fillOpacity={0.6} />
          <Area type="monotone" dataKey="Döviz"   stackId="1" stroke="#6ea8fe" fill="#6ea8fe" fillOpacity={0.6} />
          <Area type="monotone" dataKey="Altın"   stackId="1" stroke="#d4a056" fill="#d4a056" fillOpacity={0.6} />
          <Area type="monotone" dataKey="Hisse"   stackId="1" stroke="#e26a8f" fill="#e26a8f" fillOpacity={0.6} />
        </AreaChart>
      </ResponsiveContainer>
    </div>
  );
}

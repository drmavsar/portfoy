"use client";

import {
  CartesianGrid,
  Legend,
  Line,
  LineChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";

import type { DailySnapshotRow } from "@/app/(app)/_lib/daily-snapshots-actions";

interface Person {
  id: string;
  name: string;
  color: string;
}

interface Props {
  rows: DailySnapshotRow[];
  persons: Person[];
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

export function PersonEquityChart({ rows, persons }: Props) {
  if (rows.length === 0) {
    return (
      <div className="empty">
        <div>Henüz günlük snapshot yok</div>
      </div>
    );
  }

  const data = rows.map((r) => {
    const point: Record<string, string | number> = {
      date: r.snapshot_date,
      label: fmtDate(r.snapshot_date),
    };
    for (const p of persons) {
      point[p.name] = Number((r.equity_by_person as Record<string, number>)[p.id] ?? 0);
    }
    return point;
  });

  return (
    <div style={{ width: "100%", height: 280 }}>
      <ResponsiveContainer width="100%" height="100%">
        <LineChart data={data} margin={{ top: 8, right: 12, left: 12, bottom: 8 }}>
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
            formatter={(value: unknown) => {
              const n = typeof value === "number" ? value : Number(value) || 0;
              return n.toLocaleString("tr-TR", { maximumFractionDigits: 0 }) + " ₺";
            }}
          />
          <Legend wrapperStyle={{ fontSize: 11 }} />
          {persons.map((p) => (
            <Line
              key={p.id}
              type="monotone"
              dataKey={p.name}
              stroke={p.color}
              strokeWidth={2}
              dot={false}
            />
          ))}
        </LineChart>
      </ResponsiveContainer>
    </div>
  );
}

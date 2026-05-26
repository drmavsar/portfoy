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
import { istanbulToday } from "@/lib/finance/istanbul-date";

interface LiveSnapshot {
  total_wealth: number;
  cash_try: number;
  fx_try: number;
  metal_try: number;
  equity_mv: number;
}

interface Props {
  rows: DailySnapshotRow[];
  /** Bugünün canlı değerleri — snapshot 23:00'ta alındığı için son nokta
   *  gün-içinde anlık portföy değeriyle override edilir. */
  live?: LiveSnapshot;
}

function fmtAxis(v: number): string {
  if (v >= 1_000_000) return `₺${(v / 1_000_000).toFixed(1)}M`;
  if (v >= 1_000) return `₺${(v / 1_000).toFixed(0)}K`;
  return `₺${v.toFixed(0)}`;
}

function fmtDate(iso: string): string {
  const [, m, d] = iso.split("-");
  return `${d}/${m}`;
}

function fmtTRY(n: number): string {
  return n.toLocaleString("tr-TR", { maximumFractionDigits: 0 }) + " ₺";
}

function applyLive(rows: DailySnapshotRow[], live?: LiveSnapshot): DailySnapshotRow[] {
  if (!live) return rows;
  const today = istanbulToday();
  const liveRow: DailySnapshotRow = {
    snapshot_date: today,
    total_wealth: live.total_wealth,
    cash_try: live.cash_try,
    fx_try: live.fx_try,
    metal_try: live.metal_try,
    equity_mv: live.equity_mv,
    crypto_try: 0,
    equity_by_person: {},
  };
  if (rows.length > 0 && rows[rows.length - 1].snapshot_date === today) {
    return [...rows.slice(0, -1), { ...rows[rows.length - 1], ...liveRow }];
  }
  return [...rows, liveRow];
}

const SERIES: Array<{ key: "Nakit TRY" | "Döviz TRY" | "Altın TRY" | "Hisse"; color: string; field: "_cash" | "_fx" | "_metal" | "_equity" }> = [
  { key: "Nakit TRY", color: "#4cc9b0", field: "_cash" },
  { key: "Döviz TRY", color: "#e0b341", field: "_fx" },
  { key: "Altın TRY", color: "#d4843a", field: "_metal" },
  { key: "Hisse",     color: "#6ea8fe", field: "_equity" },
];

export function AssetCompositionChart({ rows: rawRows, live }: Props) {
  const rows = applyLive(rawRows, live);
  if (rows.length === 0) {
    return (
      <div className="empty">
        <div>Henüz günlük snapshot yok</div>
        <div className="hint">
          Her gece 23:00&apos;ta günlük snapshot alınır. Birkaç gün sonra grafik dolar.
        </div>
      </div>
    );
  }

  const data = rows.map((r) => {
    const cash = Number(r.cash_try);
    const fx = Number(r.fx_try);
    const metal = Number(r.metal_try);
    const equity = Number(r.equity_mv);
    return {
      date: r.snapshot_date,
      label: fmtDate(r.snapshot_date),
      _cash: cash,
      _fx: fx,
      _metal: metal,
      _equity: equity,
      "Nakit TRY": cash,
      "Döviz TRY": fx,
      "Altın TRY": metal,
      Hisse: equity,
    };
  });

  // Son günün kompozisyon yüzdeleri — alttaki KPI çipleri için
  const last = data[data.length - 1];
  const lastTotal = (last?._cash ?? 0) + (last?._fx ?? 0) + (last?._metal ?? 0) + (last?._equity ?? 0);
  const pct = (n: number) => (lastTotal > 0 ? (n / lastTotal) * 100 : 0);
  const kpis = [
    { label: "Nakit", value: pct(last?._cash ?? 0), color: "#4cc9b0" },
    { label: "Döviz", value: pct(last?._fx ?? 0), color: "#e0b341" },
    { label: "Altın", value: pct(last?._metal ?? 0), color: "#d4843a" },
    { label: "Hisse", value: pct(last?._equity ?? 0), color: "#6ea8fe" },
  ];

  return (
    <div style={{ width: "100%", display: "grid", gap: 12 }}>
      <div style={{ width: "100%", height: 360 }}>
        <ResponsiveContainer width="100%" height="100%">
          <AreaChart data={data} margin={{ top: 8, right: 12, left: 12, bottom: 8 }}>
            <CartesianGrid strokeDasharray="3 3" stroke="var(--border-soft)" />
            <XAxis dataKey="label" stroke="var(--muted)" fontSize={10} tickLine={false} />
            <YAxis
              stroke="var(--muted)"
              fontSize={10}
              tickFormatter={fmtAxis}
              tickLine={false}
              width={64}
            />
            <Tooltip
              contentStyle={{
                background: "var(--bg-elev)",
                border: "1px solid var(--border)",
                borderRadius: 6,
                fontSize: 11,
              }}
              labelStyle={{ color: "var(--fg)" }}
              formatter={(value: unknown, name: unknown, item: unknown) => {
                const n = typeof value === "number" ? value : Number(value) || 0;
                const payload = (item as { payload?: Record<string, number> })?.payload ?? {};
                const total = (payload._cash ?? 0) + (payload._fx ?? 0) + (payload._metal ?? 0) + (payload._equity ?? 0);
                const share = total > 0 ? (n / total) * 100 : 0;
                return `${fmtTRY(n)} · %${share.toFixed(1)}`;
              }}
              labelFormatter={(label: unknown, payloadArr: unknown) => {
                const arr = Array.isArray(payloadArr) ? payloadArr : [];
                const first = arr[0] as { payload?: Record<string, number> } | undefined;
                const p = first?.payload ?? {};
                const total = (p._cash ?? 0) + (p._fx ?? 0) + (p._metal ?? 0) + (p._equity ?? 0);
                return `${label}  ·  ${fmtTRY(total)}`;
              }}
            />
            <Legend wrapperStyle={{ fontSize: 11 }} />
            {SERIES.map((s) => (
              <Area
                key={s.key}
                type="monotone"
                dataKey={s.key}
                stackId="1"
                stroke={s.color}
                fill={s.color}
                fillOpacity={0.7}
              />
            ))}
          </AreaChart>
        </ResponsiveContainer>
      </div>

      {/* Son günün kompozisyon yüzdeleri */}
      <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
        {kpis.map((k) => (
          <span
            key={k.label}
            style={{
              padding: "4px 10px",
              borderRadius: 999,
              background: "var(--bg-elev)",
              border: "1px solid var(--border)",
              fontSize: 12,
              color: "var(--fg)",
              display: "inline-flex",
              alignItems: "center",
              gap: 6,
            }}
          >
            <span
              style={{
                display: "inline-block",
                width: 8,
                height: 8,
                borderRadius: 999,
                background: k.color,
              }}
            />
            {k.label}: %{k.value.toFixed(1)}
          </span>
        ))}
      </div>
    </div>
  );
}

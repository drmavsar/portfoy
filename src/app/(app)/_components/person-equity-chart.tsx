"use client";

import {
  CartesianGrid,
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
  /** Bugünün canlı kişi-bazlı hisse MV'si — son nokta override edilir. */
  liveEquityByPerson?: Record<string, number>;
}

function fmtDate(iso: string): string {
  const [, m, d] = iso.split("-");
  return `${d}.${m}`;
}

function fmtAxis(v: number): string {
  if (v >= 1_000_000) return `${(v / 1_000_000).toFixed(2)}M`;
  if (v >= 1_000) return `${(v / 1_000).toFixed(0)}K`;
  return v.toFixed(0);
}

function fmtTry(v: number): string {
  return `${v.toLocaleString("tr-TR", { maximumFractionDigits: 0 })} ₺`;
}

export function PersonEquityChart({ rows: rawRows, persons, liveEquityByPerson }: Props) {
  // Bugünün canlı değerini uygula
  let rows = rawRows;
  if (liveEquityByPerson && rawRows.length > 0) {
    const today = new Date().toISOString().slice(0, 10);
    const last = rawRows[rawRows.length - 1];
    if (last.snapshot_date === today) {
      rows = [
        ...rawRows.slice(0, -1),
        { ...last, equity_by_person: liveEquityByPerson },
      ];
    } else {
      rows = [
        ...rawRows,
        {
          snapshot_date: today,
          total_wealth: 0,
          cash_try: 0,
          fx_try: 0,
          metal_try: 0,
          equity_mv: 0,
          crypto_try: 0,
          equity_by_person: liveEquityByPerson,
        },
      ];
    }
  }

  if (rows.length === 0 || persons.length === 0) {
    return (
      <div className="empty">
        <div>Henüz günlük snapshot yok</div>
      </div>
    );
  }

  // Kişiler çok farklı büyüklükte (2.7M vs 90k). Aynı eksende çizilirse
  // küçük portföyün dalgalanması görünmez. Her kişiye AYRI grafik +
  // o kişinin min/max'ına göre zoom'lu Y ekseni → günlük oynamalar net.
  return (
    <div style={{ display: "grid", gap: 20 }}>
      <div style={{ fontSize: 11, color: "var(--muted)" }}>
        Her kişinin hisse portföyü ayrı ölçekte — günlük dalgalanmalar görünsün diye
        Y ekseni o kişinin değer aralığına zoom&apos;lu.
      </div>
      {persons.map((p) => {
        const series = rows.map((r) => ({
          label: fmtDate(r.snapshot_date),
          value: Number((r.equity_by_person as Record<string, number>)[p.id] ?? 0),
        }));
        const vals = series
          .map((s) => s.value)
          .filter((n) => Number.isFinite(n) && n > 0);
        if (vals.length === 0) return null;

        const minV = Math.min(...vals);
        const maxV = Math.max(...vals);
        const pad = Math.max(1, (maxV - minV) * 0.2) || maxV * 0.03;
        const domain: [number, number] = [Math.max(0, minV - pad), maxV + pad];

        const firstVal = series.find((s) => s.value > 0)?.value ?? 0;
        const lastVal = series[series.length - 1].value;
        const pct = firstVal > 0 ? ((lastVal - firstVal) / firstVal) * 100 : 0;

        const deltas = series
          .map((s, i) => ({
            label: s.label,
            delta: i === 0 ? 0 : s.value - series[i - 1].value,
          }))
          .slice(1)
          .filter((d) => d.delta !== 0)
          .slice(-14);

        return (
          <div key={p.id}>
            <div
              style={{
                display: "flex",
                alignItems: "center",
                gap: 8,
                marginBottom: 4,
                flexWrap: "wrap",
              }}
            >
              <span
                style={{
                  width: 10,
                  height: 10,
                  borderRadius: 3,
                  background: p.color,
                  display: "inline-block",
                }}
              />
              <span style={{ fontSize: 13, fontWeight: 600, color: "var(--fg)" }}>
                {p.name}
              </span>
              <span style={{ fontSize: 12, color: "var(--muted)" }}>
                {fmtTry(lastVal)}
              </span>
              <span
                style={{
                  fontSize: 12,
                  fontWeight: 600,
                  color: pct >= 0 ? "var(--positive)" : "var(--negative)",
                }}
              >
                {pct >= 0 ? "+" : ""}
                {pct.toFixed(1)}%
              </span>
            </div>
            <div style={{ width: "100%", height: 120 }}>
              <ResponsiveContainer width="100%" height="100%">
                <LineChart data={series} margin={{ top: 4, right: 12, left: 12, bottom: 4 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke="var(--border-soft)" />
                  <XAxis dataKey="label" stroke="var(--muted)" fontSize={10} tickLine={false} />
                  <YAxis
                    domain={domain}
                    stroke="var(--muted)"
                    fontSize={10}
                    tickFormatter={fmtAxis}
                    tickLine={false}
                    width={56}
                  />
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
                      return fmtTry(n);
                    }}
                  />
                  <Line
                    type="monotone"
                    dataKey="value"
                    name={p.name}
                    stroke={p.color}
                    strokeWidth={2}
                    dot={{ r: 3 }}
                  />
                </LineChart>
              </ResponsiveContainer>
            </div>
            {deltas.length > 0 && (
              <div
                style={{
                  display: "flex",
                  gap: 6,
                  flexWrap: "wrap",
                  marginTop: 5,
                  fontSize: 11,
                }}
              >
                {deltas.map((d) => (
                  <span
                    key={d.label}
                    style={{
                      padding: "2px 6px",
                      borderRadius: 4,
                      background:
                        d.delta >= 0 ? "var(--positive-soft)" : "var(--negative-soft)",
                      color: d.delta >= 0 ? "var(--positive)" : "var(--negative)",
                      fontWeight: 600,
                    }}
                  >
                    {d.label}: {d.delta >= 0 ? "+" : ""}
                    {d.delta.toLocaleString("tr-TR", { maximumFractionDigits: 0 })} ₺
                  </span>
                ))}
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
}

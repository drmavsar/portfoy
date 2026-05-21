"use client";

import {
  CartesianGrid,
  Legend,
  Line,
  LineChart,
  ReferenceLine,
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

  if (rows.length === 0) {
    return (
      <div className="empty">
        <div>Henüz günlük snapshot yok</div>
      </div>
    );
  }

  // Her kişinin BAŞLANGIÇ (ilk snapshot) hisse değeri — % indeksleme tabanı.
  // Farklı büyüklükteki portföyleri (2.7M vs 90k) aynı ölçekte kıyaslamak için
  // mutlak TL yerine "ilk güne göre % değişim" gösterilir.
  const baseValue = new Map<string, number>();
  for (const p of persons) {
    const first = Number(
      (rows[0].equity_by_person as Record<string, number>)[p.id] ?? 0,
    );
    baseValue.set(p.id, first);
  }

  const data = rows.map((r) => {
    const point: Record<string, string | number> = {
      date: r.snapshot_date,
      label: fmtDate(r.snapshot_date),
    };
    for (const p of persons) {
      const abs = Number((r.equity_by_person as Record<string, number>)[p.id] ?? 0);
      const base = baseValue.get(p.id) ?? 0;
      point[p.name] = base > 0 ? ((abs - base) / base) * 100 : 0;
      point[`${p.name}__abs`] = abs;
    }
    return point;
  });

  return (
    <div style={{ width: "100%", height: 300 }}>
      <div style={{ fontSize: 11, color: "var(--muted)", marginBottom: 4 }}>
        İlk güne göre % değişim — farklı büyüklükteki portföyleri kıyaslamak için
      </div>
      <ResponsiveContainer width="100%" height="100%">
        <LineChart data={data} margin={{ top: 8, right: 12, left: 12, bottom: 8 }}>
          <CartesianGrid strokeDasharray="3 3" stroke="var(--border-soft)" />
          <XAxis dataKey="label" stroke="var(--muted)" fontSize={10} tickLine={false} />
          <YAxis
            stroke="var(--muted)"
            fontSize={10}
            tickFormatter={(v: number) => `${v >= 0 ? "+" : ""}${v.toFixed(1)}%`}
            tickLine={false}
            width={56}
          />
          <ReferenceLine y={0} stroke="var(--border)" strokeWidth={1} />
          <Tooltip
            contentStyle={{
              background: "var(--bg-elev)",
              border: "1px solid var(--border)",
              borderRadius: 6,
              fontSize: 11,
            }}
            labelStyle={{ color: "var(--fg)" }}
            formatter={(value: unknown, name: unknown, item: unknown) => {
              const pct = typeof value === "number" ? value : Number(value) || 0;
              const payload = (item as { payload?: Record<string, number> })?.payload ?? {};
              const abs = payload[`${String(name)}__abs`] ?? 0;
              return `${pct >= 0 ? "+" : ""}${pct.toFixed(2)}% · ${abs.toLocaleString("tr-TR", { maximumFractionDigits: 0 })} ₺`;
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
              dot={{ r: 3 }}
            />
          ))}
        </LineChart>
      </ResponsiveContainer>
    </div>
  );
}

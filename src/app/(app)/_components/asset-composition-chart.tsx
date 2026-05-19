"use client";

import {
  Area,
  AreaChart,
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

interface Props {
  rows: DailySnapshotRow[];
}

function fmtAxis(v: number): string {
  if (v >= 1_000_000) return `${(v / 1_000_000).toFixed(2)}M`;
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

  const data = rows.map((r) => {
    const total = Number(r.total_wealth) || 1;
    const cash = Number(r.cash_try);
    const fx = Number(r.fx_try);
    const metal = Number(r.metal_try);
    const equity = Number(r.equity_mv);
    return {
      date: r.snapshot_date,
      label: fmtDate(r.snapshot_date),
      total,
      // Mutlak değerler (tooltip için)
      _cash: cash,
      _fx: fx,
      _metal: metal,
      _equity: equity,
      // % oranlar (stacked area için, hep toplamı 100 olur)
      "Nakit (₺)": (cash / total) * 100,
      Döviz: (fx / total) * 100,
      Altın: (metal / total) * 100,
      Hisse: (equity / total) * 100,
    };
  });

  // Toplam servet için min/max — line chart Y-axis zoom için
  const totals = data.map((d) => d.total).filter((n) => Number.isFinite(n));
  const minT = Math.min(...totals);
  const maxT = Math.max(...totals);
  const padding = Math.max(1, (maxT - minT) * 0.15) || maxT * 0.02;
  const yDomain: [number, number] = [
    Math.max(0, minT - padding),
    maxT + padding,
  ];

  // Günlük delta'lar (bar gösterimi için)
  const deltas = data.map((d, i) => ({
    label: d.label,
    delta: i === 0 ? 0 : d.total - data[i - 1].total,
  }));

  return (
    <div style={{ width: "100%", display: "grid", gap: 20 }}>
      {/* Toplam servet zoom'lu line chart — küçük değişimleri görmek için */}
      <div>
        <div style={{ fontSize: 11, color: "var(--muted)", marginBottom: 4, fontWeight: 600 }}>
          TOPLAM SERVET TRENDİ (zoom)
        </div>
        <div style={{ width: "100%", height: 120 }}>
          <ResponsiveContainer width="100%" height="100%">
            <LineChart data={data} margin={{ top: 4, right: 12, left: 12, bottom: 4 }}>
              <CartesianGrid strokeDasharray="3 3" stroke="var(--border-soft)" />
              <XAxis dataKey="label" stroke="var(--muted)" fontSize={10} tickLine={false} />
              <YAxis
                domain={yDomain}
                stroke="var(--muted)"
                fontSize={10}
                tickFormatter={fmtAxis}
                tickLine={false}
                width={60}
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
                  return n.toLocaleString("tr-TR", { maximumFractionDigits: 0 }) + " ₺";
                }}
              />
              <Line
                type="monotone"
                dataKey="total"
                name="Toplam"
                stroke="#6ea8fe"
                strokeWidth={2}
                dot={{ r: 3 }}
              />
            </LineChart>
          </ResponsiveContainer>
        </div>
        <div style={{ display: "flex", gap: 8, flexWrap: "wrap", marginTop: 6, fontSize: 11, color: "var(--muted)" }}>
          {deltas.slice(1).map((d) => (
            <span
              key={d.label}
              title={d.label}
              style={{
                padding: "2px 6px",
                borderRadius: 4,
                background: d.delta >= 0 ? "var(--positive-soft)" : "var(--negative-soft)",
                color: d.delta >= 0 ? "var(--positive)" : "var(--negative)",
                fontWeight: 600,
              }}
            >
              {d.label}: {d.delta >= 0 ? "+" : ""}
              {d.delta.toLocaleString("tr-TR", { maximumFractionDigits: 0 })} ₺
            </span>
          ))}
        </div>
      </div>

      {/* Stacked area — % normalize kompozisyon (her gün toplam = %100) */}
      <div>
        <div style={{ fontSize: 11, color: "var(--muted)", marginBottom: 4, fontWeight: 600 }}>
          VARLIK KOMPOZİSYONU (% pay)
        </div>
        <div style={{ width: "100%", height: 280 }}>
          <ResponsiveContainer width="100%" height="100%">
            <AreaChart data={data} margin={{ top: 8, right: 12, left: 12, bottom: 8 }} stackOffset="expand">
              <CartesianGrid strokeDasharray="3 3" stroke="var(--border-soft)" />
              <XAxis dataKey="label" stroke="var(--muted)" fontSize={10} tickLine={false} />
              <YAxis
                stroke="var(--muted)"
                fontSize={10}
                tickFormatter={(v: number) => `${v.toFixed(0)}%`}
                tickLine={false}
                domain={[0, 100]}
                width={40}
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
                  const pct = typeof value === "number" ? value : Number(value) || 0;
                  const payload = (item as { payload?: Record<string, number> })?.payload ?? {};
                  const absMap: Record<string, number> = {
                    "Nakit (₺)": payload._cash ?? 0,
                    Döviz: payload._fx ?? 0,
                    Altın: payload._metal ?? 0,
                    Hisse: payload._equity ?? 0,
                  };
                  const abs = absMap[String(name)] ?? 0;
                  return `%${pct.toFixed(1)} · ${abs.toLocaleString("tr-TR", { maximumFractionDigits: 0 })} ₺`;
                }}
              />
              <Legend wrapperStyle={{ fontSize: 11 }} />
              <Area type="monotone" dataKey="Nakit (₺)" stackId="1" stroke="#4cc9b0" fill="#4cc9b0" fillOpacity={0.6} />
              <Area type="monotone" dataKey="Döviz"   stackId="1" stroke="#6ea8fe" fill="#6ea8fe" fillOpacity={0.6} />
              <Area type="monotone" dataKey="Altın"   stackId="1" stroke="#d4a056" fill="#d4a056" fillOpacity={0.6} />
              <Area type="monotone" dataKey="Hisse"   stackId="1" stroke="#e26a8f" fill="#e26a8f" fillOpacity={0.6} />
            </AreaChart>
          </ResponsiveContainer>
        </div>
      </div>
    </div>
  );
}

// Reference: ReferenceLine is unused but reserved for future zero/avg lines
void ReferenceLine;

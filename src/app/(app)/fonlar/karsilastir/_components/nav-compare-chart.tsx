"use client";

import { useMemo } from "react";
import {
  CartesianGrid,
  Line,
  LineChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";

import type { Fund } from "@/app/(app)/_lib/tefas/types";

interface Props {
  funds: Fund[];
  navByCode: Record<string, Array<{ as_of: string; nav: number }>>;
  colorByCode: Map<string, string>;
}

interface ChartPoint {
  date: string;
  [code: string]: string | number | null;
}

/**
 * Karar #8: Ortak en eski NAV tarihinden baz 100 normalize.
 * Tüm fonlarda ortak gözlem tarihlerini bulup, her birinin baz noktasını
 * 100'e set ediyoruz.
 */
export function NavCompareChart({ funds, navByCode, colorByCode }: Props) {
  const data = useMemo<ChartPoint[]>(() => {
    if (funds.length === 0) return [];
    const seriesByCode = new Map<string, Map<string, number>>();
    for (const f of funds) {
      const series = navByCode[f.code] ?? [];
      const m = new Map<string, number>();
      for (const p of series) m.set(p.as_of, p.nav);
      seriesByCode.set(f.code, m);
    }

    // Ortak en eski tarih: tüm fonların serileri içinde her birinde mevcut
    // olan en erken date. Sadece bir fon bile varsa ilk noktası.
    const codes = funds.map((f) => f.code);
    const allDates = new Set<string>();
    for (const f of funds) for (const p of navByCode[f.code] ?? []) allDates.add(p.as_of);
    const sortedDates = [...allDates].sort();

    // Her tarihte, her fonun NAV'ı varsa kayda alalım. Eksik tarihlerde
    // forward-fill yerine NULL bırakıyoruz (recharts boşluk gösterir).
    // Baz tarih: tüm fonlarda mevcut olan en eski tarih.
    let baseDate: string | null = null;
    for (const d of sortedDates) {
      const allHave = codes.every((c) => seriesByCode.get(c)?.has(d));
      if (allHave) {
        baseDate = d;
        break;
      }
    }
    if (!baseDate) return [];

    const baseNavs = new Map<string, number>();
    for (const c of codes) {
      const v = seriesByCode.get(c)?.get(baseDate);
      if (v && v > 0) baseNavs.set(c, v);
    }
    if (baseNavs.size !== codes.length) return [];

    const points: ChartPoint[] = [];
    for (const d of sortedDates) {
      if (d < baseDate) continue;
      const point: ChartPoint = { date: d };
      for (const c of codes) {
        const v = seriesByCode.get(c)?.get(d);
        const base = baseNavs.get(c) ?? 0;
        point[c] = v && base > 0 ? (v / base) * 100 : null;
      }
      points.push(point);
    }
    return points;
  }, [funds, navByCode]);

  if (funds.length === 0 || data.length === 0) {
    return (
      <div className="card">
        <div className="card-head">
          <div className="card-title">NAV Normalize Trend</div>
          <div className="card-sub">veri yok</div>
        </div>
        <div style={{ padding: 30, textAlign: "center", color: "var(--muted)", fontSize: 13 }}>
          Karşılaştırma için ortak NAV tarihi bulunamadı. Cron tetiklendikten sonra dolar.
        </div>
      </div>
    );
  }

  const baseDate = data[0]?.date ?? "—";
  const lastDate = data[data.length - 1]?.date ?? "—";

  return (
    <div className="card">
      <div className="card-head">
        <div className="card-title">NAV Normalize Trend</div>
        <div className="card-sub">
          {baseDate}&apos;tan beri (baz 100) · {data.length} gözlem
        </div>
      </div>
      <div style={{ width: "100%", height: 280, padding: 12 }}>
        <ResponsiveContainer width="100%" height="100%">
          <LineChart data={data} margin={{ top: 8, right: 16, left: 16, bottom: 8 }}>
            <CartesianGrid strokeDasharray="3 3" stroke="var(--border-soft)" />
            <XAxis
              dataKey="date"
              stroke="var(--muted)"
              fontSize={10}
              tickLine={false}
              minTickGap={40}
            />
            <YAxis
              stroke="var(--muted)"
              fontSize={10}
              tickLine={false}
              domain={["auto", "auto"]}
              width={50}
            />
            <Tooltip
              contentStyle={{
                background: "var(--bg-elev)",
                border: "1px solid var(--border)",
                borderRadius: 6,
                fontSize: 11,
              }}
              labelStyle={{ color: "var(--fg)" }}
              formatter={(value: unknown, name: unknown) => {
                const n = typeof value === "number" ? value : Number(value);
                return [n.toFixed(1), String(name)];
              }}
            />
            {funds.map((f) => (
              <Line
                key={f.code}
                type="monotone"
                dataKey={f.code}
                stroke={colorByCode.get(f.code) ?? "#999"}
                strokeWidth={2}
                dot={false}
                connectNulls
              />
            ))}
          </LineChart>
        </ResponsiveContainer>
      </div>
      <div style={{ padding: "4px 14px 12px", fontSize: 11, color: "var(--muted)" }}>
        {lastDate} itibariyle ·{" "}
        {funds.map((f, i) => (
          <span key={f.code}>
            <span style={{ color: colorByCode.get(f.code) }}>{f.code}</span>
            {i < funds.length - 1 ? " · " : ""}
          </span>
        ))}
      </div>
    </div>
  );
}

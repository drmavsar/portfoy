"use client";

import { useMemo, useState } from "react";

import {
  Area,
  AreaChart,
  CartesianGrid,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";

import {
  NAV_RANGES,
  filterSeriesByRange,
  type NavRange,
} from "./nav-chart-range";

interface Props {
  series: Array<{ as_of: string; nav: number }>;
  fundCode: string;
}

function fmtAxis(v: number): string {
  if (v >= 1) return v.toFixed(2);
  return v.toFixed(4);
}

function fmtDate(iso: string): string {
  const [, m, d] = iso.split("-");
  return `${d}.${m}`;
}

export function NavChart({ series, fundCode }: Props) {
  // Karar #6: default 3Y
  const [range, setRange] = useState<NavRange>("3Y");

  // Anchor = serideki son NAV tarihi (wall-clock değil).
  // Bug fix: önce Date.now() kullanılıyordu; gerçek bugün NAV tarihinden
  // farklı ise (test/dev/stale prod) 1M/3M/6M cutoff aralık dışına düşüyordu.
  const filteredData = useMemo(() => {
    return filterSeriesByRange(series, range).map((p) => ({
      label: fmtDate(p.as_of),
      full: p.as_of,
      nav: p.nav,
    }));
  }, [series, range]);

  if (series.length === 0) {
    return (
      <div className="card">
        <div className="card-head">
          <div className="card-title">NAV Trendi</div>
          <div className="card-sub">veri yok</div>
        </div>
        <div style={{ padding: 30, textAlign: "center", color: "var(--muted)", fontSize: 13 }}>
          {fundCode} için NAV serisi henüz yok. TEFAS ingest cron tetiklendiğinde dolar.
        </div>
      </div>
    );
  }

  return (
    <div className="card">
      <div className="card-head">
        <div className="card-title">NAV Trendi</div>
        <div className="card-sub">
          {filteredData.length} gözlem · {range === "ALL" ? "tüm geçmiş" : range}
        </div>
      </div>
      <div style={{ padding: "12px 14px 0", display: "flex", gap: 4, flexWrap: "wrap" }}>
        {NAV_RANGES.map((r) => (
          <button
            key={r}
            onClick={() => setRange(r)}
            style={{
              fontSize: 11,
              padding: "3px 10px",
              borderRadius: 4,
              border: `1px solid ${range === r ? "var(--accent)" : "var(--border)"}`,
              background: range === r ? "var(--accent)" : "transparent",
              color: range === r ? "#fff" : "var(--muted)",
              cursor: "pointer",
            }}
          >
            {r}
          </button>
        ))}
      </div>
      {filteredData.length === 0 ? (
        <div
          style={{
            padding: "40px 14px",
            textAlign: "center",
            color: "var(--muted)",
            fontSize: 13,
          }}
        >
          Bu dönem için NAV verisi yok ({range}). Daha geniş bir aralık seçin.
        </div>
      ) : (
      <div style={{ width: "100%", height: 280, padding: "12px 0" }}>
        <ResponsiveContainer width="100%" height="100%">
          <AreaChart data={filteredData} margin={{ top: 8, right: 16, left: 16, bottom: 8 }}>
            <CartesianGrid strokeDasharray="3 3" stroke="var(--border-soft)" />
            <XAxis dataKey="label" stroke="var(--muted)" fontSize={10} tickLine={false} />
            <YAxis
              stroke="var(--muted)"
              fontSize={10}
              tickFormatter={fmtAxis}
              tickLine={false}
              domain={["auto", "auto"]}
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
                const n = typeof value === "number" ? value : Number(value);
                return n.toFixed(6) + " (NAV)";
              }}
              labelFormatter={(_label, payloadArr) => {
                const arr = Array.isArray(payloadArr) ? payloadArr : [];
                const p = (arr[0] as { payload?: { full?: string } })?.payload;
                return p?.full ?? "";
              }}
            />
            <Area
              type="monotone"
              dataKey="nav"
              stroke="#4cc9b0"
              fill="#4cc9b0"
              fillOpacity={0.18}
              strokeWidth={2}
            />
          </AreaChart>
        </ResponsiveContainer>
      </div>
      )}
    </div>
  );
}

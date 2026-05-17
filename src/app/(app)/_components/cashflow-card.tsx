"use client";

import {
  Bar,
  BarChart,
  CartesianGrid,
  Legend,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";

import { Icon, type IconName } from "@/components/ui/icon";
import { fmt } from "@/lib/finance/fmt";

const MONTH_TR = [
  "Oca", "Şub", "Mar", "Nis", "May", "Haz",
  "Tem", "Ağu", "Eyl", "Eki", "Kas", "Ara",
];

function monthLabel(period: string): string {
  const [y, m] = period.split("-");
  return `${MONTH_TR[Number(m) - 1]} ${y.slice(2)}`;
}

function fmtAxis(v: number): string {
  if (v >= 1_000_000) return `${(v / 1_000_000).toFixed(1)}M`;
  if (v >= 1_000) return `${(v / 1_000).toFixed(0)}K`;
  return v.toFixed(0);
}

export interface MonthBucket {
  period: string; // YYYY-MM
  inflow: number;
  outflow: number;
}

interface Props {
  months: MonthBucket[];
  /** Üst sağ rozet ("YTD", "Son 3 Ay" vb.) */
  badgeText?: string;
  /** Tablo başlığı (default: "Aylık Nakit Akış") */
  title?: string;
  /** Subtitle (default: "Aylık gelir ve giderlerin nakit akışına etkisi") */
  subtitle?: string;
}

export function CashflowCard({
  months,
  badgeText = "YTD",
  title = "Aylık Nakit Akış",
  subtitle = "Aylık gelir ve giderlerin nakit akışına etkisi",
}: Props) {
  const chartData = months.map((b) => ({
    name: monthLabel(b.period),
    inflow: b.inflow,
    outflow: b.outflow,
  }));

  const totalInflow = months.reduce((s, b) => s + b.inflow, 0);
  const totalOutflow = months.reduce((s, b) => s + b.outflow, 0);
  const totalNet = totalInflow - totalOutflow;
  const cashMargin = totalInflow > 0 ? (totalNet / totalInflow) * 100 : 0;

  return (
    <div className="card">
      <div className="card-head">
        <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
          <span
            style={{
              width: 28,
              height: 28,
              borderRadius: 6,
              background: "color-mix(in srgb, var(--positive) 14%, transparent)",
              color: "var(--positive)",
              display: "inline-flex",
              alignItems: "center",
              justifyContent: "center",
            }}
          >
            <Icon name="report" size={14} />
          </span>
          <div>
            <div className="card-title">{title}</div>
            <div
              className="card-sub"
              style={{ marginLeft: 0, fontSize: 11, color: "var(--muted)" }}
            >
              {subtitle}
            </div>
          </div>
        </div>
        <div style={{ marginLeft: "auto" }}>
          <span
            style={{
              fontSize: 11,
              padding: "3px 10px",
              border: "1px solid var(--positive)",
              color: "var(--positive)",
              borderRadius: 100,
            }}
          >
            {badgeText.toUpperCase()}
          </span>
        </div>
      </div>

      <div style={{ padding: "16px 20px 8px", height: 340 }}>
        {chartData.length === 0 ? (
          <div className="empty">
            <div>Bu aralıkta veri yok</div>
          </div>
        ) : (
          <ResponsiveContainer width="100%" height="100%">
            <BarChart data={chartData} margin={{ top: 24, right: 16, left: 0, bottom: 4 }}>
              <CartesianGrid
                stroke="var(--border-soft)"
                strokeDasharray="3 3"
                vertical={false}
              />
              <XAxis
                dataKey="name"
                stroke="var(--muted)"
                fontSize={11}
                tickLine={false}
                axisLine={{ stroke: "var(--border-soft)" }}
              />
              <YAxis
                stroke="var(--muted)"
                fontSize={11}
                tickLine={false}
                axisLine={false}
                tickFormatter={(v: number) => `${fmtAxis(v)} ₺`}
                width={80}
                label={{
                  value: "Tutar (₺)",
                  angle: -90,
                  position: "insideLeft",
                  style: { fill: "var(--muted)", fontSize: 11 },
                }}
              />
              <Tooltip
                cursor={{ fill: "var(--surface-2)", opacity: 0.4 }}
                contentStyle={{
                  background: "var(--surface)",
                  border: "1px solid var(--border)",
                  borderRadius: 8,
                  fontSize: 12,
                }}
                formatter={(value: unknown, name: unknown) => {
                  const num = Number(value);
                  const lbl = name === "inflow" ? "Nakit Girişi" : "Nakit Çıkışı";
                  return [`${fmt.tr(num, 0)} ₺`, lbl];
                }}
              />
              <Legend
                iconType="circle"
                wrapperStyle={{ fontSize: 12, paddingBottom: 12 }}
                formatter={(value: string) =>
                  value === "inflow" ? "Nakit Girişi (Gelir)" : "Nakit Çıkışı (Gider)"
                }
              />
              <Bar
                dataKey="inflow"
                fill="var(--positive)"
                radius={[6, 6, 0, 0]}
                maxBarSize={56}
              />
              <Bar
                dataKey="outflow"
                fill="var(--negative)"
                radius={[6, 6, 0, 0]}
                maxBarSize={56}
              />
            </BarChart>
          </ResponsiveContainer>
        )}
      </div>

      <div
        style={{
          borderTop: "1px solid var(--border-soft)",
          padding: "14px 20px",
          display: "grid",
          gridTemplateColumns: "repeat(auto-fit, minmax(180px, 1fr))",
          gap: 14,
        }}
      >
        <KpiCard
          label="Toplam Nakit Girişi"
          value={`${fmt.tr(totalInflow, 0)} ₺`}
          tone="positive"
          icon="arrowInc"
        />
        <KpiCard
          label="Toplam Nakit Çıkışı"
          value={`${fmt.tr(totalOutflow, 0)} ₺`}
          tone="negative"
          icon="arrowExp"
        />
        <KpiCard
          label="Net Nakit Akışı"
          value={`${fmt.tr(totalNet, 0)} ₺`}
          tone={totalNet >= 0 ? "positive" : "negative"}
          icon="wallet"
        />
        <KpiCard
          label="Nakit Marjı"
          value={`${cashMargin.toFixed(2).replace(".", ",")}%`}
          tone={cashMargin >= 0 ? "positive" : "negative"}
          icon="sparkles"
        />
      </div>
    </div>
  );
}

function KpiCard({
  label,
  value,
  tone,
  icon,
}: {
  label: string;
  value: string;
  tone: "positive" | "negative";
  icon: IconName;
}) {
  const color = tone === "positive" ? "var(--positive)" : "var(--negative)";
  const bg =
    tone === "positive"
      ? "color-mix(in srgb, var(--positive) 16%, transparent)"
      : "color-mix(in srgb, var(--negative) 16%, transparent)";
  return (
    <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
      <span
        style={{
          width: 32,
          height: 32,
          borderRadius: 50,
          background: bg,
          color,
          display: "inline-flex",
          alignItems: "center",
          justifyContent: "center",
          flexShrink: 0,
        }}
      >
        <Icon name={icon} size={15} />
      </span>
      <div style={{ minWidth: 0 }}>
        <div style={{ fontSize: 11, color: "var(--muted)", marginBottom: 2 }}>{label}</div>
        <div className="tabular" style={{ fontSize: 18, fontWeight: 700, color }}>
          {value}
        </div>
      </div>
    </div>
  );
}

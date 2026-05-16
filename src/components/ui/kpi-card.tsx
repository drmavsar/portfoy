import type { ReactNode } from "react";

import { Sparkline } from "@/components/charts/sparkline";

interface KpiCardProps {
  label: string;
  value: string;
  delta?: string;
  deltaLabel?: string;
  deltaPos?: boolean | null;
  spark?: number[];
  sparkColor?: string;
  footer?: ReactNode;
}

export function KpiCard({
  label,
  value,
  delta,
  deltaLabel,
  deltaPos,
  spark,
  sparkColor,
  footer,
}: KpiCardProps) {
  const deltaCls =
    deltaPos === true
      ? "delta-pos"
      : deltaPos === false
        ? "delta-neg"
        : "delta-mut";
  const glyph = deltaPos === true ? "▲" : deltaPos === false ? "▼" : "•";

  return (
    <div className="kpi">
      <div className="kpi-label">{label}</div>
      <div className="kpi-value">{value}</div>
      <div className="kpi-row">
        {delta != null && (
          <span className={deltaCls}>
            {glyph} {delta}
          </span>
        )}
        {deltaLabel && <span className="delta-mut">{deltaLabel}</span>}
      </div>
      {spark && (
        <div className="kpi-spark">
          <Sparkline values={spark} width={100} height={28} fill stroke={1.6} color={sparkColor} />
        </div>
      )}
      {footer && (
        <div style={{ marginTop: 8, fontSize: 11, color: "var(--muted)" }}>{footer}</div>
      )}
    </div>
  );
}

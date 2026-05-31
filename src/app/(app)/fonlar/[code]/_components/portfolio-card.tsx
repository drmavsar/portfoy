import Link from "next/link";

import { fmt } from "@/lib/finance/fmt";
import { actionChipConfig } from "@/app/(app)/_lib/tefas/allocation-ui-helpers";
import type { FundPortfolioInfo } from "@/app/(app)/_lib/tefas/fund-portfolio-info";

export function PortfolioCard({ info }: { info: FundPortfolioInfo }) {
  const chip = actionChipConfig(info.action);
  const deltaSigned = info.delta_pct;
  const deltaColor =
    Math.abs(deltaSigned) < 0.01
      ? "var(--muted)"
      : deltaSigned > 0
        ? "var(--warning)"
        : "var(--accent)";

  return (
    <div className="card card-pad" style={{ padding: 16 }}>
      <div
        style={{
          display: "flex",
          justifyContent: "space-between",
          alignItems: "baseline",
          marginBottom: 12,
        }}
      >
        <div style={{ fontWeight: 600, fontSize: 13 }}>Portföydeki Konum</div>
        <Link
          href="/fonlar/allocation"
          style={{
            fontSize: 11,
            color: "var(--accent)",
            textDecoration: "none",
          }}
        >
          Allocation ekranı →
        </Link>
      </div>

      <div
        style={{
          display: "grid",
          gridTemplateColumns: "repeat(4, minmax(0, 1fr))",
          gap: 12,
          alignItems: "end",
        }}
      >
        <Mini
          label="Portföyde mi?"
          value={info.in_portfolio ? "Evet" : "Hayır"}
          tone={info.in_portfolio ? "positive" : "muted"}
        />
        <Mini
          label="Mevcut Ağırlık"
          value={`%${(info.current_weight_pct * 100).toFixed(1)}`}
        />
        <Mini
          label={
            info.in_target
              ? `Hedef Ağırlık · #${info.target_rank ?? "?"}/Top`
              : "Hedef Ağırlık"
          }
          value={`%${(info.target_weight_pct * 100).toFixed(1)}`}
          tone={info.in_target ? "accent" : "muted"}
        />
        <div>
          <div style={{ fontSize: 9, color: "var(--muted)", textTransform: "uppercase" }}>
            Eylem
          </div>
          <div style={{ display: "flex", gap: 8, alignItems: "center", marginTop: 6 }}>
            <span className={chip.className} style={{ fontWeight: 600 }}>
              {chip.label}
            </span>
            <span style={{ color: deltaColor, fontSize: 11 }}>
              {deltaSigned > 0 ? "+" : ""}%{(deltaSigned * 100).toFixed(1)}
            </span>
          </div>
        </div>
      </div>

      {info.in_portfolio && (
        <div
          style={{
            marginTop: 10,
            fontSize: 11,
            color: "var(--muted)",
            display: "flex",
            gap: 12,
            flexWrap: "wrap",
          }}
        >
          <span>{info.current_quantity.toFixed(4)} adet</span>
          <span>·</span>
          <span>{fmt.try(info.current_market_value_try)}</span>
        </div>
      )}
    </div>
  );
}

function Mini({
  label,
  value,
  tone = "default",
}: {
  label: string;
  value: string;
  tone?: "default" | "accent" | "positive" | "muted";
}) {
  const colorMap: Record<string, string> = {
    default: "var(--fg)",
    accent: "var(--accent)",
    positive: "var(--positive)",
    muted: "var(--muted)",
  };
  return (
    <div>
      <div style={{ fontSize: 9, color: "var(--muted)", textTransform: "uppercase" }}>
        {label}
      </div>
      <div style={{ fontSize: 14, fontWeight: 600, color: colorMap[tone], marginTop: 4 }}>
        {value}
      </div>
    </div>
  );
}

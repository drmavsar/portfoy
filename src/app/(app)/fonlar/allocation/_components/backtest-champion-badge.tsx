import type { AllocationResult } from "@/app/(app)/_lib/tefas/allocation-types";

export function BacktestChampionBadge({
  champion,
  topN,
}: {
  champion: AllocationResult["backtest_champion"];
  topN: number;
}) {
  return (
    <div
      style={{
        display: "inline-flex",
        gap: 8,
        alignItems: "center",
        padding: "6px 10px",
        background: "var(--surface-2)",
        border: "1px solid var(--border-soft)",
        borderRadius: 6,
        fontSize: 11,
        color: "var(--muted)",
      }}
      title="Sprint-5.6 backtest champion config — referans, production değil."
    >
      <span style={{ fontWeight: 600, color: "var(--accent)" }}>Backtest Champion</span>
      <span>·</span>
      <span>Top {champion.TOP_N} / {champion.REBALANCE_DAYS}g</span>
      <span style={{ color: "var(--muted)", opacity: 0.7 }}>
        (Production: Top {topN} / 90g)
      </span>
    </div>
  );
}

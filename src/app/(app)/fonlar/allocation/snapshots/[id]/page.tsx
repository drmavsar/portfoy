import Link from "next/link";
import { notFound } from "next/navigation";

import { getAllocationSnapshot } from "@/app/(app)/_lib/tefas/snapshot-actions";
import type {
  AllocationCurrentPosition,
  AllocationDiff,
  AllocationFlag,
  AllocationSummary,
  AllocationTargetFund,
  SellDryRunResult,
} from "@/app/(app)/_lib/tefas/allocation-types";

import { DataQualityFlags } from "../../_components/data-quality-flags";
import { NonFundAssets } from "../../_components/non-fund-assets";
import { NonTargetPositions } from "../../_components/non-target-positions";
import { SummaryCard } from "../../_components/summary-card";
import { TargetTable } from "../../_components/target-table";

export const dynamic = "force-dynamic";

interface PageProps {
  params: Promise<{ id: string }>;
}

export default async function SnapshotDetailPage({ params }: PageProps) {
  const { id } = await params;
  const snap = await getAllocationSnapshot(id);
  if (!snap) notFound();

  const targets = asArray<AllocationTargetFund>(snap.target_funds);
  const current = asArray<AllocationCurrentPosition>(snap.current_positions);
  const diffs = asArray<AllocationDiff>(snap.diffs);
  const sellDryRuns = asArray<SellDryRunResult>(snap.sell_dry_runs);
  const flags = asArray<AllocationFlag>(snap.data_quality_flags);
  const summary = asObject<AllocationSummary>(snap.summary, {
    total_market_value_try: Number(snap.total_market_value_try) || 0,
    total_buy_try: 0,
    total_sell_try: 0,
    estimated_net_proceeds_try: 0,
    net_cash_need_try: 0,
    total_realized_pnl_try: 0,
    total_tax_try: 0,
    total_net_pnl_try: 0,
    rebalance_band_pct: Number(snap.rebalance_band_pct) || 0.05,
    top_n: snap.top_n,
    strategy: "equal_weight",
  });

  return (
    <div>
      <div className="page-head" style={{ display: "flex", alignItems: "flex-end", gap: 16 }}>
        <div style={{ flex: 1, minWidth: 0 }}>
          <Link
            href="/fonlar/allocation/snapshots"
            style={{ fontSize: 12, color: "var(--muted)", textDecoration: "none" }}
          >
            ← Snapshot Tarihçesi
          </Link>
          <div className="page-title">
            Snapshot · {formatDate(snap.snapshot_date)}
          </div>
          <div className="page-sub">
            Bu sayfa snapshot anındaki durumu olduğu gibi gösterir. Read-only.
            {" "}Top {snap.top_n} · {snap.strategy} · ±%
            {(Number(snap.rebalance_band_pct) * 100).toFixed(0)}
          </div>
        </div>
        <Link href="/fonlar/allocation" className="btn btn-ghost">
          Güncel Allocation →
        </Link>
      </div>

      <div style={{ display: "grid", gap: 16 }}>
        <SummaryCard summary={summary} generatedAt={snap.as_of} />

        {flags.length > 0 && <DataQualityFlags flags={flags} />}

        {snap.notes && (
          <div
            style={{
              padding: 12,
              background: "var(--surface-2)",
              borderRadius: 6,
              fontSize: 12,
              borderLeft: "3px solid var(--accent)",
            }}
          >
            <div
              style={{
                fontSize: 10,
                color: "var(--muted)",
                textTransform: "uppercase",
                marginBottom: 4,
              }}
            >
              Not
            </div>
            <div style={{ whiteSpace: "pre-wrap" }}>{snap.notes}</div>
          </div>
        )}

        <TargetTable
          target={targets}
          diffs={diffs}
          current={current}
          sellDryRuns={sellDryRuns}
          forbiddenWordsSafe={true /* snapshot persist'inde guard çalıştı */}
        />

        <NonTargetPositions diffs={diffs} current={current} sellDryRuns={sellDryRuns} />

        <NonFundAssets current={current} />

        <div
          style={{
            fontSize: 11,
            color: "var(--muted)",
            padding: "10px 12px",
            background: "var(--surface-2)",
            borderRadius: 6,
          }}
        >
          Snapshot oluşturma: {new Date(snap.created_at).toLocaleString("tr-TR")} ·
          Son güncelleme: {new Date(snap.updated_at).toLocaleString("tr-TR")}
        </div>
      </div>
    </div>
  );
}

function formatDate(d: string): string {
  const [y, m, day] = d.split("-");
  if (y && m && day) return `${day}.${m}.${y}`;
  return d;
}

function asArray<T>(v: unknown): T[] {
  if (Array.isArray(v)) return v as T[];
  return [];
}

function asObject<T extends object>(v: unknown, fallback: T): T {
  if (v && typeof v === "object" && !Array.isArray(v)) return { ...fallback, ...(v as T) };
  return fallback;
}

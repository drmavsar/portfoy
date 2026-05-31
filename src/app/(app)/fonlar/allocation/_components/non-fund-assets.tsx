import { fmt } from "@/lib/finance/fmt";
import type { AllocationCurrentPosition } from "@/app/(app)/_lib/tefas/allocation-types";

export function NonFundAssets({
  current,
}: {
  current: AllocationCurrentPosition[];
}) {
  const nonFund = current.filter((c) => c.asset_class !== "fund");
  if (nonFund.length === 0) return null;
  const total = nonFund.reduce((s, c) => s + c.market_value_try, 0);
  return (
    <div className="card card-pad">
      <div
        style={{
          display: "flex",
          justifyContent: "space-between",
          alignItems: "baseline",
          marginBottom: 10,
        }}
      >
        <div style={{ fontWeight: 600, fontSize: 13 }}>
          Allocation Kapsamı Dışındaki Varlıklar
        </div>
        <div style={{ fontSize: 11, color: "var(--muted)" }}>
          {nonFund.length} varlık · {fmt.try(total)}
        </div>
      </div>
      <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
        {nonFund.map((c) => (
          <div
            key={c.asset_id}
            style={{
              display: "flex",
              gap: 8,
              alignItems: "baseline",
              padding: "6px 10px",
              background: "var(--surface-2)",
              borderRadius: 6,
              fontSize: 12,
            }}
          >
            <code style={{ fontFamily: "var(--font-mono)", fontWeight: 600 }}>
              {c.symbol}
            </code>
            <span style={{ color: "var(--muted)", fontSize: 10 }}>{c.asset_class}</span>
            <span style={{ fontFamily: "var(--font-mono)" }}>
              {fmt.try(c.market_value_try)}
            </span>
          </div>
        ))}
      </div>
      <div style={{ fontSize: 10, color: "var(--muted)", marginTop: 8 }}>
        Bu varlıklar Mehmet Score ve Top N hesabına dahil değildir.
      </div>
    </div>
  );
}

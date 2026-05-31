import Link from "next/link";

import { fmt } from "@/lib/finance/fmt";
import type {
  AllocationCurrentPosition,
  AllocationDiff,
  SellDryRunResult,
} from "@/app/(app)/_lib/tefas/allocation-types";
import {
  actionChipConfig,
  buildTradePrefillHref,
  suggestQuantityFromDelta,
} from "@/app/(app)/_lib/tefas/allocation-ui-helpers";

export function NonTargetPositions({
  diffs,
  current,
  sellDryRuns,
}: {
  diffs: AllocationDiff[];
  current: AllocationCurrentPosition[];
  sellDryRuns: SellDryRunResult[];
}) {
  const nonTarget = diffs.filter((d) => !d.in_target && d.in_portfolio);
  if (nonTarget.length === 0) return null;

  const dryRunByFund = new Map(sellDryRuns.map((r) => [r.fund_code, r]));
  const currentByFund = new Map(
    current.filter((c) => c.fund_code).map((c) => [c.fund_code as string, c]),
  );

  return (
    <div className="card">
      <div className="card-head">
        <div className="card-title">Top {diffs.filter((d) => d.in_target).length} Dışı Fon Pozisyonları</div>
        <div className="card-sub">{nonTarget.length} fon — AZALTMA önerisi</div>
      </div>
      <table className="dg">
        <thead>
          <tr>
            <th>Fon</th>
            <th>Ad</th>
            <th className="num">Mevcut Ağırlık</th>
            <th className="num">Tahmini Satış</th>
            <th>Eylem</th>
            <th></th>
          </tr>
        </thead>
        <tbody>
          {nonTarget.map((d) => {
            const cur = currentByFund.get(d.fund_code);
            const dr = dryRunByFund.get(d.fund_code);
            const chip = actionChipConfig(d.action);
            const qty = cur ? suggestQuantityFromDelta(Math.abs(d.delta_try), cur.last_price_try ?? cur.wac_try) : null;
            return (
              <tr key={d.fund_code}>
                <td>
                  <Link
                    href={`/fonlar/${d.fund_code}`}
                    style={{
                      fontFamily: "var(--font-mono)",
                      fontWeight: 600,
                      textDecoration: "none",
                      color: "var(--fg)",
                    }}
                  >
                    {d.fund_code}
                  </Link>
                </td>
                <td
                  style={{
                    maxWidth: 260,
                    overflow: "hidden",
                    textOverflow: "ellipsis",
                    whiteSpace: "nowrap",
                  }}
                  title={d.fund_name ?? ""}
                >
                  {d.fund_name ?? "—"}
                </td>
                <td className="num">%{(d.current_weight_pct * 100).toFixed(1)}</td>
                <td className="num">
                  {dr ? (
                    <>
                      {fmt.try(dr.estimated_net_proceeds_try)}
                      <div style={{ fontSize: 10, color: "var(--muted)" }}>
                        Stopaj: {fmt.try(dr.estimated_withholding_try)}
                      </div>
                    </>
                  ) : (
                    fmt.try(d.delta_try)
                  )}
                </td>
                <td>
                  <span className={chip.className} style={{ fontWeight: 600 }}>
                    {chip.label}
                  </span>
                </td>
                <td>
                  {cur && (
                    <Link
                      href={buildTradePrefillHref({
                        fundCode: d.fund_code,
                        side: "sell",
                        quantity: qty ?? undefined,
                        price: cur.last_price_try ?? cur.wac_try,
                      })}
                      className="btn btn-sm btn-ghost"
                      style={{ whiteSpace: "nowrap", fontSize: 11 }}
                      title="Trade formuna prefill ile yönlendir — emir gönderilmez."
                    >
                      İşlem Kaydet →
                    </Link>
                  )}
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}

import Link from "next/link";

import { fmt } from "@/lib/finance/fmt";
import type {
  AllocationCurrentPosition,
  AllocationDiff,
  AllocationTargetFund,
  KomiteSnippet,
  SellDryRunResult,
} from "@/app/(app)/_lib/tefas/allocation-types";
import {
  actionChipConfig,
  buildTradePrefillHref,
  suggestQuantityFromDelta,
} from "@/app/(app)/_lib/tefas/allocation-ui-helpers";

export function TargetTable({
  target,
  diffs,
  current,
  sellDryRuns,
  forbiddenWordsSafe,
}: {
  target: AllocationTargetFund[];
  diffs: AllocationDiff[];
  current: AllocationCurrentPosition[];
  sellDryRuns: SellDryRunResult[];
  forbiddenWordsSafe: boolean;
}) {
  const diffByFund = new Map(diffs.map((d) => [d.fund_code, d]));
  const currentByFund = new Map(
    current.filter((c) => c.fund_code).map((c) => [c.fund_code as string, c]),
  );
  const dryRunByFund = new Map(sellDryRuns.map((r) => [r.fund_code, r]));

  if (target.length === 0) {
    return (
      <div className="card card-pad empty">
        <div className="title">Top N henüz hesaplanamadı</div>
        <div>Skor altyapısı yeterli komponente sahip değil.</div>
      </div>
    );
  }

  return (
    <div className="card" style={{ overflow: "hidden" }}>
      <div className="card-head">
        <div className="card-title">Önerilen Dağılım (Top {target.length})</div>
        <div className="card-sub">
          Eşit ağırlık · Yeniden dengeleme bandı ±%
          {diffs[0] ? "5" : "5"}
        </div>
      </div>
      <table className="dg">
        <thead>
          <tr>
            <th style={{ width: 60 }}>Fon</th>
            <th>Ad</th>
            <th>Kategori</th>
            <th className="num">Skor</th>
            <th className="num">Hedef</th>
            <th className="num">Mevcut</th>
            <th className="num">Δ</th>
            <th>Eylem</th>
            <th>Komite Gerekçesi</th>
            <th></th>
          </tr>
        </thead>
        <tbody>
          {target.map((t) => {
            const diff = diffByFund.get(t.fund_code);
            const cur = currentByFund.get(t.fund_code);
            const chip = diff ? actionChipConfig(diff.action) : null;

            return (
              <tr key={t.fund_code}>
                <td>
                  <Link
                    href={`/fonlar/${t.fund_code}`}
                    style={{
                      fontFamily: "var(--font-mono)",
                      fontWeight: 600,
                      textDecoration: "none",
                      color: "var(--fg)",
                    }}
                  >
                    {t.fund_code}
                  </Link>
                </td>
                <td
                  style={{
                    maxWidth: 220,
                    overflow: "hidden",
                    textOverflow: "ellipsis",
                    whiteSpace: "nowrap",
                  }}
                  title={t.fund_name ?? ""}
                >
                  {t.fund_name ?? "—"}
                </td>
                <td style={{ fontSize: 11, color: "var(--muted)" }}>
                  {t.category_name ?? "—"}
                </td>
                <td className="num">
                  <span style={{ color: scoreColor(t.mehmet_score), fontWeight: 600 }}>
                    {Math.round(t.mehmet_score)}
                  </span>
                  <span style={{ fontSize: 9, color: "var(--muted)", marginLeft: 4 }}>
                    /{t.components_used}
                  </span>
                </td>
                <td className="num">{pct(t.target_weight_pct)}</td>
                <td className="num">{pct(diff?.current_weight_pct ?? 0)}</td>
                <td className="num">
                  {diff ? (
                    <span
                      style={{
                        color:
                          Math.abs(diff.delta_pct) < 0.01
                            ? "var(--muted)"
                            : diff.delta_pct > 0
                              ? "var(--warning)"
                              : "var(--accent)",
                      }}
                    >
                      {signedPct(diff.delta_pct)}
                    </span>
                  ) : (
                    "—"
                  )}
                </td>
                <td>
                  {chip && (
                    <span className={chip.className} style={{ fontWeight: 600 }}>
                      {chip.label}
                    </span>
                  )}
                </td>
                <td style={{ fontSize: 11 }}>
                  {forbiddenWordsSafe && t.komite ? (
                    <KomiteCell snippet={t.komite} />
                  ) : (
                    <span style={{ color: "var(--muted)" }}>—</span>
                  )}
                </td>
                <td>
                  {diff && diff.action !== "TUT" && cur != null && (
                    <PrefillLink
                      fundCode={t.fund_code}
                      diff={diff}
                      currentNav={cur.last_price_try ?? cur.wac_try}
                    />
                  )}
                  {diff && diff.action === "EKLEME" && !cur && (
                    // Portföyde yok, sadece alış prefill (qty TRY'den hesap için
                    // NAV gerekli — last_price unknown → form NAV default'una bırak)
                    <PrefillLink fundCode={t.fund_code} diff={diff} currentNav={null} />
                  )}
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>

      {/* AZALTMA satırları için sell dry-run blokları */}
      {dryRunByFund.size > 0 && (
        <div style={{ padding: 16, borderTop: "1px solid var(--border-soft)" }}>
          <div
            style={{
              fontSize: 11,
              color: "var(--muted)",
              textTransform: "uppercase",
              letterSpacing: 0.06,
              marginBottom: 10,
            }}
          >
            Tahmini Satış Etkileri
          </div>
          <div style={{ display: "grid", gap: 8 }}>
            {Array.from(dryRunByFund.values()).map((dr) => (
              <SellDryRunRow key={dr.fund_code} dryRun={dr} />
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

function KomiteCell({ snippet }: { snippet: KomiteSnippet }) {
  return (
    <div style={{ display: "grid", gap: 2 }}>
      {snippet.strength_first && (
        <div>{snippet.strength_first}</div>
      )}
      <div
        style={{ display: "flex", gap: 8, fontSize: 10, color: "var(--muted)", flexWrap: "wrap" }}
      >
        {snippet.category_rank != null && snippet.category_total != null && (
          <span>
            {snippet.category_medal ? `${snippet.category_medal} ` : ""}
            Kategori {snippet.category_rank}/{snippet.category_total}
            {snippet.category_band_label ? ` · ${snippet.category_band_label}` : ""}
          </span>
        )}
        {snippet.tax_impact_label && <span>· {snippet.tax_impact_label}</span>}
      </div>
      {snippet.data_quality_flags.length > 0 && (
        <div
          style={{
            display: "flex",
            gap: 6,
            flexWrap: "wrap",
            marginTop: 2,
          }}
        >
          {snippet.data_quality_flags.map((f, i) => (
            <span
              key={`${f.severity}-${i}`}
              style={{
                fontSize: 9,
                padding: "1px 6px",
                borderRadius: 3,
                background:
                  f.severity === "critical"
                    ? "var(--negative-soft)"
                    : f.severity === "warn"
                      ? "var(--warning-soft)"
                      : "var(--surface-2)",
                color:
                  f.severity === "critical"
                    ? "var(--negative)"
                    : f.severity === "warn"
                      ? "var(--warning)"
                      : "var(--muted)",
              }}
            >
              {f.label}
            </span>
          ))}
        </div>
      )}
    </div>
  );
}

function PrefillLink({
  fundCode,
  diff,
  currentNav,
}: {
  fundCode: string;
  diff: AllocationDiff;
  currentNav: number | null;
}) {
  const side: "buy" | "sell" = diff.action === "AZALTMA" ? "sell" : "buy";
  const qty = suggestQuantityFromDelta(Math.abs(diff.delta_try), currentNav);
  const href = buildTradePrefillHref({
    fundCode,
    side,
    quantity: qty ?? undefined,
    price: currentNav ?? undefined,
  });
  return (
    <Link
      href={href}
      className="btn btn-sm btn-ghost"
      style={{ whiteSpace: "nowrap", fontSize: 11 }}
      title="Trade formuna prefill ile yönlendir — emir gönderilmez."
    >
      İşlem Kaydet →
    </Link>
  );
}

function SellDryRunRow({ dryRun }: { dryRun: SellDryRunResult }) {
  return (
    <div
      style={{
        display: "grid",
        gridTemplateColumns: "100px 1fr",
        gap: 14,
        padding: 12,
        background: "var(--surface-2)",
        borderRadius: 6,
        fontSize: 12,
      }}
    >
      <div>
        <code style={{ fontFamily: "var(--font-mono)", fontWeight: 600 }}>
          {dryRun.fund_code}
        </code>
        <div style={{ fontSize: 10, color: "var(--muted)", marginTop: 2 }}>
          {dryRun.sell_quantity.toFixed(2)} adet · {dryRun.lots_consumed} lot
        </div>
      </div>
      <div
        style={{
          display: "grid",
          gridTemplateColumns: "repeat(5, minmax(0, 1fr))",
          gap: 8,
        }}
      >
        <Mini label="Maliyet" value={fmt.try(dryRun.estimated_cost_basis_try)} />
        <Mini label="Gelir" value={fmt.try(dryRun.estimated_proceeds_try)} />
        <Mini
          label="Realize K/Z"
          value={fmt.try(dryRun.estimated_realized_pnl_try)}
          tone={dryRun.estimated_realized_pnl_try >= 0 ? "positive" : "negative"}
        />
        <Mini
          label={`Stopaj (${dryRun.applied_tax_kind})`}
          value={fmt.try(dryRun.estimated_withholding_try)}
          tone={dryRun.estimated_withholding_try > 0 ? "warning" : "muted"}
        />
        <Mini
          label="Net Gelir"
          value={fmt.try(dryRun.estimated_net_proceeds_try)}
        />
      </div>
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
  tone?: "default" | "positive" | "negative" | "warning" | "muted";
}) {
  const colorMap: Record<string, string> = {
    default: "var(--fg)",
    positive: "var(--positive)",
    negative: "var(--negative)",
    warning: "var(--warning)",
    muted: "var(--muted)",
  };
  return (
    <div>
      <div style={{ fontSize: 9, color: "var(--muted)", textTransform: "uppercase" }}>
        {label}
      </div>
      <div
        style={{
          fontFamily: "var(--font-mono)",
          fontSize: 12,
          fontWeight: 600,
          color: colorMap[tone],
        }}
      >
        {value}
      </div>
    </div>
  );
}

function pct(v: number): string {
  return `%${(v * 100).toFixed(1)}`;
}

function signedPct(v: number): string {
  const sign = v > 0 ? "+" : "";
  return `${sign}%${(v * 100).toFixed(1)}`;
}

function scoreColor(score: number): string {
  if (score >= 70) return "#4cc9b0";
  if (score >= 55) return "#e0b341";
  return "#e26a8f";
}

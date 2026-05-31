import type { BacktestUiSnapshot, ComboAggregate } from "@/app/(app)/_lib/backtest/snapshot-loader";

function pct(v: number | null | undefined, digits = 1): string {
  if (v == null || !Number.isFinite(v)) return "—";
  const sign = v > 0 ? "+" : "";
  return `${sign}${(v * 100).toFixed(digits)}%`;
}

function alphaColor(v: number | null | undefined): string {
  if (v == null) return "var(--muted)";
  if (v > 0.03) return "#4cc9b0";
  if (v > 0) return "#e0b341";
  return "#e26a8f";
}

export function RollingTab({ snapshot }: { snapshot: BacktestUiSnapshot }) {
  // Top 12 combos
  const topCombos = snapshot.combos.slice(0, 12);

  return (
    <div style={{ display: "grid", gap: 16 }}>
      <div className="card" style={{ padding: 0, overflow: "hidden" }}>
        <div style={{ padding: "12px 14px", borderBottom: "1px solid var(--border-soft)" }}>
          <div style={{ fontSize: 12, fontWeight: 700 }}>
            Top 12 Konfigürasyon — KAT_FON_SEPETI Median Alpha DESC
          </div>
          <div style={{ fontSize: 11, color: "var(--muted)", marginTop: 2 }}>
            Her satır 4 senaryonun aggregate&apos;i. ✓ Median ≥ %3 + Conf ≥ 75 → Sprint-6 GO koşullarını sağlar.
          </div>
        </div>
        <div style={{ overflowX: "auto" }}>
          <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 12 }}>
            <thead>
              <tr style={{ background: "var(--surface-2)", textAlign: "left" }}>
                <Th>#</Th>
                <Th>TopN</Th>
                <Th>Rebal</Th>
                <Th>Strategy</Th>
                <Th align="right">KAT Median</Th>
                <Th align="right">KAT Mean</Th>
                <Th align="right">Wins</Th>
                <Th align="right">Conf</Th>
                <Th align="right">CPI Med</Th>
                <Th align="right">CAGR</Th>
                <Th align="right">MaxDD</Th>
                <Th align="right">Sharpe</Th>
                <Th align="center">S6</Th>
              </tr>
            </thead>
            <tbody>
              {topCombos.map((c, i) => (
                <RowItem key={`${c.top_n}-${c.rebalance_days}-${c.strategy}`} c={c} idx={i + 1} />
              ))}
            </tbody>
          </table>
        </div>
      </div>

      <div className="card" style={{ padding: 14, fontSize: 11, color: "var(--muted)" }}>
        <strong>Tablo notu:</strong> S6 sütunu = Sprint-6 GO koşulu (KAT Median ≥ %3 AND Conf ≥ 75). XU100 ayrıca gerekir; XU100 datası geldiğinde bu sütun güncellenir.
      </div>
    </div>
  );
}

function RowItem({ c, idx }: { c: ComboAggregate; idx: number }) {
  const kat = c.per_benchmark.KAT_FON_SEPETI;
  const cpi = c.per_benchmark.CPI_TR;
  const sprint6Ok = (kat?.median_alpha ?? -1) >= 0.03 && (kat?.confidence ?? 0) >= 75;

  return (
    <tr style={{
      borderBottom: "1px solid var(--border-soft)",
      background: c.is_best ? "#4cc9b011" : undefined,
    }}>
      <Td>{idx === 1 ? "🥇" : idx === 2 ? "🥈" : idx === 3 ? "🥉" : idx}</Td>
      <Td><code style={{ fontFamily: "var(--font-mono)" }}>{c.top_n}{c.is_best && <span style={{ color: "#4cc9b0", marginLeft: 4 }}>★</span>}</code></Td>
      <Td><code style={{ fontFamily: "var(--font-mono)" }}>{c.rebalance_days}g</code></Td>
      <Td style={{ fontSize: 11 }}>{c.strategy === "equal_weight" ? "EW" : "SW"}</Td>
      <Td align="right" style={{ fontFamily: "var(--font-mono)", color: alphaColor(kat?.median_alpha), fontWeight: 600 }}>
        {pct(kat?.median_alpha, 2)}
      </Td>
      <Td align="right" style={{ fontFamily: "var(--font-mono)", color: alphaColor(kat?.mean_alpha) }}>
        {pct(kat?.mean_alpha, 2)}
      </Td>
      <Td align="right" style={{ fontFamily: "var(--font-mono)" }}>
        {kat?.wins ?? 0}/{c.n_scenarios}
      </Td>
      <Td align="right" style={{ fontFamily: "var(--font-mono)", fontWeight: 600, color: (kat?.confidence ?? 0) >= 75 ? "#4cc9b0" : "var(--muted)" }}>
        {kat?.confidence ?? 0}
      </Td>
      <Td align="right" style={{ fontFamily: "var(--font-mono)", color: alphaColor(cpi?.median_alpha) }}>
        {pct(cpi?.median_alpha, 2)}
      </Td>
      <Td align="right" style={{ fontFamily: "var(--font-mono)" }}>{pct(c.avg_cagr, 1)}</Td>
      <Td align="right" style={{ fontFamily: "var(--font-mono)", color: (c.avg_max_dd ?? 0) > -0.1 ? "#4cc9b0" : "#e0b341" }}>
        {pct(c.avg_max_dd, 1)}
      </Td>
      <Td align="right" style={{ fontFamily: "var(--font-mono)" }}>{c.avg_sharpe?.toFixed(2) ?? "—"}</Td>
      <Td align="center" style={{ fontSize: 16 }}>{sprint6Ok ? "✅" : "—"}</Td>
    </tr>
  );
}

function Th({ children, align }: { children: React.ReactNode; align?: "left" | "right" | "center" }) {
  return (
    <th style={{
      padding: "6px 10px",
      fontSize: 10,
      textTransform: "uppercase",
      letterSpacing: 0.4,
      color: "var(--muted)",
      fontWeight: 600,
      textAlign: align ?? "left",
      borderBottom: "1px solid var(--border)",
    }}>{children}</th>
  );
}

function Td({ children, align, style }: { children: React.ReactNode; align?: "left" | "right" | "center"; style?: React.CSSProperties }) {
  return (
    <td style={{
      padding: "6px 10px",
      textAlign: align ?? "left",
      ...style,
    }}>{children}</td>
  );
}

import type { BacktestUiSnapshot } from "@/app/(app)/_lib/backtest/snapshot-loader";
import { BEST_CONFIG } from "@/app/(app)/_lib/backtest/snapshot-loader";

function pct(v: number | null | undefined, digits = 1): string {
  if (v == null || !Number.isFinite(v)) return "—";
  const sign = v > 0 ? "+" : "";
  return `${sign}${(v * 100).toFixed(digits)}%`;
}

export function SummaryTab({ snapshot }: { snapshot: BacktestUiSnapshot }) {
  const sprint6 = snapshot.best_config_sprint6;
  const conf = snapshot.best_config_confidence;
  const best = snapshot.best_combo;

  return (
    <div style={{ display: "grid", gap: 16 }}>
      {/* Sprint-6 GO/NO-GO panosu */}
      <div
        className="card"
        style={{
          padding: 20,
          border: `2px solid ${sprint6.ok ? "#4cc9b0" : "#e0b341"}`,
          background: sprint6.ok ? "#4cc9b011" : "#e0b34111",
        }}
      >
        <div style={{ fontSize: 11, color: "var(--muted)", textTransform: "uppercase", letterSpacing: 0.5, fontWeight: 600, marginBottom: 8 }}>
          Sprint-6 GO / NO-GO Panosu
        </div>
        <div style={{ fontSize: 12, color: "var(--muted)", marginBottom: 12 }}>
          Best config baz alındı: <strong>TopN={BEST_CONFIG.top_n} · Rebalance={BEST_CONFIG.rebalance_days}g · {BEST_CONFIG.strategy}</strong>
        </div>
        <div style={{ display: "grid", gap: 8 }}>
          <SprintCheckRow
            label="KAT_FON_SEPETI"
            confidence={sprint6.checks.KAT_FON_SEPETI.confidence}
            extra={`Median Alpha ${pct(sprint6.checks.KAT_FON_SEPETI.median_alpha, 2)}`}
            passed={sprint6.checks.KAT_FON_SEPETI.passed}
            requirements="Confidence ≥75 AND Median Alpha ≥ %3"
          />
          <SprintCheckRow
            label="XU100"
            confidence={sprint6.checks.XU100.confidence}
            extra={snapshot.missing_benchmarks.includes("XU100") ? "⚠ Data yok (PR-A.1 bekleniyor)" : ""}
            passed={sprint6.checks.XU100.passed}
            requirements="Confidence ≥75"
          />
          <SprintCheckRow
            label="CPI_TR"
            confidence={sprint6.checks.CPI_TR.confidence}
            extra=""
            passed={sprint6.checks.CPI_TR.passed}
            requirements="Confidence ≥75"
          />
        </div>
        <div
          style={{
            marginTop: 14,
            padding: "8px 12px",
            borderRadius: 6,
            background: sprint6.ok ? "#4cc9b022" : "#e0b34122",
            color: sprint6.ok ? "#4cc9b0" : "#b8901c",
            fontSize: 14,
            fontWeight: 700,
          }}
        >
          {sprint6.ok ? "✅ SPRINT-6 GO" : "⚠ SPRINT-6 KOŞULLU"}
          {sprint6.failures.length > 0 && (
            <div style={{ fontSize: 11, marginTop: 4, fontWeight: 400 }}>
              {sprint6.failures.join(" · ")}
            </div>
          )}
        </div>
      </div>

      {/* Best config card */}
      {best && (
        <div className="card" style={{ padding: 16, border: "2px solid #4cc9b055" }}>
          <div style={{ fontSize: 11, color: "#4cc9b0", textTransform: "uppercase", letterSpacing: 0.5, fontWeight: 600, marginBottom: 8 }}>
            🏆 En İyi Konfigürasyon
          </div>
          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(140px, 1fr))", gap: 10 }}>
            <Metric label="TopN" value={String(best.top_n)} />
            <Metric label="Rebalance" value={`${best.rebalance_days} gün`} />
            <Metric label="Strategy" value={best.strategy.replace("_", " ")} />
            <Metric label="CAGR (avg)" value={pct(best.avg_cagr)} accent="#4cc9b0" />
            <Metric label="Max Drawdown" value={pct(best.avg_max_dd)} accent={(best.avg_max_dd ?? 0) > -0.1 ? "#4cc9b0" : "#e0b341"} />
            <Metric label="Sharpe-like" value={best.avg_sharpe?.toFixed(2) ?? "—"} />
          </div>
        </div>
      )}

      {/* Confidence + Alpha Strength breakdown */}
      <div className="card" style={{ padding: 16 }}>
        <div style={{ fontSize: 11, color: "var(--muted)", textTransform: "uppercase", letterSpacing: 0.5, fontWeight: 600, marginBottom: 12 }}>
          Confidence + Alpha Strength (Best Config)
        </div>
        <div style={{ display: "grid", gap: 10 }}>
          {conf.per_benchmark.map((p) => (
            <BenchmarkConfidenceRow key={p.benchmark} benchmark={p.benchmark} confidence={p.confidence} alpha={p.alpha} missing={snapshot.missing_benchmarks.includes(p.benchmark)} />
          ))}
        </div>
        {snapshot.missing_benchmarks.length > 0 && (
          <div style={{ marginTop: 12, padding: "8px 10px", background: "#e26a8f22", color: "#e26a8f", borderRadius: 6, fontSize: 11 }}>
            ⚠ Eksik benchmark verisi: <strong>{snapshot.missing_benchmarks.join(", ")}</strong> — Sprint-5.6 PR-A.1 hotfix bekleniyor (EVDS series code).
          </div>
        )}
      </div>

      {/* Genel istatistik */}
      <div className="card" style={{ padding: 16 }}>
        <div style={{ fontSize: 11, color: "var(--muted)", textTransform: "uppercase", letterSpacing: 0.5, fontWeight: 600, marginBottom: 12 }}>
          Backtest Durumu
        </div>
        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(140px, 1fr))", gap: 10, fontSize: 13 }}>
          <Metric label="Toplam Run" value={String(snapshot.total_runs)} />
          <Metric label="Faz-2 Kapsam" value={`${snapshot.phase_2_complete.total}/${snapshot.phase_2_complete.expected}`} accent={snapshot.phase_2_complete.missing === 0 ? "#4cc9b0" : "#e0b341"} />
          <Metric label="Combo Sayısı" value={String(snapshot.combos.length)} />
        </div>
      </div>
    </div>
  );
}

function SprintCheckRow({
  label,
  confidence,
  extra,
  passed,
  requirements,
}: {
  label: string;
  confidence: number;
  extra: string;
  passed: boolean;
  requirements: string;
}) {
  return (
    <div
      style={{
        display: "grid",
        gridTemplateColumns: "150px 80px 1fr auto",
        gap: 10,
        alignItems: "center",
        padding: "6px 10px",
        background: passed ? "#4cc9b011" : "#e26a8f11",
        borderRadius: 4,
        fontSize: 12,
      }}
    >
      <span style={{ fontWeight: 600 }}>{label}</span>
      <span style={{ fontFamily: "var(--font-mono)" }}>Conf {confidence}</span>
      <span style={{ color: "var(--muted)", fontSize: 11 }}>{requirements} · {extra}</span>
      <span style={{ fontSize: 16 }}>{passed ? "✓" : "✗"}</span>
    </div>
  );
}

function BenchmarkConfidenceRow({
  benchmark,
  confidence,
  alpha,
  missing,
}: {
  benchmark: string;
  confidence: number;
  alpha: { median_alpha: number | null; mean_alpha: number | null };
  missing: boolean;
}) {
  const color = confidence >= 75 ? "#4cc9b0" : confidence >= 50 ? "#e0b341" : "#e26a8f";
  return (
    <div style={{ display: "grid", gridTemplateColumns: "180px 60px 1fr 100px 100px", gap: 8, alignItems: "center", fontSize: 12 }}>
      <span style={{ fontWeight: 600 }}>{benchmark}</span>
      <span style={{ fontFamily: "var(--font-mono)", color, fontWeight: 600 }}>{missing ? "—" : `${confidence}/100`}</span>
      <div style={{ height: 8, background: "var(--surface-2)", borderRadius: 4, overflow: "hidden" }}>
        <div style={{ width: `${confidence}%`, height: "100%", background: color, opacity: missing ? 0.2 : 0.85 }} />
      </div>
      <span style={{ fontFamily: "var(--font-mono)", fontSize: 11, color: "var(--muted)" }}>
        Median {pct(alpha.median_alpha, 2)}
      </span>
      <span style={{ fontFamily: "var(--font-mono)", fontSize: 11, color: "var(--muted)" }}>
        Mean {pct(alpha.mean_alpha, 2)}
      </span>
    </div>
  );
}

function Metric({ label, value, accent }: { label: string; value: string; accent?: string }) {
  return (
    <div>
      <div style={{ fontSize: 10, color: "var(--muted)", textTransform: "uppercase", letterSpacing: 0.4 }}>
        {label}
      </div>
      <div style={{ fontSize: 16, fontWeight: 700, color: accent ?? "var(--fg)", marginTop: 2, fontFamily: "var(--font-mono)" }}>
        {value}
      </div>
    </div>
  );
}

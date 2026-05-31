"use client";

import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";

import type { ForwardTestSnapshot } from "@/app/(app)/_lib/backtest/forward-loader";

const MIN_HISTORY_DAYS = 30;

function pct(v: number | null, digits = 1): string {
  if (v == null) return "—";
  return `${(v * 100).toFixed(digits)}%`;
}

function kpiStatus(value: number | null, thresholds: { strong: number; medium: number }, higherIsBetter = true): { color: string; label: string } {
  if (value == null) return { color: "var(--muted)", label: "—" };
  const v = higherIsBetter ? value : -value;
  const t = higherIsBetter ? thresholds : { strong: -thresholds.medium, medium: -thresholds.strong };
  if (v >= (higherIsBetter ? t.strong : -t.strong)) return { color: "#4cc9b0", label: "✓ Stabil" };
  if (v >= (higherIsBetter ? t.medium : -t.medium)) return { color: "#e0b341", label: "→ Normal" };
  return { color: "#e26a8f", label: "⚠ Salınımlı" };
}

export function ForwardTestPanel({ snapshot }: { snapshot: ForwardTestSnapshot }) {
  const router = useRouter();
  const sp = useSearchParams();
  const currentTopN = snapshot.top_n;

  const insufficient = snapshot.history_days_count < MIN_HISTORY_DAYS;

  function setTopN(tn: number) {
    const p = new URLSearchParams(sp);
    p.set("top_n", String(tn));
    router.push(`?${p.toString()}`);
  }

  return (
    <div style={{ display: "grid", gap: 16 }}>
      {/* History durumu */}
      <div className="card" style={{ padding: 14 }}>
        <div style={{ fontSize: 11, color: "var(--muted)", textTransform: "uppercase", letterSpacing: 0.5, fontWeight: 600, marginBottom: 8 }}>
          Tarihçe Durumu
        </div>
        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(140px, 1fr))", gap: 10 }}>
          <Metric label="Tarihçe Aralığı" value={snapshot.available_from && snapshot.available_to ? `${snapshot.available_from} → ${snapshot.available_to}` : "—"} />
          <Metric label="Snapshot Günü" value={String(snapshot.history_days_count)} accent={insufficient ? "#e0b341" : "#4cc9b0"} />
          <Metric label="Top N" value={String(currentTopN)} />
        </div>
        <div style={{ marginTop: 10 }}>
          <span style={{ fontSize: 11, color: "var(--muted)", marginRight: 6 }}>TopN değiştir:</span>
          {[5, 10, 20].map((tn) => (
            <button
              key={tn}
              onClick={() => setTopN(tn)}
              style={{
                fontSize: 11,
                padding: "2px 10px",
                marginRight: 4,
                border: `1px solid ${tn === currentTopN ? "var(--accent, #6ea8fe)" : "var(--border)"}`,
                background: tn === currentTopN ? "var(--surface-2)" : "transparent",
                color: tn === currentTopN ? "#6ea8fe" : "var(--muted)",
                borderRadius: 4,
                cursor: "pointer",
                fontWeight: tn === currentTopN ? 600 : 400,
              }}
            >
              {tn}
            </button>
          ))}
        </div>
      </div>

      {insufficient && (
        <div className="card" style={{ padding: "12px 14px", background: "#e0b34122", color: "#b8901c", fontSize: 12 }}>
          ⚠ Forward Test KPI&apos;ları için <strong>minimum {MIN_HISTORY_DAYS} gün</strong> snapshot gerek.
          Şu an {snapshot.history_days_count} gün var. Her gün fund-scores-refresh cron&apos;u
          (~saat 21:00 TR) çalışınca yeni snapshot eklenir. ~{Math.max(0, MIN_HISTORY_DAYS - snapshot.history_days_count)} gün sonra
          Top10 Koruma Oranı (30g) anlamlı olur.
        </div>
      )}

      {/* 5 KPI rozet */}
      <div
        style={{
          display: "grid",
          gridTemplateColumns: "repeat(auto-fit, minmax(220px, 1fr))",
          gap: 12,
        }}
      >
        <KpiCard
          label="Top10 Stabilitesi"
          value={pct(snapshot.kpis.top10_stability, 1)}
          status={kpiStatus(snapshot.kpis.top10_stability, { strong: 0.85, medium: 0.60 }, true)}
          tooltip="1 - avg(daily turnover). 1'e yakın stabil, 0'a yakın volatil."
        />
        <KpiCard
          label="Ortalama Elde Tutma"
          value={snapshot.kpis.avg_holding_days != null ? `${snapshot.kpis.avg_holding_days.toFixed(1)} gün` : "—"}
          status={kpiStatus(snapshot.kpis.avg_holding_days, { strong: 30, medium: 14 }, true)}
          tooltip="Bir fonun Top N'de kaldığı gün sayısının ortalaması."
        />
        <KpiCard
          label="İlk 3 Değişim (30g)"
          value={snapshot.kpis.top3_change_rate != null ? snapshot.kpis.top3_change_rate.toFixed(2) : "—"}
          status={kpiStatus(snapshot.kpis.top3_change_rate, { strong: 0.5, medium: 1.5 }, false)}
          tooltip="30 gün başına Top 3'te değişen fon sayısı (düşük=stabil)."
        />
        <KpiCard
          label="Turnover (avg)"
          value={pct(snapshot.kpis.turnover, 1)}
          status={kpiStatus(snapshot.kpis.turnover, { strong: 0.10, medium: 0.30 }, false)}
          tooltip="Günlük ortalama set değişimi (1 - Jaccard)."
        />
        <KpiCard
          label="Top10 Koruma (30g)"
          value={snapshot.kpis.top10_retention_30d != null ? pct(snapshot.kpis.top10_retention_30d, 0) : "—"}
          status={kpiStatus(snapshot.kpis.top10_retention_30d, { strong: 0.80, medium: 0.60 }, true)}
          tooltip="30 gün önce Top N olan fonların bugün hâlâ Top N'de olma oranı."
          highlight
        />
      </div>

      {/* En son gün Top N */}
      {snapshot.latest_top_n.length > 0 && (
        <div className="card" style={{ padding: 16 }}>
          <div style={{ fontSize: 11, color: "var(--muted)", textTransform: "uppercase", letterSpacing: 0.5, fontWeight: 600, marginBottom: 10 }}>
            En Son Snapshot ({snapshot.available_to}) — Top {currentTopN}
          </div>
          <div style={{ display: "grid", gap: 4 }}>
            {snapshot.latest_top_n.map((f, i) => (
              <Link
                key={f.fund_code}
                href={`/fonlar/${encodeURIComponent(f.fund_code)}`}
                style={{
                  display: "grid",
                  gridTemplateColumns: "30px 80px 1fr auto",
                  gap: 10,
                  alignItems: "center",
                  padding: "6px 10px",
                  borderBottom: "1px solid var(--border-soft)",
                  textDecoration: "none",
                  color: "inherit",
                  fontSize: 12,
                }}
              >
                <span style={{ color: "var(--muted)", textAlign: "right" }}>#{i + 1}</span>
                <code style={{ fontFamily: "var(--font-mono)", fontWeight: 600 }}>{f.fund_code}</code>
                <span style={{ color: "var(--muted)", fontSize: 11 }}>Mehmet Score</span>
                <strong style={{ fontFamily: "var(--font-mono)", color: f.mehmet_score >= 70 ? "#4cc9b0" : f.mehmet_score >= 55 ? "#e0b341" : "var(--fg)" }}>
                  {f.mehmet_score}
                </strong>
              </Link>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

function KpiCard({
  label,
  value,
  status,
  tooltip,
  highlight,
}: {
  label: string;
  value: string;
  status: { color: string; label: string };
  tooltip: string;
  highlight?: boolean;
}) {
  return (
    <div
      className="card"
      style={{
        padding: 14,
        border: highlight ? `2px solid ${status.color}55` : undefined,
      }}
      title={tooltip}
    >
      <div style={{ fontSize: 10, color: "var(--muted)", textTransform: "uppercase", letterSpacing: 0.4, fontWeight: 600 }}>
        {label}
      </div>
      <div style={{ fontSize: 22, fontWeight: 700, marginTop: 4, fontFamily: "var(--font-mono)", color: status.color }}>
        {value}
      </div>
      <div style={{ fontSize: 10, marginTop: 4, color: status.color }}>
        {status.label}
      </div>
    </div>
  );
}

function Metric({ label, value, accent }: { label: string; value: string; accent?: string }) {
  return (
    <div>
      <div style={{ fontSize: 10, color: "var(--muted)", textTransform: "uppercase", letterSpacing: 0.4 }}>
        {label}
      </div>
      <div style={{ fontSize: 13, fontWeight: 600, color: accent ?? "var(--fg)", marginTop: 2 }}>
        {value}
      </div>
    </div>
  );
}

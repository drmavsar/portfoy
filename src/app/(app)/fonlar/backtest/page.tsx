import Link from "next/link";

import { loadBacktestSnapshot } from "@/app/(app)/_lib/backtest/snapshot-loader";

import { BacktestClient } from "./_components/backtest-client";

export const dynamic = "force-dynamic";
export const revalidate = 0;

export default async function BacktestPage() {
  const snapshot = await loadBacktestSnapshot();

  return (
    <div>
      <div className="page-head">
        <div>
          <Link
            href="/fonlar"
            style={{ fontSize: 12, color: "var(--muted)", textDecoration: "none" }}
          >
            ← TEFAS Fonları
          </Link>
          <div className="page-title">Mehmet Score Backtest</div>
          <div className="page-sub">
            Geçmiş performans simülasyonu — Faz-1 baseline + Faz-2 optimizasyon matrisi.
          </div>
        </div>
      </div>

      <div
        className="card"
        style={{
          padding: "10px 14px",
          background: "#e0b34122",
          border: "1px solid #e0b34155",
          marginBottom: 16,
          fontSize: 12,
          color: "#b8901c",
        }}
      >
        ⚠ Backtest geçmiş performansı simüle eder; geleceği garanti etmez. Equal weight
        + ideal işlem maliyetli (gerçek dünyada slippage vardır). KRA gibi delisted
        fonlar fund_status_history&apos;ye göre dahil edilir.
      </div>

      {!snapshot || snapshot.total_runs === 0 ? (
        <div className="card" style={{ padding: 24 }}>
          <div style={{ fontSize: 14, color: "var(--fg)", marginBottom: 8 }}>
            Henüz backtest çalıştırılmadı.
          </div>
          <div style={{ fontSize: 12, color: "var(--muted)" }}>
            Manuel tetik:
            <code style={{ fontFamily: "var(--font-mono)", margin: "0 4px" }}>
              GET /api/cron/backtest-phase-1
            </code>
            (8 run, ~80 sn) ve ardından
            <code style={{ fontFamily: "var(--font-mono)", margin: "0 4px" }}>
              GET /api/cron/backtest-phase-2?scenario=2022-01-03
            </code>
            (her senaryo ~4 dk).
          </div>
        </div>
      ) : (
        <BacktestClient snapshot={snapshot} />
      )}
    </div>
  );
}

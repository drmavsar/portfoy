import { Icon } from "@/components/ui/icon";
import { fmt } from "@/lib/finance/fmt";
import { RefreshButton } from "@/app/(app)/_components/refresh-button";
import { getKomiteDashboard } from "@/app/(app)/_lib/komite/portfolio-actions";
import type {
  ClassDriftView,
  ScoreTriple,
  SectorExposureView,
} from "@/app/(app)/_lib/komite/types";

import { PositionsPanel } from "./komite-client";

export const dynamic = "force-dynamic";

export default async function KomitePage() {
  const { view, personaName, symbolUniverseCount, screenedCount, flags } =
    await getKomiteDashboard();
  const { scores, positions, sectors, classDrift, totalValue, partial } = view;

  const hasPositions = positions.length > 0;

  return (
    <div>
      <div className="page-head">
        <div>
          <div className="page-title">Komite · Portföy Sağlığı</div>
          <div className="page-sub">
            {hasPositions ? (
              <>
                {fmt.trydp(totalValue)} · Sağlık {scores.health.toFixed(0)}/100
                {personaName && <> · {personaName} persona</>}
              </>
            ) : (
              "Portföy merkezli karar destek"
            )}
          </div>
        </div>
        <div className="page-actions">
          <RefreshButton />
        </div>
      </div>

      {partial && (
        <div
          style={{
            padding: 12,
            marginBottom: 14,
            background: "var(--warning-soft)",
            color: "var(--warning)",
            borderRadius: 8,
            fontSize: 12,
          }}
        >
          Canlı fiyat verisi alınamadı (Yahoo Finance yanıt vermedi). Pozisyonlar
          defter değeriyle gösteriliyor; teknik kalite ve gate kısmen eksik
          olabilir.
        </div>
      )}

      {!hasPositions ? (
        <div className="empty">
          <div className="title">
            <Icon name="portfolio" size={20} /> Henüz pozisyon yok
          </div>
          <div style={{ marginTop: 8, lineHeight: 1.6 }}>
            <b>İşlemler</b> sekmesinden bir alım ekleyince portföy sağlığın burada
            görünür.
          </div>
        </div>
      ) : (
        <>
          <ScoreCards scores={scores} sectors={sectors} classDrift={classDrift} />

          <div
            style={{
              display: "grid",
              gridTemplateColumns: "repeat(auto-fit, minmax(320px, 1fr))",
              gap: 16,
              marginTop: 16,
              marginBottom: 16,
            }}
          >
            <AssetClassPanel classDrift={classDrift} />
            <SectorPanel sectors={sectors} />
          </div>

          <PositionsPanel positions={positions} flags={flags} />

          <div
            className="hint"
            style={{
              marginTop: 18,
              padding: 12,
              background: "var(--surface-2)",
              borderRadius: 8,
              fontSize: 12,
              display: "grid",
              gap: 6,
            }}
          >
            <div>
              <b style={{ color: "var(--fg-soft)" }}>Skorlar:</b>{" "}
              <span className="mono">
                Kalite = pozisyon-ağırlıklı kalite (gate sonrası)
              </span>{" "}
              ·{" "}
              <span className="mono">
                Risk = konsantrasyon + gate maruziyeti + volatilite
              </span>{" "}
              · <span className="mono">Sağlık = ½·Kalite + ½·(100−Risk)</span>.
            </div>
            <div>
              <b style={{ color: "var(--fg-soft)" }}>Gate:</b> VBTS / açığa satış
              yasağı / SPK bir kapıdır — sembol karantinaya girer, teknik skoru
              geçersiz sayılır (ağırlık değil). Düşük likidite otomatik gate yer.
            </div>
            <div style={{ color: "var(--muted)" }}>
              {screenedCount}/{symbolUniverseCount} sembol için canlı veri alındı.
              Kalite şu sürümde teknik-ağırlıklıdır (temel veri sonraki sürüm).
              Bu bir yatırım tavsiyesi değildir; veri özetidir.
            </div>
          </div>
        </>
      )}
    </div>
  );
}

// ── Üç bileşik skor kartı ──────────────────────────────────────────────────
function ScoreCards({
  scores,
  sectors,
  classDrift,
}: {
  scores: ScoreTriple;
  sectors: SectorExposureView[];
  classDrift: ClassDriftView[];
}) {
  const gaps = sectors.filter((s) => s.flag === "gap").map((s) => s.sector);
  const cashDrift = classDrift.find((d) => d.bucket === "cash");
  const oppNote =
    gaps.length > 0
      ? `${gaps.slice(0, 2).join(", ")} açığı`
      : cashDrift && cashDrift.deltaPct > 2
        ? "nakit fazlası"
        : "denge yakın";

  return (
    <div
      className="grid-base"
      style={{
        gap: 16,
        gridTemplateColumns: "repeat(auto-fit, minmax(220px, 1fr))",
      }}
    >
      <ScoreCard
        label="KALİTE"
        value={scores.quality}
        good="high"
        note="sahip olduklarım kaliteli mi"
      />
      <ScoreCard
        label="RİSK"
        value={scores.risk}
        good="low"
        note="ne kadar kırılganım"
      />
      <ScoreCard label="FIRSAT" value={scores.opportunity} good="neutral" note={oppNote} />
      <ScoreCard
        label="SAĞLIK"
        value={scores.health}
        good="high"
        note="genel portföy sağlığı"
        highlight
      />
    </div>
  );
}

function scoreColor(value: number, good: "high" | "low" | "neutral"): string {
  if (good === "neutral") return "var(--fg)";
  const strong = good === "high" ? value >= 70 : value <= 35;
  const weak = good === "high" ? value < 50 : value > 65;
  if (strong) return "var(--positive)";
  if (weak) return "var(--negative)";
  return "var(--warning)";
}

function ScoreCard({
  label,
  value,
  good,
  note,
  highlight,
}: {
  label: string;
  value: number;
  good: "high" | "low" | "neutral";
  note: string;
  highlight?: boolean;
}) {
  return (
    <div
      className="card"
      style={{
        padding: 16,
        border: highlight ? "1px solid var(--accent)" : undefined,
      }}
    >
      <div className="hint" style={{ fontSize: 11, marginBottom: 6, letterSpacing: 0.3 }}>
        {label}
      </div>
      <div
        className="tabular"
        style={{ fontSize: 26, fontWeight: 700, color: scoreColor(value, good) }}
      >
        {value.toFixed(0)}
        <span style={{ fontSize: 13, color: "var(--muted)", fontWeight: 400 }}> /100</span>
      </div>
      <div className="hint" style={{ fontSize: 11, marginTop: 4 }}>
        {note}
      </div>
    </div>
  );
}

// ── Varlık sınıfı dağılımı (vs SAA) ────────────────────────────────────────
function AssetClassPanel({ classDrift }: { classDrift: ClassDriftView[] }) {
  const shown = classDrift.filter((d) => d.currentPct > 0 || d.targetPct > 0);
  return (
    <div className="card" style={{ padding: 16 }}>
      <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 12 }}>
        <Icon name="wealth" size={14} />
        <div className="hint" style={{ fontSize: 11, fontWeight: 600, letterSpacing: 0.3 }}>
          VARLIK SINIFI · HEDEF (SAA)
        </div>
      </div>
      <div style={{ display: "grid", gap: 10 }}>
        {shown.map((d) => {
          const overTarget = d.deltaPct > 1;
          const underTarget = d.deltaPct < -1;
          const arrow = overTarget ? "▲" : underTarget ? "▼" : "·";
          const color = overTarget
            ? "var(--warning)"
            : underTarget
              ? "var(--accent)"
              : "var(--muted)";
          return (
            <div key={d.bucket}>
              <div style={{ display: "flex", justifyContent: "space-between", fontSize: 12, marginBottom: 3 }}>
                <span style={{ fontWeight: 500 }}>{d.label}</span>
                <span className="tabular">
                  %{d.currentPct.toFixed(0)} / %{d.targetPct.toFixed(0)}{" "}
                  <span style={{ color, fontWeight: 600 }}>{arrow}</span>
                </span>
              </div>
              <div style={{ height: 5, background: "var(--surface-2)", borderRadius: 3, overflow: "hidden", position: "relative" }}>
                <div style={{ height: "100%", width: `${Math.min(100, d.currentPct)}%`, background: "var(--accent)" }} />
                <div
                  title={`Hedef %${d.targetPct.toFixed(0)}`}
                  style={{ position: "absolute", top: -1, bottom: -1, left: `${Math.min(100, d.targetPct)}%`, width: 2, background: "var(--fg-soft)" }}
                />
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

// ── Sektör maruziyeti (ağırlık × güç) ──────────────────────────────────────
function SectorPanel({ sectors }: { sectors: SectorExposureView[] }) {
  const owned = sectors.filter((s) => s.flag !== "gap").slice(0, 6);
  const gaps = sectors.filter((s) => s.flag === "gap");
  return (
    <div className="card" style={{ padding: 16 }}>
      <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 12 }}>
        <Icon name="screener" size={14} />
        <div className="hint" style={{ fontSize: 11, fontWeight: 600, letterSpacing: 0.3 }}>
          SEKTÖR MARUZİYETİ · GÜÇ
        </div>
      </div>
      {owned.length === 0 && gaps.length === 0 ? (
        <div className="hint" style={{ fontSize: 12 }}>Sektör verisi yok</div>
      ) : (
        <div style={{ display: "grid", gap: 8 }}>
          {owned.map((s) => (
            <div key={s.sector} style={{ display: "flex", alignItems: "center", gap: 8, fontSize: 12 }}>
              {s.rank != null && (
                <span
                  title={`Sektör momentum sıralaması #${s.rank}`}
                  style={{
                    fontSize: 10,
                    fontWeight: 700,
                    padding: "2px 5px",
                    borderRadius: 4,
                    minWidth: 22,
                    textAlign: "center",
                    color: s.rank <= 3 ? "var(--positive)" : s.rank >= 7 ? "var(--negative)" : "var(--warning)",
                    background: s.rank <= 3 ? "var(--positive-soft)" : s.rank >= 7 ? "var(--negative-soft)" : "var(--warning-soft)",
                  }}
                >
                  #{s.rank}
                </span>
              )}
              <span style={{ flex: 1, fontWeight: s.flag === "overweight_weak" ? 600 : 400, color: s.flag === "overweight_weak" ? "var(--warning)" : "var(--fg)" }}>
                {s.sector}
              </span>
              <span className="tabular hint">%{s.weight.toFixed(0)}</span>
              {s.flag === "overweight_weak" && (
                <span title="Zayıf sektörde aşırı ağırlık" style={{ color: "var(--warning)" }}>⚠</span>
              )}
            </div>
          ))}
          {gaps.map((s) => (
            <div key={s.sector} style={{ display: "flex", alignItems: "center", gap: 8, fontSize: 12, opacity: 0.9 }}>
              <span
                style={{ fontSize: 10, fontWeight: 700, padding: "2px 5px", borderRadius: 4, minWidth: 22, textAlign: "center", color: "var(--positive)", background: "var(--positive-soft)" }}
              >
                #{s.rank ?? "?"}
              </span>
              <span style={{ flex: 1 }}>{s.sector}</span>
              <span title="Güçlü sektör, portföyde temsil yok" style={{ color: "var(--accent)", fontWeight: 600 }}>
                🎯 açık
              </span>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

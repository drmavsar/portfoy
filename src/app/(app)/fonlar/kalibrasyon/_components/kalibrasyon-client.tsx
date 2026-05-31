"use client";

import Link from "next/link";
import { useMemo, useState } from "react";

import {
  MEHMET_DEFAULT_WEIGHTS,
  PRESETS,
  normalizeWeights,
  simulateScores,
  weightsSum,
  type PersonaWeights,
  type RankedFund,
  type ScoreMover,
  type SimulationInputFund,
} from "@/app/(app)/_lib/tefas/calibration-sim";

const TOP_N = 20;

interface Props {
  funds: SimulationInputFund[];
  categoryNameByCode: Record<string, string>;
  baselinePersona: PersonaWeights;
}

export function KalibrasyonClient({ funds, categoryNameByCode, baselinePersona }: Props) {
  const [selectedKey, setSelectedKey] = useState<string>("mehmet_default");
  const [customWeights, setCustomWeights] = useState<PersonaWeights>(baselinePersona);

  const overrideWeights = useMemo<PersonaWeights>(() => {
    if (selectedKey === "custom") return normalizeWeights(customWeights);
    const preset = PRESETS.find((p) => p.key === selectedKey);
    return preset ? preset.weights : MEHMET_DEFAULT_WEIGHTS;
  }, [selectedKey, customWeights]);

  const sim = useMemo(
    () => simulateScores(funds, baselinePersona, overrideWeights, TOP_N),
    [funds, baselinePersona, overrideWeights],
  );

  return (
    <div style={{ display: "grid", gap: 16 }}>
      <PresetSelector
        selectedKey={selectedKey}
        onSelect={setSelectedKey}
        baseline={baselinePersona}
      />

      {selectedKey === "custom" && (
        <CustomSliders weights={customWeights} onChange={setCustomWeights} />
      )}

      <div
        style={{
          display: "grid",
          gridTemplateColumns: "minmax(0, 1fr) minmax(0, 1fr)",
          gap: 16,
        }}
      >
        <RankingTable
          title="Baseline — Mehmet Default"
          subtitle="Mevcut persona ağırlıkları"
          rows={sim.rankings_baseline.slice(0, TOP_N)}
          categoryNameByCode={categoryNameByCode}
          accent="#6ea8fe"
        />
        <RankingTable
          title="Simülasyon"
          subtitle={presetLabel(selectedKey)}
          rows={sim.rankings_simulated.slice(0, TOP_N)}
          categoryNameByCode={categoryNameByCode}
          accent="#4cc9b0"
          baselineRanks={new Map(sim.rankings_baseline.map((r) => [r.fund_code, r.rank]))}
        />
      </div>

      <div
        style={{
          display: "grid",
          gridTemplateColumns: "minmax(0, 1fr) minmax(0, 1fr)",
          gap: 16,
        }}
      >
        <MoversCard
          title="En Çok Yükselen 5"
          accent="#4cc9b0"
          movers={sim.movers_up}
          categoryNameByCode={categoryNameByCode}
        />
        <MoversCard
          title="En Çok Düşen 5"
          accent="#e26a8f"
          movers={sim.movers_down}
          categoryNameByCode={categoryNameByCode}
        />
      </div>

      <Top20DiffCard
        added={sim.added_to_topn}
        removed={sim.removed_from_topn}
        categoryNameByCode={categoryNameByCode}
      />
    </div>
  );
}

function presetLabel(key: string): string {
  if (key === "custom") return "Özel ağırlıklar";
  const p = PRESETS.find((x) => x.key === key);
  return p ? p.label_tr : "—";
}

// ──────────────────────────────────────────────────────────────────────────
// Preset Selector
// ──────────────────────────────────────────────────────────────────────────

function PresetSelector({
  selectedKey,
  onSelect,
  baseline,
}: {
  selectedKey: string;
  onSelect: (k: string) => void;
  baseline: PersonaWeights;
}) {
  const cards: Array<{ key: string; label: string; description: string; weights: PersonaWeights }> = [
    ...PRESETS.map((p) => ({
      key: p.key,
      label: p.label_tr,
      description: p.description,
      weights: p.weights,
    })),
    {
      key: "custom",
      label: "Özel",
      description: "Slider ile kendi ağırlıkların",
      weights: baseline,
    },
  ];
  return (
    <div
      style={{
        display: "grid",
        gridTemplateColumns: "repeat(auto-fit, minmax(170px, 1fr))",
        gap: 10,
      }}
    >
      {cards.map((c) => {
        const isActive = c.key === selectedKey;
        return (
          <button
            key={c.key}
            onClick={() => onSelect(c.key)}
            className="card"
            style={{
              padding: "12px 14px",
              cursor: "pointer",
              border: `2px solid ${isActive ? "var(--accent, #6ea8fe)" : "var(--border)"}`,
              background: isActive ? "var(--surface-2)" : "var(--surface)",
              textAlign: "left",
              color: "inherit",
            }}
          >
            <div style={{ fontSize: 12, fontWeight: 700, color: isActive ? "#6ea8fe" : "var(--fg)" }}>
              {c.label}
            </div>
            <div style={{ fontSize: 10, color: "var(--muted)", marginTop: 3 }}>
              {c.description}
            </div>
            <div style={{ fontSize: 10, color: "var(--muted)", marginTop: 6, fontFamily: "var(--font-mono)" }}>
              {Math.round(c.weights.inflation_weight)}/{Math.round(c.weights.tax_weight)}/
              {Math.round(c.weights.risk_weight)}/{Math.round(c.weights.long_term_weight)}/
              {Math.round(c.weights.diversification_weight)}
            </div>
          </button>
        );
      })}
    </div>
  );
}

// ──────────────────────────────────────────────────────────────────────────
// Custom Sliders
// ──────────────────────────────────────────────────────────────────────────

function CustomSliders({
  weights,
  onChange,
}: {
  weights: PersonaWeights;
  onChange: (w: PersonaWeights) => void;
}) {
  const sum = weightsSum(weights);
  const sliders: Array<[keyof PersonaWeights, string]> = [
    ["inflation_weight", "Enflasyon koruması"],
    ["tax_weight", "Stopaj avantajı"],
    ["risk_weight", "Risk dengesi"],
    ["long_term_weight", "Uzun vadeli performans"],
    ["diversification_weight", "Çeşitlendirme katkısı"],
  ];
  return (
    <div className="card" style={{ padding: 16 }}>
      <div style={{ fontSize: 11, color: "var(--muted)", textTransform: "uppercase", letterSpacing: 0.5, fontWeight: 600, marginBottom: 10 }}>
        Özel Ağırlıklar (toplam: {Math.round(sum)})
      </div>
      <div style={{ display: "grid", gap: 8 }}>
        {sliders.map(([key, label]) => (
          <div key={key}>
            <div style={{ display: "flex", justifyContent: "space-between", fontSize: 12 }}>
              <span>{label}</span>
              <span style={{ fontFamily: "var(--font-mono)" }}>{Math.round(weights[key])}</span>
            </div>
            <input
              type="range"
              min={0}
              max={50}
              step={1}
              value={weights[key]}
              onChange={(e) => onChange({ ...weights, [key]: Number(e.target.value) })}
              style={{ width: "100%" }}
            />
          </div>
        ))}
      </div>
      <div style={{ fontSize: 10, color: "var(--muted)", marginTop: 6 }}>
        Toplam 100&apos;e otomatik normalize edilir.
      </div>
    </div>
  );
}

// ──────────────────────────────────────────────────────────────────────────
// Ranking Table
// ──────────────────────────────────────────────────────────────────────────

function RankingTable({
  title,
  subtitle,
  rows,
  categoryNameByCode,
  accent,
  baselineRanks,
}: {
  title: string;
  subtitle: string;
  rows: RankedFund[];
  categoryNameByCode: Record<string, string>;
  accent: string;
  baselineRanks?: Map<string, number>;
}) {
  return (
    <div className="card" style={{ padding: 0, overflow: "hidden" }}>
      <div style={{ padding: "12px 14px", borderBottom: "1px solid var(--border-soft)" }}>
        <div style={{ fontSize: 12, fontWeight: 700, color: accent }}>{title}</div>
        <div style={{ fontSize: 11, color: "var(--muted)", marginTop: 2 }}>{subtitle}</div>
      </div>
      <div>
        {rows.map((r) => {
          const baselineRank = baselineRanks?.get(r.fund_code);
          const delta = baselineRank != null ? baselineRank - r.rank : 0;
          return (
            <Link
              key={r.fund_code}
              href={`/fonlar/${encodeURIComponent(r.fund_code)}`}
              style={{
                display: "grid",
                gridTemplateColumns: "30px 70px 1fr auto 50px",
                gap: 8,
                alignItems: "center",
                padding: "6px 14px",
                color: "inherit",
                textDecoration: "none",
                fontSize: 12,
                borderBottom: "1px solid var(--border-soft)",
              }}
            >
              <span style={{ color: "var(--muted)", textAlign: "right", fontSize: 11 }}>
                #{r.rank}
              </span>
              <code style={{ fontFamily: "var(--font-mono)", fontWeight: 600 }}>
                {r.fund_code}
              </code>
              <span style={{ color: "var(--muted)", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                {categoryNameByCode[r.fund_code] ?? "—"}
              </span>
              <strong style={{ color: accent, fontFamily: "var(--font-mono)", textAlign: "right" }}>
                {r.score ?? "—"}
              </strong>
              <span
                style={{
                  fontSize: 10,
                  color: delta > 0 ? "#4cc9b0" : delta < 0 ? "#e26a8f" : "var(--muted)",
                  textAlign: "right",
                  fontFamily: "var(--font-mono)",
                }}
              >
                {delta > 0 ? `↑${delta}` : delta < 0 ? `↓${-delta}` : ""}
              </span>
            </Link>
          );
        })}
      </div>
    </div>
  );
}

// ──────────────────────────────────────────────────────────────────────────
// Movers Card
// ──────────────────────────────────────────────────────────────────────────

function MoversCard({
  title,
  accent,
  movers,
  categoryNameByCode,
}: {
  title: string;
  accent: string;
  movers: ScoreMover[];
  categoryNameByCode: Record<string, string>;
}) {
  return (
    <div className="card" style={{ padding: 0, overflow: "hidden" }}>
      <div style={{ padding: "12px 14px", borderBottom: "1px solid var(--border-soft)" }}>
        <div style={{ fontSize: 12, fontWeight: 700, color: accent }}>{title}</div>
      </div>
      {movers.length === 0 ? (
        <div style={{ padding: 14, fontSize: 12, color: "var(--muted)" }}>
          Hareket yok — baseline ile aynı sıralama.
        </div>
      ) : (
        movers.map((m) => (
          <Link
            key={m.fund_code}
            href={`/fonlar/${encodeURIComponent(m.fund_code)}`}
            style={{
              display: "grid",
              gridTemplateColumns: "70px 1fr auto auto",
              gap: 8,
              alignItems: "center",
              padding: "6px 14px",
              color: "inherit",
              textDecoration: "none",
              fontSize: 12,
              borderBottom: "1px solid var(--border-soft)",
            }}
          >
            <code style={{ fontFamily: "var(--font-mono)", fontWeight: 600 }}>{m.fund_code}</code>
            <span style={{ color: "var(--muted)", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
              {categoryNameByCode[m.fund_code] ?? "—"}
            </span>
            <span style={{ fontFamily: "var(--font-mono)", color: "var(--muted)", fontSize: 11 }}>
              #{m.rank_old} → #{m.rank_new}
            </span>
            <strong style={{ color: accent, fontFamily: "var(--font-mono)" }}>
              {m.delta > 0 ? `+${m.delta}` : m.delta}
            </strong>
          </Link>
        ))
      )}
    </div>
  );
}

// ──────────────────────────────────────────────────────────────────────────
// Top 20 Diff Card
// ──────────────────────────────────────────────────────────────────────────

function Top20DiffCard({
  added,
  removed,
  categoryNameByCode,
}: {
  added: string[];
  removed: string[];
  categoryNameByCode: Record<string, string>;
}) {
  if (added.length === 0 && removed.length === 0) {
    return (
      <div className="card" style={{ padding: 14, fontSize: 12, color: "var(--muted)" }}>
        Top 20 listesi aynı — preset ağırlıkları kompozisyonu değiştirmedi.
      </div>
    );
  }
  return (
    <div className="card" style={{ padding: 16 }}>
      <div style={{ fontSize: 11, color: "var(--muted)", textTransform: "uppercase", letterSpacing: 0.5, fontWeight: 600, marginBottom: 8 }}>
        Top 20 Değişimi
      </div>
      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 16 }}>
        <div>
          <div style={{ fontSize: 11, color: "#4cc9b0", fontWeight: 600, marginBottom: 4 }}>
            + Listeye Girdi ({added.length})
          </div>
          {added.length === 0 ? (
            <div style={{ fontSize: 12, color: "var(--muted)" }}>—</div>
          ) : (
            <div style={{ display: "flex", flexWrap: "wrap", gap: 6 }}>
              {added.map((c) => (
                <Link
                  key={c}
                  href={`/fonlar/${encodeURIComponent(c)}`}
                  style={{
                    fontFamily: "var(--font-mono)",
                    fontSize: 11,
                    padding: "3px 8px",
                    borderRadius: 4,
                    background: "#4cc9b022",
                    color: "#4cc9b0",
                    textDecoration: "none",
                    fontWeight: 600,
                  }}
                  title={categoryNameByCode[c] ?? ""}
                >
                  {c}
                </Link>
              ))}
            </div>
          )}
        </div>
        <div>
          <div style={{ fontSize: 11, color: "#e26a8f", fontWeight: 600, marginBottom: 4 }}>
            − Listeden Çıktı ({removed.length})
          </div>
          {removed.length === 0 ? (
            <div style={{ fontSize: 12, color: "var(--muted)" }}>—</div>
          ) : (
            <div style={{ display: "flex", flexWrap: "wrap", gap: 6 }}>
              {removed.map((c) => (
                <Link
                  key={c}
                  href={`/fonlar/${encodeURIComponent(c)}`}
                  style={{
                    fontFamily: "var(--font-mono)",
                    fontSize: 11,
                    padding: "3px 8px",
                    borderRadius: 4,
                    background: "#e26a8f22",
                    color: "#e26a8f",
                    textDecoration: "none",
                    fontWeight: 600,
                  }}
                  title={categoryNameByCode[c] ?? ""}
                >
                  {c}
                </Link>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

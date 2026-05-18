"use client";

import { useMemo, useState } from "react";

import { Icon } from "@/components/ui/icon";
import { fmt } from "@/lib/finance/fmt";

import type { ScreeningRow } from "@/app/(app)/_lib/stock-screening";
import type { PatternSignal } from "@/app/(app)/_lib/pattern-detection";

interface EnrichedRow extends ScreeningRow {
  name: string;
  sector: string | null;
  external_url: string | null;
  sector_rank: number | null;
  sector_momentum_score: number | null;
}

type SortKey =
  | "score"
  | "symbol"
  | "price"
  | "daily"
  | "week"
  | "month"
  | "quarter"
  | "ytd"
  | "high_dist"
  | "rsi"
  | "rs_20"
  | "rs_60"
  | "sector_rank"
  | "pattern";
type SortDir = "asc" | "desc";

interface Props {
  rows: EnrichedRow[];
  symbolCount: number;
}

function scoreLabel(s: number | null): { label: string; color: string; bg: string } {
  if (s == null) return { label: "—", color: "var(--muted)", bg: "transparent" };
  if (s >= 70) return { label: "Güçlü", color: "var(--positive)", bg: "var(--positive-soft)" };
  if (s >= 50) return { label: "Orta", color: "var(--warning)", bg: "var(--warning-soft)" };
  return { label: "Zayıf", color: "var(--negative)", bg: "var(--negative-soft)" };
}

function pctText(v: number | null): string {
  if (v == null) return "—";
  return `${v >= 0 ? "+" : ""}${v.toFixed(2)}%`;
}

function pctColor(v: number | null): string {
  if (v == null) return "var(--muted)";
  return v >= 0 ? "var(--positive)" : "var(--negative)";
}

export function TaramaClient({ rows, symbolCount }: Props) {
  const [sortKey, setSortKey] = useState<SortKey>("score");
  const [sortDir, setSortDir] = useState<SortDir>("desc");
  const [minScore, setMinScore] = useState<number>(0);
  const [search, setSearch] = useState("");

  const filtered = useMemo(() => {
    let out = rows;
    if (minScore > 0) out = out.filter((r) => (r.score ?? 0) >= minScore);
    if (search.trim()) {
      const q = search.trim().toLowerCase();
      out = out.filter(
        (r) => r.symbol.toLowerCase().includes(q) || r.name.toLowerCase().includes(q),
      );
    }
    const get = (r: EnrichedRow): number | string => {
      switch (sortKey) {
        case "score": return r.score ?? -1;
        case "symbol": return r.symbol;
        case "price": return r.price;
        case "daily": return r.daily_pct ?? -999;
        case "week": return r.week_pct ?? -999;
        case "month": return r.month_pct ?? -999;
        case "quarter": return r.quarter_pct ?? -999;
        case "ytd": return r.ytd_pct ?? -999;
        case "high_dist": return r.high_distance_pct ?? -999;
        case "rsi": return r.rsi14 ?? -1;
        case "rs_20": return r.rs_20 ?? -999;
        case "rs_60": return r.rs_60 ?? -999;
        case "sector_rank": return r.sector_rank ?? 9999;
        case "pattern":
          // En iyi pattern kalitesi × RR — yoksa 0
          return r.patterns.length > 0
            ? r.patterns[0].pattern_quality * r.patterns[0].rr
            : 0;
      }
    };
    const sorted = [...out].sort((a, b) => {
      const av = get(a);
      const bv = get(b);
      let cmp = 0;
      if (typeof av === "string" && typeof bv === "string") cmp = av.localeCompare(bv, "tr");
      else cmp = (av as number) - (bv as number);
      return sortDir === "asc" ? cmp : -cmp;
    });
    return sorted;
  }, [rows, sortKey, sortDir, minScore, search]);

  const toggleSort = (k: SortKey) => {
    if (sortKey === k) setSortDir((d) => (d === "asc" ? "desc" : "asc"));
    else {
      setSortKey(k);
      setSortDir(k === "symbol" ? "asc" : "desc");
    }
  };

  const avgScore =
    rows.length > 0
      ? rows.reduce((s, r) => s + (r.score ?? 0), 0) / rows.length
      : 0;
  const strongCount = rows.filter((r) => (r.score ?? 0) >= 70).length;

  return (
    <div>
      <div className="page-head">
        <div>
          <div className="page-title">Tarama</div>
          <div className="page-sub">
            BIST 100 multi-factor karar destek · {rows.length} sembol · ortalama skor{" "}
            {avgScore.toFixed(1)}
          </div>
        </div>
      </div>

      {symbolCount > 0 && rows.length < symbolCount && (
        <div
          style={{
            padding: 12,
            marginBottom: 12,
            background: "var(--surface-2)",
            color: "var(--muted)",
            borderRadius: 6,
            fontSize: 12,
          }}
        >
          {symbolCount} sembol taranmaya gönderildi, {rows.length} tanesi için Yahoo Finance
          yanıt verdi. Eksik kalanlar için ya sembol Yahoo&apos;da yok ya da yeterli geçmiş veri
          yok (≥30 trading day).
        </div>
      )}

      <div className="grid-base grid-4" style={{ gap: 16, marginBottom: 18 }}>
        <div className="card" style={{ padding: 16 }}>
          <div className="hint" style={{ fontSize: 11, marginBottom: 6 }}>SEMBOL SAYISI</div>
          <div className="tabular" style={{ fontSize: 22, fontWeight: 700 }}>{rows.length}</div>
        </div>
        <div className="card" style={{ padding: 16 }}>
          <div className="hint" style={{ fontSize: 11, marginBottom: 6 }}>GÜÇLÜ (≥70)</div>
          <div className="tabular" style={{ fontSize: 22, fontWeight: 700, color: "var(--positive)" }}>
            {strongCount}
          </div>
        </div>
        <div className="card" style={{ padding: 16 }}>
          <div className="hint" style={{ fontSize: 11, marginBottom: 6 }}>ORT. SKOR</div>
          <div className="tabular" style={{ fontSize: 22, fontWeight: 700 }}>
            {avgScore.toFixed(1)}
          </div>
        </div>
        <div className="card" style={{ padding: 16 }}>
          <div className="hint" style={{ fontSize: 11, marginBottom: 6 }}>FİLTRE</div>
          <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
            {[0, 50, 70].map((v) => (
              <button
                key={v}
                className={`btn btn-sm ${minScore === v ? "btn-prim" : ""}`}
                onClick={() => setMinScore(v)}
              >
                {v === 0 ? "Tümü" : `≥${v}`}
              </button>
            ))}
          </div>
        </div>
      </div>

      <div className="card">
        <div className="card-head" style={{ flexWrap: "wrap", gap: 10 }}>
          <div className="card-title">Hisse Tarama Sonuçları</div>
          <div className="card-sub">{filtered.length} / {rows.length}</div>
          <input
            placeholder="Sembol veya isim ara…"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            style={{
              marginLeft: "auto",
              background: "var(--surface)",
              border: "1px solid var(--border)",
              color: "var(--fg)",
              padding: "6px 10px",
              borderRadius: 6,
              fontSize: 12,
              width: 220,
            }}
          />
        </div>

        <table className="dg">
          <thead>
            <tr>
              <SortHead k="score"       label="Skor"     sortKey={sortKey} dir={sortDir} onToggle={toggleSort} num style={{ width: 80 }} />
              <SortHead k="symbol"      label="Sembol"   sortKey={sortKey} dir={sortDir} onToggle={toggleSort} />
              <SortHead k="sector_rank" label="Sektör"   sortKey={sortKey} dir={sortDir} onToggle={toggleSort} />
              <SortHead k="price"       label="Son"      sortKey={sortKey} dir={sortDir} onToggle={toggleSort} num />
              <SortHead k="daily"       label="Günlük"   sortKey={sortKey} dir={sortDir} onToggle={toggleSort} num />
              <SortHead k="week"        label="Hafta"    sortKey={sortKey} dir={sortDir} onToggle={toggleSort} num />
              <SortHead k="month"       label="Ay"       sortKey={sortKey} dir={sortDir} onToggle={toggleSort} num />
              <SortHead k="quarter"     label="3 Ay"     sortKey={sortKey} dir={sortDir} onToggle={toggleSort} num />
              <SortHead k="ytd"         label="YTD"      sortKey={sortKey} dir={sortDir} onToggle={toggleSort} num />
              <SortHead k="rs_20"       label="RS 20d"   sortKey={sortKey} dir={sortDir} onToggle={toggleSort} num />
              <SortHead k="rs_60"       label="RS 60d"   sortKey={sortKey} dir={sortDir} onToggle={toggleSort} num />
              <SortHead k="high_dist"   label="52h Mes." sortKey={sortKey} dir={sortDir} onToggle={toggleSort} num />
              <SortHead k="rsi"         label="RSI"      sortKey={sortKey} dir={sortDir} onToggle={toggleSort} num />
              <th>MA Trend</th>
              <SortHead k="pattern"     label="Pattern"  sortKey={sortKey} dir={sortDir} onToggle={toggleSort} />
            </tr>
          </thead>
          <tbody>
            {filtered.map((r) => {
              const sl = scoreLabel(r.score);
              const above20 = r.sma20 != null && r.price > r.sma20;
              const above50 = r.sma50 != null && r.price > r.sma50;
              const above200 = r.sma200 != null && r.price > r.sma200;
              return (
                <tr key={r.symbol}>
                  <td>
                    <div
                      style={{
                        display: "inline-flex",
                        alignItems: "center",
                        gap: 6,
                        padding: "3px 8px",
                        background: sl.bg,
                        color: sl.color,
                        borderRadius: 4,
                        fontSize: 11,
                        fontWeight: 700,
                      }}
                    >
                      <span className="tabular">{r.score?.toFixed(0) ?? "—"}</span>
                      <span>{sl.label}</span>
                    </div>
                  </td>
                  <td>
                    {r.external_url ? (
                      <a
                        href={r.external_url}
                        target="_blank"
                        rel="noopener noreferrer"
                        style={{
                          color: "inherit",
                          textDecoration: "none",
                          fontWeight: 600,
                          borderBottom: "1px dotted var(--muted)",
                        }}
                      >
                        {r.symbol}
                      </a>
                    ) : (
                      <span style={{ fontWeight: 600 }}>{r.symbol}</span>
                    )}
                    <div className="hint" style={{ fontSize: 10 }}>{r.name}</div>
                  </td>
                  <td style={{ fontSize: 11 }}>
                    {r.sector ? (
                      <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
                        {r.sector_rank != null && (
                          <span
                            title={`Sektör momentum sıralaması: ${r.sector_rank}. (${r.sector_momentum_score?.toFixed(1)})`}
                            style={{
                              fontSize: 10,
                              fontWeight: 700,
                              padding: "2px 5px",
                              borderRadius: 4,
                              color: r.sector_rank <= 3
                                ? "var(--positive)"
                                : r.sector_rank <= 6
                                  ? "var(--warning)"
                                  : "var(--muted)",
                              background: r.sector_rank <= 3
                                ? "var(--positive-soft)"
                                : r.sector_rank <= 6
                                  ? "var(--warning-soft)"
                                  : "transparent",
                              minWidth: 18,
                              textAlign: "center",
                            }}
                          >
                            #{r.sector_rank}
                          </span>
                        )}
                        <span className="hint">{r.sector}</span>
                      </div>
                    ) : (
                      <span className="hint">—</span>
                    )}
                  </td>
                  <td className="num tabular">{fmt.tr(r.price, 2)}</td>
                  <td className="num tabular" style={{ color: pctColor(r.daily_pct), fontWeight: 600 }}>
                    {pctText(r.daily_pct)}
                  </td>
                  <td className="num tabular" style={{ color: pctColor(r.week_pct) }}>
                    {pctText(r.week_pct)}
                  </td>
                  <td className="num tabular" style={{ color: pctColor(r.month_pct) }}>
                    {pctText(r.month_pct)}
                  </td>
                  <td className="num tabular" style={{ color: pctColor(r.quarter_pct) }}>
                    {pctText(r.quarter_pct)}
                  </td>
                  <td className="num tabular" style={{ color: pctColor(r.ytd_pct) }}>
                    {pctText(r.ytd_pct)}
                  </td>
                  <td className="num tabular" style={{ color: pctColor(r.rs_20), fontWeight: 600 }}>
                    {pctText(r.rs_20)}
                  </td>
                  <td className="num tabular" style={{ color: pctColor(r.rs_60) }}>
                    {pctText(r.rs_60)}
                  </td>
                  <td className="num tabular hint">{pctText(r.high_distance_pct)}</td>
                  <td className="num tabular">
                    {r.rsi14 != null ? (
                      <span
                        style={{
                          color:
                            r.rsi14 > 70
                              ? "var(--warning)"
                              : r.rsi14 < 30
                                ? "var(--negative)"
                                : "var(--fg-soft)",
                          fontWeight: 600,
                        }}
                      >
                        {r.rsi14.toFixed(0)}
                      </span>
                    ) : "—"}
                  </td>
                  <td>
                    <span style={{ display: "inline-flex", gap: 3, fontSize: 9 }}>
                      <span
                        style={{
                          padding: "2px 4px",
                          borderRadius: 3,
                          background: above20 ? "var(--positive-soft)" : "var(--surface-2)",
                          color: above20 ? "var(--positive)" : "var(--muted)",
                          fontWeight: 600,
                        }}
                      >
                        20
                      </span>
                      <span
                        style={{
                          padding: "2px 4px",
                          borderRadius: 3,
                          background: above50 ? "var(--positive-soft)" : "var(--surface-2)",
                          color: above50 ? "var(--positive)" : "var(--muted)",
                          fontWeight: 600,
                        }}
                      >
                        50
                      </span>
                      <span
                        style={{
                          padding: "2px 4px",
                          borderRadius: 3,
                          background: above200 ? "var(--positive-soft)" : "var(--surface-2)",
                          color: above200 ? "var(--positive)" : "var(--muted)",
                          fontWeight: 600,
                        }}
                      >
                        200
                      </span>
                    </span>
                  </td>
                  <td>
                    {r.patterns.length > 0 ? (
                      <PatternCell pattern={r.patterns[0]} extraCount={r.patterns.length - 1} />
                    ) : (
                      <span className="hint" style={{ fontSize: 11 }}>—</span>
                    )}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      <div
        className="hint"
        style={{ marginTop: 18, padding: 12, background: "var(--surface-2)", borderRadius: 8, fontSize: 12, display: "grid", gap: 6 }}
      >
        <div>
          <Icon name="screener" size={12} />{" "}
          <b style={{ color: "var(--fg-soft)" }}>Composite Skor Formülü:</b>{" "}
          <span className="mono">Trend %35 (SMA20/50/200 üstünde mi)</span> +{" "}
          <span className="mono">Momentum %35 (Ay + 3 Ay değişim)</span> +{" "}
          <span className="mono">52h yakınlık %20</span> +{" "}
          <span className="mono">RSI sağlığı %10 (50-70 optimum)</span>
        </div>
        <div>
          <b style={{ color: "var(--fg-soft)" }}>Yorumlama:</b> Güçlü (≥70) — trend + momentum
          uyumlu, yatırım adayı. Orta (50-70) — kararsız bölge, ek inceleme. Zayıf (&lt;50) — düşüş
          trendi veya aşırı satılmış.
        </div>
        <div>
          <b style={{ color: "var(--fg-soft)" }}>Kaynaklar:</b> BIST 100 üye listesi → Borsa İstanbul
          CSV (1 saat cache) · OHLC + indikatörler → Yahoo Finance 1 yıllık günlük close (30 dk
          cache).
        </div>
        <div style={{ color: "var(--muted)" }}>
          Bu bir alım/satım tavsiyesi değildir. Karar destek skoru sadece teknik göstergelere dayanır;
          temel veri (P/E, ROE, bilanço) henüz yok.
        </div>
      </div>
    </div>
  );
}

function PatternCell({ pattern, extraCount }: { pattern: PatternSignal; extraCount: number }) {
  // Setup tipine göre renk
  const setupColor =
    pattern.setup_type === "breakout"
      ? "var(--positive)"
      : pattern.setup_type === "near_breakout"
        ? "var(--warning)"
        : "var(--muted)";
  const setupBg =
    pattern.setup_type === "breakout"
      ? "var(--positive-soft)"
      : pattern.setup_type === "near_breakout"
        ? "var(--warning-soft)"
        : "var(--surface-2)";
  const setupLabel =
    pattern.setup_type === "breakout"
      ? "Teyit"
      : pattern.setup_type === "near_breakout"
        ? "Yakın"
        : "İzle";
  // Tooltip detayı
  const tooltip = [
    pattern.pattern_label,
    `Setup: ${pattern.setup_type}`,
    `Entry: ${pattern.entry}`,
    `Stop: ${pattern.stop}`,
    `Target: ${pattern.target}`,
    `RR: ${pattern.rr.toFixed(2)}`,
    `Kalite: ${(pattern.pattern_quality * 100).toFixed(0)}%`,
    pattern.comment,
  ].join("\n");
  return (
    <div title={tooltip} style={{ display: "flex", flexDirection: "column", gap: 2, alignItems: "flex-start" }}>
      <div style={{ display: "flex", alignItems: "center", gap: 5 }}>
        <span style={{ fontSize: 11, fontWeight: 600 }}>{pattern.pattern_label}</span>
        <span
          style={{
            fontSize: 9,
            fontWeight: 700,
            padding: "2px 5px",
            borderRadius: 3,
            background: setupBg,
            color: setupColor,
            textTransform: "uppercase",
          }}
        >
          {setupLabel}
        </span>
        {extraCount > 0 && (
          <span className="hint" style={{ fontSize: 9 }}>
            +{extraCount}
          </span>
        )}
      </div>
      <div className="hint tabular" style={{ fontSize: 9 }}>
        RR {pattern.rr.toFixed(1)} · {(pattern.pattern_quality * 100).toFixed(0)}%
      </div>
    </div>
  );
}

function SortHead({
  k,
  label,
  sortKey,
  dir,
  onToggle,
  num,
  style,
}: {
  k: SortKey;
  label: string;
  sortKey: SortKey;
  dir: SortDir;
  onToggle: (k: SortKey) => void;
  num?: boolean;
  style?: React.CSSProperties;
}) {
  const active = sortKey === k;
  return (
    <th
      className={num ? "num" : ""}
      style={{ ...style, cursor: "pointer", userSelect: "none" }}
      onClick={() => onToggle(k)}
    >
      <span style={{ display: "inline-flex", alignItems: "center", gap: 4 }}>
        {label}
        <span style={{ opacity: active ? 1 : 0.3, fontSize: 9 }}>
          {active ? (dir === "asc" ? "▲" : "▼") : "▲▼"}
        </span>
      </span>
    </th>
  );
}

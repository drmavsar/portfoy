import { CATS, PEOPLE } from "@/lib/sample/data";

export function PersonChip({ id, size = "md" }: { id: string; size?: "md" | "sm" }) {
  const p = PEOPLE.find((x) => x.id === id);
  if (!p) return <span className="chip">—</span>;
  return (
    <span className={`chip ${size === "sm" ? "chip-sm" : ""}`}>
      <span className="chip-dot" style={{ background: p.color }} />
      {p.name}
    </span>
  );
}

export function CatChip({ id, size = "md" }: { id: string; size?: "md" | "sm" }) {
  const c = CATS.find((x) => x.id === id);
  if (!c) return <span className="chip">{id}</span>;
  return (
    <span
      className={`chip ${size === "sm" ? "chip-sm" : ""}`}
      style={{ borderColor: "transparent", background: "var(--surface-3)" }}
    >
      <span style={{ color: c.color, fontSize: 12 }}>{c.icon}</span> {c.name}
    </span>
  );
}

export function ConfPill({ conf }: { conf: number }) {
  const color =
    conf >= 90 ? "var(--positive)" : conf >= 70 ? "var(--warning)" : "var(--negative)";
  return (
    <span
      style={{
        display: "inline-flex",
        alignItems: "center",
        gap: 6,
        fontFamily: "var(--font-mono)",
        fontSize: 11,
        color,
      }}
    >
      <span style={{ width: 6, height: 6, borderRadius: 50, background: color }} />%{conf}
    </span>
  );
}

export function PolarityBadge({ kind }: { kind: "positive" | "negative" | "neutral" }) {
  const map = {
    positive: { color: "var(--positive)", bg: "var(--positive-soft)", label: "Pozitif" },
    negative: { color: "var(--negative)", bg: "var(--negative-soft)", label: "Negatif" },
    neutral: { color: "var(--muted)", bg: "var(--surface-2)", label: "Nötr" },
  };
  const m = map[kind] ?? map.neutral;
  return (
    <span
      style={{
        fontSize: 10,
        padding: "1px 6px",
        borderRadius: 3,
        color: m.color,
        background: m.bg,
        fontWeight: 600,
      }}
    >
      {m.label}
    </span>
  );
}

export const FLAG_INFO = {
  BREAKOUT: { glyph: "↗", label: "Breakout", color: "var(--positive)" },
  BASE_FORMING: { glyph: "◻", label: "Baz Oluşum", color: "var(--accent)" },
  DIVERGENCE: { glyph: "★", label: "Divergence", color: "var(--warning)" },
  VOLUME_SURGE: { glyph: "⚡", label: "Hacim Patlaması", color: "var(--c-amber)" },
  SECTOR_LEADER: { glyph: "◈", label: "Sektör Lideri", color: "var(--c-violet)" },
} as const;

export type FlagKind = keyof typeof FLAG_INFO;

export function FlagBadge({ kind }: { kind: FlagKind }) {
  const f = FLAG_INFO[kind];
  if (!f) return null;
  return (
    <span
      data-tip={f.label}
      style={{
        display: "inline-grid",
        placeItems: "center",
        width: 18,
        height: 18,
        borderRadius: 4,
        background: "var(--surface-3)",
        color: f.color,
        fontSize: 11,
        fontWeight: 600,
      }}
    >
      {f.glyph}
    </span>
  );
}

import { fmt } from "@/lib/finance/fmt";

export function W52Band({
  low,
  high,
  last,
  width = 72,
}: {
  low: number;
  high: number;
  last: number;
  width?: number;
}) {
  const pos = Math.max(0, Math.min(1, (last - low) / (high - low)));
  return (
    <div
      style={{
        display: "flex",
        alignItems: "center",
        gap: 6,
        fontSize: 10,
        color: "var(--muted)",
      }}
    >
      <span className="tabular">{fmt.k(low)}</span>
      <div
        style={{
          position: "relative",
          width,
          height: 6,
          background:
            "linear-gradient(to right, var(--negative-soft), var(--warning-soft), var(--positive-soft))",
          borderRadius: 99,
        }}
      >
        <div
          style={{
            position: "absolute",
            left: `calc(${pos * 100}% - 4px)`,
            top: -2,
            width: 8,
            height: 10,
            background: "var(--fg)",
            borderRadius: 2,
          }}
        />
      </div>
      <span className="tabular">{fmt.k(high)}</span>
    </div>
  );
}

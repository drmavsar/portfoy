import type { ReactNode } from "react";

/* Bütün durum etiketleri metin ve şekil taşır; renk ek ipucudur. */

export type Signal = "strong" | "medium" | "weak";

const SIGNAL: Record<Signal, { label: string; cls: string; bars: number }> = {
  strong: { label: "Güçlü", cls: "chip-pos", bars: 3 },
  medium: { label: "Orta", cls: "chip-warn", bars: 2 },
  weak: { label: "Zayıf", cls: "chip-neutral", bars: 1 },
};

export function SignalChip({ level }: { level: Signal }) {
  const s = SIGNAL[level];
  return (
    <span className={`chip ${s.cls}`}>
      <svg width="14" height="12" viewBox="0 0 14 12" aria-hidden>
        {[
          [0, 7, 5],
          [5, 4, 8],
          [10, 0, 12],
        ].map(([x, y, h], i) => (
          <rect key={x} x={x} y={y} width="3" height={h} rx="1" fill="currentColor" fillOpacity={i < s.bars ? 1 : 0.25} />
        ))}
      </svg>
      {s.label}
    </span>
  );
}

export type Importance = "high" | "medium" | "low";

const IMPORTANCE: Record<Importance, { label: string; cls: string; dots: number }> = {
  high: { label: "Yüksek", cls: "chip-warn", dots: 3 },
  medium: { label: "Orta", cls: "chip-info", dots: 2 },
  low: { label: "Düşük", cls: "chip-neutral", dots: 1 },
};

export function ImportanceChip({ level }: { level: Importance }) {
  const m = IMPORTANCE[level];
  return (
    <span className={`chip ${m.cls}`}>
      <span aria-hidden style={{ letterSpacing: 1 }}>
        {"●".repeat(m.dots)}
        <span style={{ opacity: 0.3 }}>{"●".repeat(3 - m.dots)}</span>
      </span>
      {m.label}
    </span>
  );
}

export type Zone = "safe" | "grey" | "distress";

export function ZoneChip({ zone }: { zone: Zone }) {
  if (zone === "safe") {
    return (
      <span className="chip chip-pos">
        <svg width="14" height="14" viewBox="0 0 14 14" aria-hidden>
          <circle cx="7" cy="7" r="6" fill="none" stroke="currentColor" strokeWidth="1.6" />
          <path d="m4 7 2 2 4-4" fill="none" stroke="currentColor" strokeWidth="1.6" />
        </svg>
        Güvenli
      </span>
    );
  }
  if (zone === "grey") {
    return (
      <span className="chip chip-neutral" style={{ color: "var(--fg-soft)" }}>
        <svg width="14" height="14" viewBox="0 0 14 14" aria-hidden>
          <circle cx="7" cy="7" r="6" fill="none" stroke="currentColor" strokeWidth="1.6" />
          <path d="M7 1a6 6 0 0 1 0 12Z" fill="currentColor" />
        </svg>
        Gri
      </span>
    );
  }
  return (
    <span className="chip chip-neg">
      <svg width="14" height="14" viewBox="0 0 14 14" aria-hidden>
        <path d="M7 1.5 13 12.5H1Z" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinejoin="round" />
        <path d="M7 5.5v3.2M7 10.4v.1" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" />
      </svg>
      Sıkıntı
    </span>
  );
}

/** Kategori / kişi / hesap etiketi. `onClick` verilirse listeyi filtreleyen düğme olur. */
export function TagChip({
  label,
  color,
  initial,
  icon,
  size = "md",
  onClick,
}: {
  label: string;
  /** Kategori rengi (kare nokta). */
  color?: string;
  /** Kişi baş harfi (yuvarlak avatar). */
  initial?: string;
  icon?: ReactNode;
  size?: "md" | "sm";
  onClick?: () => void;
}) {
  const body = (
    <>
      {color && <span className="chip-dot" style={{ background: color }} />}
      {initial && size === "md" && <span className="chip-avatar">{initial}</span>}
      {icon}
      {label}
    </>
  );
  const cls = `chip${size === "sm" ? " chip-sm" : ""}`;
  return onClick ? (
    <button type="button" className={cls} onClick={onClick} title={`${label} — bu değere göre süz`}>
      {body}
    </button>
  ) : (
    <span className={cls}>{body}</span>
  );
}

/** Aktif filtre çipi: "Kategori: Market ✕". */
export function FilterChip({ label, value, onRemove }: { label: string; value: string; onRemove: () => void }) {
  return (
    <span className="filter-chip">
      {label}: {value}
      <button type="button" onClick={onRemove} aria-label={`${label} filtresini kaldır`}>
        <svg width="10" height="10" viewBox="0 0 10 10" aria-hidden>
          <path d="m2 2 6 6M8 2 2 8" stroke="currentColor" strokeWidth="1.6" />
        </svg>
      </button>
    </span>
  );
}

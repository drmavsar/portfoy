"use client";

import { useRef, type KeyboardEvent, type ReactNode } from "react";

export interface SegmentOption<V extends string> {
  value: V;
  label: ReactNode;
  disabled?: boolean;
}

interface SegmentedProps<V extends string> {
  options: SegmentOption<V>[];
  value: V;
  onChange: (v: V) => void;
  /** Ekran okuyucu için grup adı, ör. "Dönem". */
  label: string;
  disabled?: boolean;
  /** Tam genişlik, eşit sütunlar (ör. pencerede Gider / Gelir). */
  block?: boolean;
  /** Zemin --surface (pencere içinde --surface-2 üstünde). */
  onSurface?: boolean;
  className?: string;
}

/**
 * Segment kontrol — uygulamada tek stil. role="radiogroup"; klavyede ok
 * tuşları, Home ve End ile gezilir, seçim odakla birlikte değişir.
 */
export function Segmented<V extends string>({
  options,
  value,
  onChange,
  label,
  disabled,
  block,
  onSurface,
  className,
}: SegmentedProps<V>) {
  const refs = useRef<Array<HTMLButtonElement | null>>([]);
  const enabled = options.map((o, i) => (o.disabled || disabled ? -1 : i)).filter((i) => i >= 0);

  const move = (e: KeyboardEvent<HTMLButtonElement>, index: number) => {
    const pos = enabled.indexOf(index);
    let next: number | undefined;
    if (e.key === "ArrowRight" || e.key === "ArrowDown") next = enabled[(pos + 1) % enabled.length];
    else if (e.key === "ArrowLeft" || e.key === "ArrowUp") next = enabled[(pos - 1 + enabled.length) % enabled.length];
    else if (e.key === "Home") next = enabled[0];
    else if (e.key === "End") next = enabled[enabled.length - 1];
    if (next === undefined) return;
    e.preventDefault();
    refs.current[next]?.focus();
    onChange(options[next].value);
  };

  const cls = ["seg", block ? "seg-block" : "", onSurface ? "seg-on-surface" : "", className ?? ""]
    .filter(Boolean)
    .join(" ");

  return (
    <div role="radiogroup" aria-label={label} aria-disabled={disabled || undefined} className={cls}>
      {options.map((o, i) => {
        const checked = o.value === value;
        return (
          <button
            key={o.value}
            ref={(el) => {
              refs.current[i] = el;
            }}
            type="button"
            role="radio"
            aria-checked={checked}
            tabIndex={checked ? 0 : -1}
            disabled={disabled || o.disabled}
            className="seg-item"
            onClick={() => onChange(o.value)}
            onKeyDown={(e) => move(e, i)}
          >
            {o.label}
          </button>
        );
      })}
    </div>
  );
}

export type PeriodKey = "month" | "ytd" | "last30" | "last90" | "all" | "custom";

export const PERIOD_OPTIONS: SegmentOption<PeriodKey>[] = [
  { value: "month", label: "Bu Ay" },
  { value: "ytd", label: "YTD" },
  { value: "last30", label: "Son 30" },
  { value: "last90", label: "Son 90" },
  { value: "all", label: "Tümü" },
  { value: "custom", label: "Özel" },
];

/** Dönem seçici (masaüstü). Mobilde tek satırlık seçici + alt çekmece kullanılır. */
export function PeriodPicker({ value, onChange }: { value: PeriodKey; onChange: (v: PeriodKey) => void }) {
  return <Segmented label="Dönem" options={PERIOD_OPTIONS} value={value} onChange={onChange} />;
}

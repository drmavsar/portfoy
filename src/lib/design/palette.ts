/**
 * Petrol Masa grafik paleti — tek kaynak.
 *
 * Varlık sınıfı rengi uygulamanın her yerinde aynıdır ve başka bir anlam için
 * kullanılmaz. Değerler CSS değişkenidir; koyu/açık tema karşılıkları
 * globals.css'te tanımlı. SVG fill/stroke, recharts ve color-mix() içinde
 * doğrudan kullanılabilir (hex'e `${c}22` gibi alfa eklemeyin).
 */

export type AssetClassKey = "equity" | "fund" | "metal" | "cash" | "fx" | "crypto" | "other";

export const ASSET_CLASS: Record<AssetClassKey, { label: string; color: string }> = {
  equity: { label: "Hisse", color: "var(--c-blue)" },
  fund: { label: "Fon", color: "var(--c-violet)" },
  metal: { label: "Altın-Gümüş", color: "var(--c-amber)" },
  cash: { label: "Nakit", color: "var(--c-sky)" },
  fx: { label: "Döviz", color: "var(--c-lime)" },
  crypto: { label: "Kripto", color: "var(--c-rose)" },
  other: { label: "Diğer", color: "var(--c-slate)" },
};

/** Kategori/kişi gibi sırası olan seriler için sabit sıra (ilk 6, kalanlar slate). */
export const SERIES_ORDER = [
  "var(--c-blue)",
  "var(--c-violet)",
  "var(--c-amber)",
  "var(--c-sky)",
  "var(--c-lime)",
  "var(--c-rose)",
] as const;

export function seriesColor(index: number): string {
  return SERIES_ORDER[index] ?? "var(--c-slate)";
}

/** Karşılaştırma serileri: renk + çizgi deseni (desen rengin yerine geçebilen ikinci ayırt edici). */
export const BENCHMARK_SERIES = {
  portfolio: { label: "Portföy", color: "var(--c-teal)", width: 3, dash: undefined },
  bist100: { label: "BIST 100", color: "var(--c-blue)", width: 2, dash: undefined },
  gold: { label: "Altın", color: "var(--c-amber)", width: 2, dash: "6 3" },
  usd: { label: "Dolar", color: "var(--c-lime)", width: 2, dash: "2 3" },
  deposit: { label: "Mevduat", color: "var(--c-slate)", width: 2, dash: "8 3 2 3" },
  inflation: { label: "Enflasyon", color: "var(--muted-2)", width: 2, dash: "4 4" },
} as const;

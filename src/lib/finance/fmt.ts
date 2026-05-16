/* ============================================================
   Format helpers — claude/design'dan birebir taşındı.
   ============================================================ */

export const fmt = {
  tr(n: number | null | undefined, d = 0): string {
    if (n == null || Number.isNaN(n)) return "—";
    return Number(n).toLocaleString("tr-TR", {
      minimumFractionDigits: d,
      maximumFractionDigits: d,
    });
  },
  k(n: number | null | undefined): string {
    if (n == null || Number.isNaN(n)) return "—";
    const abs = Math.abs(n);
    if (abs >= 1_000_000)
      return (
        (n / 1_000_000).toLocaleString("tr-TR", { maximumFractionDigits: 1 }) +
        " M"
      );
    if (abs >= 1_000)
      return (
        (n / 1_000).toLocaleString("tr-TR", { maximumFractionDigits: 1 }) + " B"
      );
    return n.toLocaleString("tr-TR");
  },
  try(n: number | null | undefined, d = 0): string {
    return fmt.tr(n, d) + " ₺";
  },
  pct(n: number | null | undefined, d = 1): string {
    if (n == null || Number.isNaN(n)) return "—";
    return (n >= 0 ? "+" : "") + fmt.tr(n, d) + "%";
  },
  trydp(n: number | null | undefined): string {
    return fmt.tr(n, 2) + " ₺";
  },
};

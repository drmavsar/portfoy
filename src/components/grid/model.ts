// Keep currency buckets separate; round each transaction to minor units before summing.
export function moneyTotals<T>(rows: T[], amount: (row: T) => number, currency: (row: T) => string): string {
  const totals = new Map<string, number>();
  for (const row of rows) {
    const code = currency(row);
    const digits = new Intl.NumberFormat("tr", { style: "currency", currency: code }).resolvedOptions().maximumFractionDigits ?? 2;
    const scale = 10 ** digits;
    totals.set(code, (totals.get(code) ?? 0) + Math.round(amount(row) * scale));
  }
  return [...totals].sort(([a], [b]) => a.localeCompare(b)).map(([code, minor]) => {
    const f = new Intl.NumberFormat("tr", { style: "currency", currency: code });
    return f.format(minor / 10 ** (f.resolvedOptions().maximumFractionDigits ?? 2));
  }).join(" · ") || "—";
}

export function csvCell(value: string | number | null): string {
  const raw = String(value ?? "");
  const safe = typeof value === "string" && /^[\s]*[=+@-]/.test(raw) ? "'" + raw : raw;
  return '"' + safe.replaceAll('"', '""') + '"';
}

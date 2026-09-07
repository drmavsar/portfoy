/** Quantities are comparable only within the same instrument, even if symbols collide. */
export function quantityTotals<T>(rows: T[], assetId: (row: T) => string, label: (row: T) => string, quantity: (row: T) => number): string {
  const totals = new Map<string, { label: string; quantity: number }>();
  for (const row of rows) {
    const id = assetId(row);
    const entry = totals.get(id) ?? { label: label(row), quantity: 0 };
    entry.quantity += quantity(row);
    totals.set(id, entry);
  }
  if (totals.size > 3) return `${totals.size} farklı varlık · Adet toplamları için sembole göre gruplayın`;
  return [...totals.values()].map(t => `${t.label}: ${t.quantity.toLocaleString("tr-TR", { maximumFractionDigits: 8 })} adet`).join(" · ") || "—";
}

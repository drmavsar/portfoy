import type { RawTxn } from "@/app/(app)/_lib/reports-actions";

export function overviewActivity(rows: RawTxn[], from: string, to: string, person: string) {
  const filtered = rows.filter(r => (r.direction === "inflow" || r.direction === "outflow") && r.occurred_on.slice(0, 10) >= from && r.occurred_on.slice(0, 10) <= to && (!person || (r.beneficiary_id ?? "__none__") === person));
  const totals = new Map<string, { income: number; expense: number; scale: number }>();
  for (const row of filtered) {
    const scale = 10 ** (new Intl.NumberFormat("tr", { style: "currency", currency: row.currency }).resolvedOptions().maximumFractionDigits ?? 2);
    const total = totals.get(row.currency) ?? { income: 0, expense: 0, scale };
    total[row.direction === "inflow" ? "income" : "expense"] += Math.round(Number(row.amount) * scale);
    totals.set(row.currency, total);
  }
  return {
    count: filtered.length,
    recent: [...filtered].sort((a, b) => b.occurred_on.localeCompare(a.occurred_on)).slice(0, 8),
    totals: [...totals].sort(([a], [b]) => a.localeCompare(b)).map(([currency, t]) => ({ currency, income: t.income / t.scale, expense: t.expense / t.scale, net: (t.income - t.expense) / t.scale })),
  };
}

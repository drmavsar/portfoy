import type { AccountRow } from "./actions";

export function nativeBalance(a: AccountRow): number | null {
  return a.currency === "TRY" ? a.balance_try ?? a.opening_balance ?? null : a.balance_native;
}
export function accountTryValue(a: AccountRow, rates: Record<string, number | undefined>): number | null {
  if (a.currency === "TRY") return nativeBalance(a);
  const rate = rates[a.currency];
  if (a.balance_native != null && rate != null) return Number(a.balance_native) * rate;
  return a.balance_try;
}
export function nativeTotals(rows: AccountRow[]): string {
  const totals = new Map<string, number>();
  let missing = 0;
  for (const row of rows) {
    const balance = nativeBalance(row);
    if (balance == null) { missing++; continue; }
    totals.set(row.currency, (totals.get(row.currency) ?? 0) + Number(balance));
  }
  const text = [...totals].sort(([a], [b]) => a.localeCompare(b)).map(([unit, value]) => `${value.toLocaleString("tr-TR", { maximumFractionDigits: 8 })} ${unit}`).join(" · ") || "—";
  return text + (missing ? ` · ${missing} hesapta birim bakiyesi eksik` : "");
}

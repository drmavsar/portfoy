import type { RawTxn } from "@/app/(app)/_lib/reports-actions";

export interface Period { from: string; to: string }
export type ComparisonMode = "period" | "month";
const day = 86_400_000;
function parseDate(s: string): number {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(s)) return NaN;
  const n = Date.parse(`${s}T00:00:00Z`);
  return Number.isFinite(n) && new Date(n).toISOString().slice(0, 10) === s ? n : NaN;
}
export function previousPeriod(period: Period, mode: ComparisonMode): Period | null {
  const from = parseDate(period.from), to = parseDate(period.to);
  if (!Number.isFinite(from) || !Number.isFinite(to) || from > to) return null;
  const iso = (n: number) => new Date(n).toISOString().slice(0, 10);
  if (mode === "period") return { from: iso(from - (to - from + day)), to: iso(from - day) };
  const shift = (n: number) => {
    const d = new Date(n);
    const last = new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), 0)).getUTCDate();
    return iso(Date.UTC(d.getUTCFullYear(), d.getUTCMonth() - 1, Math.min(d.getUTCDate(), last)));
  };
  return { from: shift(from), to: shift(to) };
}
export interface ComparisonCell { current: number; previous: number; delta: number; percent: number | null }
export function comparisonCell(current: number, previous: number): ComparisonCell {
  return { current, previous, delta: current - previous, percent: previous === 0 ? null : (current - previous) / previous * 100 };
}
export function expenseMatrix(txns: RawTxn[], period: Period, previous: Period, currency: string, people: string[], categoryFilter: string) {
  const cells = new Map<string, { current: number; previous: number }>();
  const personIds = new Set<string>(), categoryIds = new Set<string>();
  const digits = new Intl.NumberFormat("tr", { style: "currency", currency }).resolvedOptions().maximumFractionDigits ?? 2;
  const scale = 10 ** digits;
  for (const t of txns) {
    const person = t.beneficiary_id ?? "__none__", category = t.category_id ?? "__none__";
    if (t.direction !== "outflow" || t.currency !== currency || (people.length && !people.includes(person)) || (categoryFilter && category !== categoryFilter)) continue;
    const date = t.occurred_on.slice(0, 10);
    const current = date >= period.from && date <= period.to;
    const old = date >= previous.from && date <= previous.to;
    if (!current && !old) continue;
    personIds.add(person); categoryIds.add(category);
    const key = JSON.stringify([category, person]);
    const cell = cells.get(key) ?? { current: 0, previous: 0 };
    const minor = Math.round(Number(t.amount) * scale);
    if (current) cell.current += minor;
    if (old) cell.previous += minor;
    cells.set(key, cell);
  }
  const get = (category: string | null, person: string | null): ComparisonCell => {
    let current = 0, previous = 0;
    for (const [key, cell] of cells) {
      const [c, p] = JSON.parse(key) as string[];
      if ((category == null || c === category) && (person == null || p === person)) { current += cell.current; previous += cell.previous; }
    }
    return comparisonCell(current / scale, previous / scale);
  };
  return { personIds: [...personIds], categoryIds: [...categoryIds], get };
}

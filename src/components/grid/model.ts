export interface ValueColumn<T> {
  id: string;
  value: (row: T) => string | number | null;
}
export type SortRule = { id: string; desc: boolean };

export function filterAndSort<T>(rows: T[], columns: ValueColumn<T>[], filters: Record<string, string>, sort: SortRule[]): T[] {
  const byId = new Map(columns.map(c => [c.id, c]));
  return rows.filter(row => Object.entries(filters).every(([id, query]) => {
    const c = byId.get(id);
    return !c || String(c.value(row) ?? "").toLocaleLowerCase("tr").includes(query.toLocaleLowerCase("tr"));
  })).sort((a, b) => {
    for (const rule of sort) {
      const c = byId.get(rule.id);
      if (!c) continue;
      const av = c.value(a), bv = c.value(b);
      // Missing values stay at the end in either direction.
      if (av == null && bv != null) return 1;
      if (bv == null && av != null) return -1;
      const cmp = typeof av === "number" && typeof bv === "number"
        ? av - bv : String(av ?? "").localeCompare(String(bv ?? ""), "tr");
      if (cmp) return rule.desc ? -cmp : cmp;
    }
    return 0;
  });
}

export interface Group<T> { key: string; label: string; rows: T[]; children: Group<T>[] }
export function groupRows<T>(rows: T[], columns: ValueColumn<T>[], ids: string[], path: string[] = []): Group<T>[] {
  const column = columns.find(c => c.id === ids[0]);
  if (!column) return [];
  const buckets = new Map<string, T[]>();
  for (const row of rows) {
    const label = String(column.value(row) ?? "Atanmamış");
    const bucket = buckets.get(label);
    if (bucket) bucket.push(row); else buckets.set(label, [row]);
  }
  return [...buckets].map(([label, items]) => {
    const next = [...path, column.id, label];
    return { key: JSON.stringify(next), label, rows: items, children: groupRows(items, columns, ids.slice(1), next) };
  });
}

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

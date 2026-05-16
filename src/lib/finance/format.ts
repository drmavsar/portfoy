const TRY_FMT = new Intl.NumberFormat("tr-TR", {
  style: "currency",
  currency: "TRY",
  maximumFractionDigits: 2,
});

const NUM_FMT = new Intl.NumberFormat("tr-TR", { maximumFractionDigits: 2 });

const PCT_FMT = new Intl.NumberFormat("tr-TR", {
  style: "percent",
  minimumFractionDigits: 1,
  maximumFractionDigits: 2,
});

const DATE_FMT = new Intl.DateTimeFormat("tr-TR", {
  day: "2-digit",
  month: "2-digit",
  year: "numeric",
});

export function formatTRY(value: number | null | undefined): string {
  if (value === null || value === undefined || Number.isNaN(value)) return "—";
  return TRY_FMT.format(value);
}

export function formatNumber(value: number | null | undefined, digits = 2): string {
  if (value === null || value === undefined || Number.isNaN(value)) return "—";
  return new Intl.NumberFormat("tr-TR", {
    maximumFractionDigits: digits,
    minimumFractionDigits: digits,
  }).format(value);
}

export function formatPercent(value: number | null | undefined): string {
  if (value === null || value === undefined || Number.isNaN(value)) return "—";
  return PCT_FMT.format(value);
}

export function formatDate(value: string | Date | null | undefined): string {
  if (!value) return "—";
  const d = typeof value === "string" ? new Date(value) : value;
  return DATE_FMT.format(d);
}

export function formatCompactTRY(value: number | null | undefined): string {
  if (value === null || value === undefined || Number.isNaN(value)) return "—";
  return new Intl.NumberFormat("tr-TR", {
    notation: "compact",
    style: "currency",
    currency: "TRY",
    maximumFractionDigits: 1,
  }).format(value);
}

export { NUM_FMT };

import Papa from "papaparse";
import * as XLSX from "xlsx";

import type { TxnDirection } from "@/lib/types/database";

import type { ParseResult, ParsedStatementRow } from "./types";

const TRY_DATE_PATTERNS = [
  /^(\d{2})\.(\d{2})\.(\d{4})$/,   // 12.03.2025
  /^(\d{2})\/(\d{2})\/(\d{4})$/,   // 12/03/2025
  /^(\d{4})-(\d{2})-(\d{2})$/,     // 2025-03-12
];

export function parseTrDate(
  input: string | number | Date | null | undefined,
): string | null {
  if (input === null || input === undefined || input === "") return null;
  if (input instanceof Date) return toIso(input);
  if (typeof input === "number") {
    const d = XLSX.SSF.parse_date_code(input);
    if (!d) return null;
    return `${d.y.toString().padStart(4, "0")}-${d.m
      .toString()
      .padStart(2, "0")}-${d.d.toString().padStart(2, "0")}`;
  }
  const trimmed = input.toString().trim();
  for (const pat of TRY_DATE_PATTERNS) {
    const m = trimmed.match(pat);
    if (!m) continue;
    if (pat === TRY_DATE_PATTERNS[2]) return `${m[1]}-${m[2]}-${m[3]}`;
    return `${m[3]}-${m[2]}-${m[1]}`;
  }
  const parsed = new Date(trimmed);
  return Number.isNaN(parsed.valueOf()) ? null : toIso(parsed);
}

function toIso(d: Date): string {
  return `${d.getFullYear()}-${(d.getMonth() + 1)
    .toString()
    .padStart(2, "0")}-${d.getDate().toString().padStart(2, "0")}`;
}

export function parseTrAmount(
  raw: string | number | null | undefined,
): { amount: number; direction: TxnDirection } | null {
  if (raw === null || raw === undefined || raw === "") return null;
  if (typeof raw === "number") {
    if (raw === 0) return { amount: 0, direction: "outflow" };
    return { amount: Math.abs(raw), direction: raw < 0 ? "outflow" : "inflow" };
  }
  const cleaned = raw
    .toString()
    .replace(/\s/g, "")
    .replace(/(TL|TRY|₺)/gi, "")
    .replace(/\./g, "")
    .replace(",", ".");
  const num = Number(cleaned);
  if (Number.isNaN(num)) return null;
  if (num === 0) return { amount: 0, direction: "outflow" };
  return { amount: Math.abs(num), direction: num < 0 ? "outflow" : "inflow" };
}

const HEADER_ALIASES = {
  date: ["tarih", "i̇şlem tarihi", "islem tarihi", "valör", "valor", "date"],
  description: [
    "açıklama",
    "aciklama",
    "işlem",
    "işlem açıklaması",
    "islem aciklamasi",
    "description",
    "detay",
  ],
  merchant: ["üye işyeri", "uye isyeri", "merchant", "isyeri"],
  amount: ["tutar", "tutar(tl)", "miktar", "amount"],
  debit: ["borç", "borc", "çıkan", "cikan", "debit"],
  credit: ["alacak", "giren", "credit"],
  currency: ["para birimi", "döviz", "doviz", "currency"],
};

function pickHeader(headers: string[], aliases: string[]): string | null {
  const normalized = headers.map((h) => h.toString().trim().toLowerCase());
  for (const alias of aliases) {
    const idx = normalized.indexOf(alias);
    if (idx >= 0) return headers[idx];
  }
  for (const alias of aliases) {
    const idx = normalized.findIndex((h) => h.includes(alias));
    if (idx >= 0) return headers[idx];
  }
  return null;
}

export function rowsFromHeaders(
  raw: Record<string, unknown>[],
  headers: string[],
): { rows: ParsedStatementRow[]; warnings: string[] } {
  const hDate = pickHeader(headers, HEADER_ALIASES.date);
  const hDesc = pickHeader(headers, HEADER_ALIASES.description);
  const hMerchant = pickHeader(headers, HEADER_ALIASES.merchant);
  const hAmount = pickHeader(headers, HEADER_ALIASES.amount);
  const hDebit = pickHeader(headers, HEADER_ALIASES.debit);
  const hCredit = pickHeader(headers, HEADER_ALIASES.credit);
  const hCurrency = pickHeader(headers, HEADER_ALIASES.currency);

  const warnings: string[] = [];
  if (!hDate) warnings.push("Tarih kolonu bulunamadı.");
  if (!hAmount && !(hDebit || hCredit))
    warnings.push("Tutar / Borç / Alacak kolonu bulunamadı.");

  const out: ParsedStatementRow[] = [];

  for (const r of raw) {
    const dateRaw = hDate ? r[hDate] : null;
    const iso = parseTrDate(dateRaw as string | number | Date | null);
    if (!iso) continue;

    let amount: number | null = null;
    let direction: TxnDirection = "outflow";

    if (hAmount) {
      const parsed = parseTrAmount(r[hAmount] as string | number | null);
      if (!parsed) continue;
      amount = parsed.amount;
      direction = parsed.direction;
    } else if (hDebit || hCredit) {
      const d = hDebit ? parseTrAmount(r[hDebit] as string | number | null) : null;
      const c = hCredit ? parseTrAmount(r[hCredit] as string | number | null) : null;
      if (d && d.amount > 0) {
        amount = d.amount;
        direction = "outflow";
      } else if (c && c.amount > 0) {
        amount = c.amount;
        direction = "inflow";
      } else {
        continue;
      }
    }
    if (amount === null) continue;

    const description = hDesc ? (r[hDesc] ?? "").toString().trim() : null;
    const merchant = hMerchant
      ? (r[hMerchant] ?? "").toString().trim()
      : description;
    const currency = hCurrency ? (r[hCurrency] ?? "TRY").toString().trim() : "TRY";

    out.push({
      occurredOn: iso,
      amount,
      direction,
      currency: currency || "TRY",
      description: description || null,
      merchantRaw: merchant || null,
    });
  }

  return { rows: out, warnings };
}

export function parseGenericCsv(text: string): ParseResult {
  const result = Papa.parse<Record<string, unknown>>(text, {
    header: true,
    skipEmptyLines: "greedy",
    transformHeader: (h) => h.toString().trim(),
  });

  if (result.errors.length > 0) {
    return {
      rows: [],
      warnings: result.errors.map((e) => `${e.row}: ${e.message}`),
      sourceHeaders: result.meta.fields ?? [],
      format: "generic-csv",
    };
  }

  const headers = result.meta.fields ?? [];
  const { rows, warnings } = rowsFromHeaders(result.data, headers);
  return { rows, warnings, sourceHeaders: headers, format: "generic-csv" };
}

export function parseGenericXlsx(buf: ArrayBuffer): ParseResult {
  const wb = XLSX.read(buf, { type: "array" });
  const sheetName = wb.SheetNames[0];
  if (!sheetName) {
    return {
      rows: [],
      warnings: ["Excel dosyasında sayfa bulunamadı."],
      sourceHeaders: [],
      format: "generic-xlsx",
    };
  }
  const ws = wb.Sheets[sheetName];
  const json = XLSX.utils.sheet_to_json<Record<string, unknown>>(ws, {
    defval: null,
    raw: false,
  });
  const headers = Object.keys(json[0] ?? {});
  const { rows, warnings } = rowsFromHeaders(json, headers);
  return { rows, warnings, sourceHeaders: headers, format: "generic-xlsx" };
}

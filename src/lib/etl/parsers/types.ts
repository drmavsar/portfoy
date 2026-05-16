import type { TxnDirection } from "@/lib/types/database";

/**
 * Normalized row produced by every parser, regardless of source format.
 * Downstream classifier consumes only this shape.
 */
export interface ParsedStatementRow {
  occurredOn: string; // ISO YYYY-MM-DD
  amount: number; // always positive
  direction: TxnDirection;
  currency: string;
  description: string | null;
  merchantRaw: string | null;
  /** Optional category hint supplied by the source (e.g. Garanti "Etiket"). */
  sourceCategoryHint?: string | null;
  /** Optional bonus/cashback amount (Garanti BBVA Bonus). */
  bonusAmount?: number | null;
}

export interface ParseResult {
  rows: ParsedStatementRow[];
  warnings: string[];
  sourceHeaders: string[];
  /** Detected card last4, when present in the statement metadata. */
  detectedCardLast4?: string | null;
  /** Detected bank format. */
  format: StatementFormat;
}

export type StatementFormat = "garanti-bonus" | "generic-csv" | "generic-xlsx";

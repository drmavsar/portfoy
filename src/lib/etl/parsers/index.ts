import { parseGarantiBonus, inspectGarantiSheet } from "./garanti";
import { parseGenericCsv, parseGenericXlsx } from "./generic";
import type { ParseResult } from "./types";

export type { ParsedStatementRow, ParseResult, StatementFormat } from "./types";
export {
  parseTrAmount,
  parseTrDate,
  parseGenericCsv,
  parseGenericXlsx,
} from "./generic";
export {
  parseGarantiBonus,
  inspectGarantiSheet,
  GARANTI_TAG_TO_CATEGORY_SLUG,
} from "./garanti";

export interface ParseInput {
  fileName: string;
  contentType?: string;
  csvText?: string;
  xlsxBuffer?: ArrayBuffer;
}

/**
 * Single entry-point. Detects format from file metadata + sheet content,
 * dispatches to the correct parser, and returns a normalized result.
 */
export function parseStatement(input: ParseInput): ParseResult {
  const lower = input.fileName.toLowerCase();
  const isXlsx =
    lower.endsWith(".xlsx") ||
    lower.endsWith(".xls") ||
    input.contentType?.includes("excel") ||
    input.contentType?.includes("spreadsheet");

  if (isXlsx && input.xlsxBuffer) {
    const garantiHints = inspectGarantiSheet(input.xlsxBuffer);
    if (garantiHints) {
      return parseGarantiBonus(input.xlsxBuffer);
    }
    return parseGenericXlsx(input.xlsxBuffer);
  }
  if (input.csvText) {
    return parseGenericCsv(input.csvText);
  }
  return {
    rows: [],
    warnings: ["Dosya formatı tanınmadı."],
    sourceHeaders: [],
    format: "generic-csv",
  };
}

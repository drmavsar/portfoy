import * as XLSX from "xlsx";

import { parseTrAmount, parseTrDate } from "./generic";
import type { ParseResult, ParsedStatementRow } from "./types";

/**
 * Parser for Garanti BBVA "Bonus" credit-card statement exports
 * (Ekstre İşlemleri TL).
 *
 * Sheet layout (observed on real statements, May 2026):
 *   row 0: "5549 **** **** 1023 Numaralı Kart TL Ekstre Bilgileri"
 *   row 1: ["Tarih","İşlem","Etiket","Bonus","Tutar(TL)"]
 *   row 2+: data rows
 *
 * Conventions:
 * - Tutar < 0  → outflow (purchase)
 * - Tutar > 0  → inflow  (payment / refund / cashback)
 * - "Etiket" carries Garanti's own category guess; we surface it as
 *   a `sourceCategoryHint` so the classifier can prefer it when no
 *   user rule fires.
 */

const CARD_LAST4_RE = /(\d{4})\s+Numaralı\s+Kart/i;

export interface GarantiHints {
  detectedCardLast4: string | null;
}

export function inspectGarantiSheet(buf: ArrayBuffer): GarantiHints | null {
  try {
    const wb = XLSX.read(buf, { type: "array" });
    const sheet = wb.Sheets[wb.SheetNames[0]];
    if (!sheet) return null;
    const json = XLSX.utils.sheet_to_json<Record<string, unknown>>(sheet, {
      header: 1,
      defval: null,
      raw: false,
    });
    const header0 = (json[0]?.[0 as unknown as keyof typeof json[0]] ?? "")
      .toString()
      .trim();
    const header1 = (json[1] ?? []) as unknown as string[];
    const isGaranti =
      CARD_LAST4_RE.test(header0) ||
      (Array.isArray(header1) &&
        header1.map((s) => (s ?? "").toString().trim()).join("|") ===
          "Tarih|İşlem|Etiket|Bonus|Tutar(TL)");
    if (!isGaranti) return null;
    const m = header0.match(CARD_LAST4_RE);
    return { detectedCardLast4: m ? m[1] : null };
  } catch {
    return null;
  }
}

export function parseGarantiBonus(buf: ArrayBuffer): ParseResult {
  const wb = XLSX.read(buf, { type: "array" });
  const sheet = wb.Sheets[wb.SheetNames[0]];
  if (!sheet) {
    return {
      rows: [],
      warnings: ["Excel dosyasında sayfa bulunamadı."],
      sourceHeaders: [],
      format: "garanti-bonus",
    };
  }

  // Use header:1 to get raw rows; Garanti layout puts the table header
  // on row index 1, not row 0.
  const matrix = XLSX.utils.sheet_to_json<unknown[]>(sheet, {
    header: 1,
    defval: null,
    raw: false,
  });

  const meta = (matrix[0]?.[0] ?? "").toString().trim();
  const cardMatch = meta.match(CARD_LAST4_RE);
  const cardLast4 = cardMatch ? cardMatch[1] : null;

  const header = (matrix[1] ?? []).map((c) => (c ?? "").toString().trim());
  const idx = {
    date: header.indexOf("Tarih"),
    desc: header.indexOf("İşlem"),
    tag: header.indexOf("Etiket"),
    bonus: header.indexOf("Bonus"),
    amount: header.indexOf("Tutar(TL)"),
  };

  const warnings: string[] = [];
  if (idx.date < 0) warnings.push("Tarih kolonu bulunamadı.");
  if (idx.amount < 0) warnings.push("Tutar kolonu bulunamadı.");

  const rows: ParsedStatementRow[] = [];

  for (let i = 2; i < matrix.length; i++) {
    const row = matrix[i] ?? [];
    const rawDate = row[idx.date] as string | number | Date | null;
    const iso = parseTrDate(rawDate);
    if (!iso) continue;

    const rawAmount = row[idx.amount] as string | number | null;
    const parsed = parseTrAmount(rawAmount);
    if (!parsed || parsed.amount === 0) {
      // Lines with empty Tutar (e.g. "BONUS MARKET KAMPANYASI") carry
      // only a bonus value — surface them as inflows tagged Bonus so the
      // user can decide whether to recognize them as income.
      const rawBonus = row[idx.bonus] as string | number | null;
      const bonus = parseTrAmount(rawBonus);
      if (!bonus || bonus.amount === 0) continue;
      rows.push({
        occurredOn: iso,
        amount: bonus.amount,
        direction: "inflow",
        currency: "TRY",
        description: (row[idx.desc] ?? "").toString().trim() || null,
        merchantRaw: (row[idx.desc] ?? "").toString().trim() || null,
        sourceCategoryHint: "Bonus",
        bonusAmount: bonus.amount,
      });
      continue;
    }

    const desc = (row[idx.desc] ?? "").toString().trim();
    const tag = (row[idx.tag] ?? "").toString().trim();
    const rawBonus = row[idx.bonus] as string | number | null;
    const bonus = parseTrAmount(rawBonus);

    rows.push({
      occurredOn: iso,
      amount: parsed.amount,
      direction: parsed.direction,
      currency: "TRY",
      description: desc || null,
      merchantRaw: desc || null,
      sourceCategoryHint: tag || null,
      bonusAmount: bonus?.amount ?? null,
    });
  }

  return {
    rows,
    warnings,
    sourceHeaders: header,
    format: "garanti-bonus",
    detectedCardLast4: cardLast4,
  };
}

/**
 * Map Garanti's own "Etiket" labels to our slug-based categories.
 * Used by the classifier as a hint when no explicit rule fires.
 */
export const GARANTI_TAG_TO_CATEGORY_SLUG: Record<string, string> = {
  Market: "market",
  "Yeme / İçme": "yeme-icme",
  Ulaşım: "ulasim",
  Akaryakıt: "ulasim",
  Sağlık: "saglik",
  Giyim: "giyim",
  Elektronik: "diger-expense",
  "Kart Ödemesi": "kk-odeme",
  "Kurum Ödemesi": "faturalar",
  Telekom: "faturalar",
  "Konaklama": "eglence",
  Bonus: "diger-income",
  Diğer: "diger-expense",
};

import crypto from "node:crypto";

import {
  GARANTI_TAG_TO_CATEGORY_SLUG,
  type ParsedStatementRow,
} from "@/lib/etl/parsers";
import type { DraftInsert, RuleRow, TxnDirection } from "@/lib/types/database";

/**
 * Detect installment notation in a description (e.g. "1/6", "TAKSIT 02/12").
 */
const INSTALLMENT_RE = /(?:^|\b)(\d{1,2})\s*\/\s*(\d{1,2})(?:\b|$)/;

export function detectInstallment(
  description: string | null | undefined,
): { seq: number; total: number } | null {
  if (!description) return null;
  const m = description.match(INSTALLMENT_RE);
  if (!m) return null;
  const seq = Number(m[1]);
  const total = Number(m[2]);
  if (seq < 1 || total < 2 || seq > total) return null;
  return { seq, total };
}

/**
 * Normalize a merchant string: uppercase, collapse whitespace, strip
 * common branch suffixes ("GULBAHCE", numeric store codes).
 */
export function cleanMerchant(raw: string | null | undefined): string | null {
  if (!raw) return null;
  return raw
    .toString()
    .toUpperCase()
    .replace(/İ/g, "I")
    .replace(/Ş/g, "S")
    .replace(/Ç/g, "C")
    .replace(/Ö/g, "O")
    .replace(/Ü/g, "U")
    .replace(/Ğ/g, "G")
    .replace(/[*#\-_]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

export function dedupeHash(
  accountId: string,
  occurredOn: string,
  amount: number,
  direction: TxnDirection,
  description: string | null,
): string {
  const h = crypto.createHash("sha256");
  h.update(`${accountId}|${occurredOn}|${amount.toFixed(2)}|${direction}|${description ?? ""}`);
  return h.digest("hex");
}

interface ClassifyArgs {
  userId: string;
  accountId: string;
  importId: string;
  rows: ParsedStatementRow[];
  rules: RuleRow[];
  /** slug → category UUID resolver, used to map source category hints. */
  categoryBySlug?: Map<string, string>;
}

export interface ClassifyResult {
  drafts: DraftInsert[];
  ruleHits: Map<string, number>;
}

/**
 * Run the rule engine over parsed rows and produce DraftInsert payloads.
 * First-match wins (rules pre-sorted by priority ascending).
 */
export function classify({
  userId,
  accountId,
  importId,
  rows,
  rules,
  categoryBySlug,
}: ClassifyArgs): ClassifyResult {
  const sortedRules = [...rules]
    .filter((r) => r.is_enabled)
    .sort((a, b) => a.priority - b.priority);
  const hits = new Map<string, number>();
  const drafts: DraftInsert[] = [];

  for (const r of rows) {
    const merchantClean = cleanMerchant(r.merchantRaw ?? r.description);
    const installment = detectInstallment(r.description);
    const description = (r.description ?? "").toLowerCase();
    const merchantLower = (r.merchantRaw ?? "").toLowerCase();

    const match = sortedRules.find((rule) => {
      if (rule.match_account_id && rule.match_account_id !== accountId) return false;
      if (rule.match_direction && rule.match_direction !== r.direction) return false;
      if (rule.match_min_amount !== null && r.amount < rule.match_min_amount) return false;
      if (rule.match_max_amount !== null && r.amount > rule.match_max_amount) return false;
      if (rule.match_merchant_ilike) {
        const needle = rule.match_merchant_ilike.replace(/%/g, "").toLowerCase();
        if (!merchantLower.includes(needle)) return false;
      }
      if (rule.match_description_ilike) {
        const needle = rule.match_description_ilike.replace(/%/g, "").toLowerCase();
        if (!description.includes(needle)) return false;
      }
      if (rule.match_regex) {
        try {
          if (!new RegExp(rule.match_regex, "i").test(r.merchantRaw ?? "")) return false;
        } catch {
          return false;
        }
      }
      return true;
    });

    if (match) hits.set(match.id, (hits.get(match.id) ?? 0) + 1);

    // Source category hint (Garanti "Etiket") — only used when no user
    // rule matched, so manual rules always win.
    let hintedCategoryId: string | null = null;
    let hintConfidence: number | null = null;
    if (!match?.set_category_id && r.sourceCategoryHint && categoryBySlug) {
      const slug = GARANTI_TAG_TO_CATEGORY_SLUG[r.sourceCategoryHint];
      if (slug) {
        hintedCategoryId = categoryBySlug.get(slug) ?? null;
        if (hintedCategoryId) hintConfidence = 70;
      }
    }

    const decision: DraftInsert["decision"] = match?.set_ignore ? "ignore" : "pending";

    drafts.push({
      user_id: userId,
      import_id: importId,
      account_id: accountId,
      raw: {
        description: r.description,
        merchant: r.merchantRaw,
        currency: r.currency,
        source_tag: r.sourceCategoryHint ?? null,
        bonus: r.bonusAmount ?? null,
      },
      occurred_on: r.occurredOn,
      amount: r.amount,
      direction: r.direction,
      currency: r.currency,
      merchant_raw: r.merchantRaw,
      merchant_clean: merchantClean,
      suggested_category_id: match?.set_category_id ?? hintedCategoryId,
      suggested_beneficiary_id: match?.set_beneficiary_id ?? null,
      suggested_is_transfer: match?.set_is_transfer ?? false,
      suggested_counter_account_id: match?.set_counter_account_id ?? null,
      suggested_installment_total:
        match?.set_installment_total ?? installment?.total ?? null,
      matched_rule_id: match?.id ?? null,
      confidence:
        match?.confidence ?? hintConfidence ?? (installment ? 60 : null),
      decision,
      hash_dedupe: dedupeHash(accountId, r.occurredOn, r.amount, r.direction, r.description),
    });
  }

  return { drafts, ruleHits: hits };
}

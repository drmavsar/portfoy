"use server";

import { isSupabaseConfigured } from "@/app/(app)/ayarlar/actions";
import { createClient } from "@/lib/supabase/server";
import { getFund } from "./funds-actions";
import { resolveTaxRulePure, toISODate } from "./tax-rules-logic";
import type {
  FundTaxKind,
  FundTaxRule,
  ResolvedTaxRule,
  TaxRulesAuditEntry,
} from "./types";

interface TaxRulesFilter {
  fundCode?: string;
  categoryId?: number;
  taxKind?: FundTaxKind;
  activeOnly?: boolean;
}

export async function listTaxRules(filter: TaxRulesFilter = {}): Promise<FundTaxRule[]> {
  if (!(await isSupabaseConfigured())) return [];
  const supabase = await createClient();
  let q = supabase
    .from("fund_tax_rules")
    .select("*")
    .order("priority", { ascending: false })
    .order("effective_from", { ascending: false });

  if (filter.fundCode) q = q.eq("fund_code", filter.fundCode);
  if (filter.categoryId !== undefined) q = q.eq("category_id", filter.categoryId);
  if (filter.taxKind) q = q.eq("tax_kind", filter.taxKind);
  if (filter.activeOnly) q = q.eq("is_active", true);

  const { data, error } = await q;
  if (error) {
    console.error("listTaxRules error", error);
    return [];
  }
  return (data ?? []) as FundTaxRule[];
}

export async function listTaxRulesAudit(ruleId?: string): Promise<TaxRulesAuditEntry[]> {
  if (!(await isSupabaseConfigured())) return [];
  const supabase = await createClient();
  let q = supabase
    .from("tax_rules_audit")
    .select("*")
    .order("changed_at", { ascending: false });
  if (ruleId) q = q.eq("rule_id", ruleId);
  const { data, error } = await q;
  if (error) {
    console.error("listTaxRulesAudit error", error);
    return [];
  }
  return (data ?? []) as TaxRulesAuditEntry[];
}

/**
 * Bir fon için efektif stopaj kuralını çözer. DB wrapper; gerçek karar
 * mantığı `resolveTaxRulePure` içinde (test edilebilirlik için).
 */
export async function resolveTaxRule(
  fundCode: string,
  acquiredAt: Date | string,
  soldAt: Date | string,
): Promise<ResolvedTaxRule> {
  const noneResult: ResolvedTaxRule = {
    rule: null,
    effective_rate: null,
    confidence: "NONE",
    kind: "BELIRSIZ",
    source: "NONE",
  };

  const fund = await getFund(fundCode);
  if (!fund) return noneResult;

  const rules = await listTaxRules({ activeOnly: true });

  const supabase = await createClient();
  const { data: cat } = await supabase
    .from("fund_categories")
    .select("default_tax_kind")
    .eq("id", fund.category_id)
    .maybeSingle();
  const defaultKind =
    ((cat as { default_tax_kind?: FundTaxKind } | null)?.default_tax_kind ?? "BELIRSIZ");

  return resolveTaxRulePure(
    fund,
    rules,
    defaultKind,
    toISODate(acquiredAt),
    toISODate(soldAt),
  );
}

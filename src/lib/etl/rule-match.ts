/**
 * Sınıflandırma kurallarının eşleştirmesi — ekstre yükleme (ekstre/actions.ts)
 * ve CSV içe aktarma (classifier.ts) aynı kuralları aynı biçimde uygular.
 *
 * - Desen SQL ILIKE'tır: % = herhangi bir dizi, _ = tek karakter. Birden fazla
 *   % olabilir ("%TRENDYOL%YEMEK%").
 * - Türkçe harf ve büyük/küçük farkı yok sayılır: "%MİGROS%" kuralı "MIGROS"
 *   satırını, "%ÖZLEM KURT%" kuralı "OZLEM KURT" satırını yakalar.
 * - Alanlar ayrı ayrı çözülür: kategori, kategori koyan ilk eşleşen kuraldan;
 *   kişi, kişi koyan ilk eşleşen kuraldan gelir. Böylece "MIGROS ALYANS →
 *   Çayırova Ev" gibi yalnız kişi koyan özel bir kural, genel "MIGROS → Market"
 *   kuralının kategorisini bozmaz.
 */
import { foldTr } from "@/lib/fold-tr";

/** SQL ILIKE deseni → RegExp (Türkçe katlanmış metinle karşılaştırılır). */
export function ilikeToRegExp(pattern: string): RegExp {
  const escaped = foldTr(pattern).replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const re = escaped.replace(/%/g, ".*").replace(/_/g, ".");
  return new RegExp("^" + re + "$", "is");
}

export function ilikeMatches(pattern: string, text: string): boolean {
  return ilikeToRegExp(pattern).test(foldTr(text));
}

export interface MatchableRule {
  match_merchant_ilike: string | null;
  match_description_ilike: string | null;
  set_category_id: string | null;
  set_beneficiary_id: string | null;
  set_is_transfer: boolean | null;
}

/** Kuralın metin koşulları (işyeri ve açıklama, ikisi de verilmişse VE). */
export function ruleTextMatches(rule: MatchableRule, merchant: string, description: string): boolean {
  if (!rule.match_merchant_ilike && !rule.match_description_ilike) return false;
  if (rule.match_merchant_ilike && !ilikeMatches(rule.match_merchant_ilike, merchant)) return false;
  if (rule.match_description_ilike && !ilikeMatches(rule.match_description_ilike, description)) return false;
  return true;
}

export interface ResolvedRule<R> {
  /** İlk eşleşen kural (transfer / yok say / taksit gibi alanlar bundan) */
  first: R | null;
  category_id: string | null;
  beneficiary_id: string | null;
}

/**
 * `rules` öncelik sırasında olmalı. `matches` ek koşulları (hesap, yön, tutar)
 * da kontrol edebilir; varsayılan yalnız metin koşulları.
 */
export function resolveRules<R extends MatchableRule>(
  rules: R[],
  matches: (rule: R) => boolean,
): ResolvedRule<R> {
  let first: R | null = null;
  let category_id: string | null = null;
  let beneficiary_id: string | null = null;
  for (const r of rules) {
    if (!matches(r)) continue;
    first ??= r;
    category_id ??= r.set_category_id;
    beneficiary_id ??= r.set_beneficiary_id;
    if (category_id && beneficiary_id) break;
  }
  return { first, category_id, beneficiary_id };
}

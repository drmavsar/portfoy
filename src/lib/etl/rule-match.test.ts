import { describe, expect, it } from "vitest";

import { ilikeMatches, ilikeToRegExp, resolveRules, ruleTextMatches, type MatchableRule } from "./rule-match";
import { classify } from "./classifier";
import type { RuleRow } from "@/lib/types/database";

const rule = (o: Partial<MatchableRule>): MatchableRule => ({
  match_merchant_ilike: null,
  match_description_ilike: null,
  set_category_id: null,
  set_beneficiary_id: null,
  set_is_transfer: null,
  ...o,
});

describe("ilikeMatches", () => {
  it("Türkçe harf ve büyük/küçük farkını yok sayar", () => {
    expect(ilikeMatches("%MİGROS%", "MIGROS ALYANS MUTLUKENT KOCAELI")).toBe(true);
    expect(ilikeMatches("%MIGROS%", "MİGROS ALYANS MUTLUKENT KOCAELİ")).toBe(true);
    expect(ilikeMatches("%ÖZLEM KURT%", "OZLEM KURT IZMIR")).toBe(true);
    expect(ilikeMatches("%ULUÇINAR VERGİ%", "41202-ULUCINAR VERGI DAIR(2/3) KOCAELI")).toBe(true);
    expect(ilikeMatches("%ENGIN ELCI%", "Engin Elçi-PAZAR -FAST-CEP ŞUBE-1776000108")).toBe(true);
  });
  it("birden fazla % ve _ joker", () => {
    expect(ilikeMatches("%TRENDYOL%YEMEK%", "TRENDYOL GO YEMEK ISTANBUL")).toBe(true);
    expect(ilikeMatches("%TRENDYOL%YEMEK%", "TRENDYOL ISTANBUL")).toBe(false);
    expect(ilikeMatches("%PALGAZ 4543__%", "PALGAZ 454317 70846929")).toBe(true);
  });
  it("% yoksa tam eşleşme ister; nokta ve parantez düz karakterdir", () => {
    expect(ilikeMatches("A101", "A101 IYTE")).toBe(false);
    expect(ilikeMatches("%A.B%", "XAXB")).toBe(false);
    expect(ilikeMatches("%(2/3)%", "MAPFRE(2/3) ISTANBUL")).toBe(true);
    expect(ilikeToRegExp("%A.B%").test("XA.BY")).toBe(true);
  });
});

describe("resolveRules", () => {
  const generic = rule({ match_merchant_ilike: "%MIGROS%", set_category_id: "cat-market" });
  const specific = rule({ match_merchant_ilike: "%MIGROS ALYANS%", set_beneficiary_id: "ben-cayirova" });
  const izmir = rule({ match_merchant_ilike: "%MIGROS%IZMIR%", set_beneficiary_id: "ben-ahmet", set_is_transfer: false });

  const run = (rules: MatchableRule[], merchant: string) =>
    resolveRules(rules, (r) => ruleTextMatches(r, merchant, ""));

  it("kategori ve kişi ayrı kurallardan gelebilir", () => {
    const r = run([specific, izmir, generic], "MİGROS ALYANS MUTLUKENT KOCAELİ");
    expect(r).toEqual({ first: specific, category_id: "cat-market", beneficiary_id: "ben-cayirova" });
  });
  it("ilk eşleşen kişi kazanır", () => {
    expect(run([izmir, specific, generic], "MIGROS ALYANS IZMIR").beneficiary_id).toBe("ben-ahmet");
  });
  it("eşleşme yoksa hepsi boş; metin koşulu olmayan kural eşleşmez", () => {
    expect(run([generic, rule({ set_category_id: "x" })], "BIM")).toEqual({
      first: null,
      category_id: null,
      beneficiary_id: null,
    });
  });
});

describe("classify", () => {
  const base: RuleRow = {
    id: "r",
    user_id: "u",
    name: "",
    priority: 100,
    is_enabled: true,
    match_account_id: null,
    match_card_last4: null,
    match_direction: null,
    match_min_amount: null,
    match_max_amount: null,
    match_merchant_ilike: null,
    match_description_ilike: null,
    match_regex: null,
    set_category_id: null,
    set_beneficiary_id: null,
    set_is_transfer: null,
    set_counter_account_id: null,
    set_installment_total: null,
    set_ignore: false,
    set_tag_ids: null,
    confidence: 95,
    hit_count: 0,
    last_hit_at: null,
    created_at: "",
    updated_at: "",
  };
  it("Türkçe desenle eşleşir, kişi daha sonraki kuraldan gelir", () => {
    const { drafts, ruleHits } = classify({
      userId: "u",
      accountId: "a",
      importId: "i",
      rows: [
        {
          occurredOn: "2026-10-01",
          amount: 120,
          direction: "outflow",
          currency: "TRY",
          description: "MIGROS ALYANS MUTLUKENT KOCAELI",
          merchantRaw: "MIGROS ALYANS MUTLUKENT KOCAELI",
        },
      ] as Parameters<typeof classify>[0]["rows"],
      rules: [
        { ...base, id: "cat", priority: 10, match_merchant_ilike: "%MİGROS%", set_category_id: "cat-market" },
        { ...base, id: "ben", priority: 20, match_merchant_ilike: "%MİGROS ALYANS%", set_beneficiary_id: "ben-ev" },
      ],
    });
    expect(drafts[0].suggested_category_id).toBe("cat-market");
    expect(drafts[0].suggested_beneficiary_id).toBe("ben-ev");
    expect(drafts[0].matched_rule_id).toBe("cat");
    expect(ruleHits.get("cat")).toBe(1);
  });
});

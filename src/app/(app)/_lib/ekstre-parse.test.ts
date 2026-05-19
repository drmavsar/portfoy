import { describe, expect, it } from "vitest";

import {
  applyRule,
  categorySlugCandidates,
  ilikeToRegExp,
  parseTurkishAmount,
  parseTurkishDate,
  type ClassificationRule,
} from "./ekstre-parse";

describe("parseTurkishDate", () => {
  it("DD/MM/YYYY → YYYY-MM-DD", () => {
    expect(parseTurkishDate("04/05/2026")).toBe("2026-05-04");
    expect(parseTurkishDate("31/12/2025")).toBe("2025-12-31");
  });

  it("tek haneli gün/ay padding'liyor", () => {
    expect(parseTurkishDate("1/2/2026")).toBe("2026-02-01");
  });

  it("boşluk'lu trim'leniyor", () => {
    expect(parseTurkishDate("  15/06/2026  ")).toBe("2026-06-15");
  });

  it("geçersiz format → null", () => {
    expect(parseTurkishDate("2026-05-04")).toBeNull();
    expect(parseTurkishDate("05-04-2026")).toBeNull();
    expect(parseTurkishDate("abc")).toBeNull();
    expect(parseTurkishDate("")).toBeNull();
  });
});

describe("parseTurkishAmount", () => {
  it("negatif tutar → negatif sayı", () => {
    expect(parseTurkishAmount("-626,50")).toBe(-626.5);
  });

  it("pozitif tutar virgül-ondalık", () => {
    expect(parseTurkishAmount("379,50")).toBe(379.5);
  });

  it("binlik ayraç (nokta) ondalık (virgül)", () => {
    expect(parseTurkishAmount("1.234,56")).toBe(1234.56);
    expect(parseTurkishAmount("12.345.678,99")).toBe(12345678.99);
  });

  it("number tip doğrudan döner", () => {
    expect(parseTurkishAmount(123.45)).toBe(123.45);
  });

  it("boş veya geçersiz → null", () => {
    expect(parseTurkishAmount("")).toBeNull();
    expect(parseTurkishAmount(null)).toBeNull();
    expect(parseTurkishAmount("abc")).toBeNull();
    expect(parseTurkishAmount(undefined)).toBeNull();
  });

  it("NaN değil sonsuz değil → null", () => {
    expect(parseTurkishAmount(Number.NaN)).toBeNull();
    expect(parseTurkishAmount(Number.POSITIVE_INFINITY)).toBeNull();
  });
});

describe("categorySlugCandidates", () => {
  it("Market etiketi → market slug'ları", () => {
    expect(categorySlugCandidates("Market")).toContain("market");
  });

  it("Yeme / İçme → yeme-icme + restoran adayları", () => {
    const cands = categorySlugCandidates("Yeme / İçme");
    expect(cands).toContain("yeme-icme");
    expect(cands).toContain("restoran");
  });

  it("Eğitim → egitim", () => {
    expect(categorySlugCandidates("Eğitim")).toContain("egitim");
  });

  it("Türkçe karakter normalize ediliyor (ş→s, ç→c, ı→i, ö→o, ü→u, ğ→g)", () => {
    expect(categorySlugCandidates("Kişisel Hizmet")).toContain("kisisel-hizmet");
    expect(categorySlugCandidates("Sağlık")).toContain("saglik");
  });

  it("bilinmeyen etiket → boş", () => {
    expect(categorySlugCandidates("Bilinmeyen Garip Şey")).toEqual([]);
    expect(categorySlugCandidates("")).toEqual([]);
  });

  it("Kurum Ödemesi → dijital-platform", () => {
    expect(categorySlugCandidates("Kurum Ödemesi")).toContain("dijital-platform");
  });
});

describe("ilikeToRegExp", () => {
  it("% wildcard → .*", () => {
    expect(ilikeToRegExp("%MIGROS%").test("MIGROS ALYANS KOCAELI")).toBe(true);
    expect(ilikeToRegExp("%MIGROS%").test("A101 GULBAHCE")).toBe(false);
  });

  it("_ wildcard → tek karakter", () => {
    expect(ilikeToRegExp("A_BC").test("AXBC")).toBe(true);
    expect(ilikeToRegExp("A_BC").test("AABCC")).toBe(false);
  });

  it("case-insensitive", () => {
    expect(ilikeToRegExp("%spotify%").test("SPOTIFY P41165")).toBe(true);
    expect(ilikeToRegExp("%SPOTIFY%").test("spotify")).toBe(true);
  });

  it("regex meta karakterler escape ediliyor", () => {
    expect(ilikeToRegExp("%A.B%").test("XA.BY")).toBe(true);
    expect(ilikeToRegExp("%A.B%").test("XAXBY")).toBe(false); // . literal
  });
});

describe("applyRule", () => {
  const mkRule = (
    overrides: Partial<ClassificationRule>,
  ): ClassificationRule => ({
    match_merchant_ilike: null,
    match_description_ilike: null,
    set_category_id: null,
    set_beneficiary_id: null,
    set_is_transfer: null,
    ...overrides,
  });

  it("ilk eşleşen kural geri döner (priority sırasında)", () => {
    const rules = [
      mkRule({ match_merchant_ilike: "%MIGROS%", set_category_id: "cat-market" }),
      mkRule({ match_merchant_ilike: "%A101%", set_category_id: "cat-other" }),
    ];
    const r = applyRule(rules, "MIGROS ALYANS", "Market");
    expect(r.category_id).toBe("cat-market");
  });

  it("hiçbir kural eşleşmezse tüm alanlar null", () => {
    const rules = [mkRule({ match_merchant_ilike: "%MIGROS%", set_category_id: "x" })];
    const r = applyRule(rules, "BIM MARKET", "Market");
    expect(r).toEqual({ category_id: null, beneficiary_id: null, is_transfer: null });
  });

  it("description ilike eşleşmesi", () => {
    const rules = [
      mkRule({
        match_description_ilike: "%Cep Şube%",
        set_is_transfer: true,
      }),
    ];
    const r = applyRule(rules, "ANY MERCHANT", "Cep Şube Ödeme");
    expect(r.is_transfer).toBe(true);
  });

  it("merchant + description birlikte AND'leniyor", () => {
    const rules = [
      mkRule({
        match_merchant_ilike: "%IYZICO%",
        match_description_ilike: "%ERIKLI%",
        set_category_id: "cat-su",
      }),
    ];
    expect(
      applyRule(rules, "IYZICO/ERIKLI.COM.TR", "ERIKLI Su").category_id,
    ).toBe("cat-su");
    // Sadece merchant eşleşip description eşleşmezse → null
    expect(applyRule(rules, "IYZICO/AMAZON", "Giyim").category_id).toBeNull();
  });

  it("set_beneficiary_id propagate edilir", () => {
    const rules = [
      mkRule({ match_merchant_ilike: "%MIGROS%", set_beneficiary_id: "ben-ev" }),
    ];
    expect(applyRule(rules, "MIGROS", "Market").beneficiary_id).toBe("ben-ev");
  });
});

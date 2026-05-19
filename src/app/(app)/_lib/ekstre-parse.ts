/**
 * Ekstre parser saf compute helper'ları.
 *
 * Bu dosya "use server" değildir — sync fonksiyonlar barındırır ve vitest
 * tarafından doğrudan test edilebilir. ekstre/actions.ts buradan import eder.
 */

export interface ClassificationRule {
  match_merchant_ilike: string | null;
  match_description_ilike: string | null;
  set_category_id: string | null;
  set_beneficiary_id: string | null;
  set_is_transfer: boolean | null;
}

export function parseTurkishDate(s: string): string | null {
  const m = s.trim().match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})$/);
  if (!m) return null;
  const [, d, mo, y] = m;
  return `${y}-${mo.padStart(2, "0")}-${d.padStart(2, "0")}`;
}

export function parseTurkishAmount(input: unknown): number | null {
  if (typeof input === "number") return Number.isFinite(input) ? input : null;
  const s = String(input ?? "").trim().replace(/\s/g, "");
  if (!s) return null;
  const norm = s.replace(/\./g, "").replace(",", ".");
  const n = Number(norm);
  return Number.isFinite(n) ? n : null;
}

/** US format: 1,234.56 — binlik virgül, ondalık nokta */
export function parseAmountUS(input: unknown): number | null {
  if (typeof input === "number") return Number.isFinite(input) ? input : null;
  const s = String(input ?? "").trim().replace(/\s/g, "");
  if (!s) return null;
  const norm = s.replace(/,/g, "");
  const n = Number(norm);
  return Number.isFinite(n) ? n : null;
}

/** Otomatik format tespiti: son virgül son noktadan sonraysa TR, yoksa US.
 *  Tek ayraç (sadece . veya sadece ,) varsa son karakteri ondalık varsay. */
export function parseAmountAuto(input: unknown): number | null {
  if (typeof input === "number") return Number.isFinite(input) ? input : null;
  const s = String(input ?? "").trim();
  if (!s) return null;
  const lastDot = s.lastIndexOf(".");
  const lastComma = s.lastIndexOf(",");
  // Hiç ayraç yok
  if (lastDot === -1 && lastComma === -1) {
    const n = Number(s);
    return Number.isFinite(n) ? n : null;
  }
  // İkisi de var → son geleni ondalık say
  if (lastDot !== -1 && lastComma !== -1) {
    if (lastComma > lastDot) return parseTurkishAmount(input);
    return parseAmountUS(input);
  }
  // Sadece biri var: konuma bak. 3 hane'lik gruplar varsa muhtemelen binlik ayraç.
  // Basit kural: son ayraçtan sonra tam 2 (veya 1) hane varsa ondalık, 3 hane varsa binlik
  const sep = lastDot !== -1 ? "." : ",";
  const tail = s.length - 1 - (lastDot !== -1 ? lastDot : lastComma);
  if (tail === 2 || tail === 1) {
    // ondalık
    if (sep === ",") return parseTurkishAmount(input);
    return parseAmountUS(input);
  }
  // 3 hane → binlik ayraç, ondalık yok → tam sayı
  if (sep === ".") return parseTurkishAmount(input);
  return parseAmountUS(input);
}

export function categorySlugCandidates(etiket: string): string[] {
  const e = etiket
    .toLowerCase()
    .replace(/ı/g, "i")
    .replace(/ş/g, "s")
    .replace(/ç/g, "c")
    .replace(/ö/g, "o")
    .replace(/ü/g, "u")
    .replace(/ğ/g, "g");
  if (e.includes("market")) return ["market", "alisveris", "gida"];
  if (e.includes("yeme") || e.includes("icme") || e.includes("restoran"))
    return ["yeme-icme", "yiyecek-icecek", "restoran", "yemek", "yeme"];
  if (e.includes("ev") || e.includes("dekor"))
    return ["ev-dekorasyon", "ev", "dekorasyon", "mobilya"];
  if (e.includes("egitim") || e.includes("okul")) return ["egitim", "okul"];
  if (e.includes("kisisel") || e.includes("hizmet"))
    return ["kisisel-hizmet", "kisisel-bakim", "kisisel", "berber", "kuafor"];
  if (e.includes("eglence") || e.includes("hobi"))
    return ["eglence-hobi", "eglence", "hobi"];
  if (e.includes("saglik")) return ["saglik", "eczane"];
  if (e.includes("ulasim") || e.includes("benzin") || e.includes("akaryakit"))
    return ["ulasim", "akaryakit", "yakit", "ulaşim"];
  if (e.includes("giyim")) return ["giyim", "moda"];
  if (e.includes("teknoloji") || e.includes("elektronik"))
    return ["teknoloji", "elektronik"];
  if (e.includes("kurum") || e.includes("abonelik"))
    return ["dijital-platform", "abonelik"];
  if (e.includes("vergi")) return ["vergi"];
  return [];
}

/** SQL ILIKE pattern (%, _) → RegExp; case-insensitive */
export function ilikeToRegExp(pattern: string): RegExp {
  const escaped = pattern.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const re = escaped.replace(/%/g, ".*").replace(/_/g, ".");
  return new RegExp("^" + re + "$", "i");
}

export function applyRule(
  rules: ClassificationRule[],
  merchant: string,
  description: string,
): {
  category_id: string | null;
  beneficiary_id: string | null;
  is_transfer: boolean | null;
} {
  for (const r of rules) {
    let matched = false;
    if (r.match_merchant_ilike) {
      if (ilikeToRegExp(r.match_merchant_ilike).test(merchant)) matched = true;
      else continue;
    }
    if (r.match_description_ilike) {
      if (ilikeToRegExp(r.match_description_ilike).test(description)) matched = true;
      else continue;
    }
    if (matched) {
      return {
        category_id: r.set_category_id,
        beneficiary_id: r.set_beneficiary_id,
        is_transfer: r.set_is_transfer,
      };
    }
  }
  return { category_id: null, beneficiary_id: null, is_transfer: null };
}
